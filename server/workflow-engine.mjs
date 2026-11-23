import { audit } from './auth.mjs';
import { get, run, transaction } from './db.mjs';
import { HttpError, assertObject, hashPlan, id, now, sleep } from './util.mjs';
import { validateHandoff } from './messages.mjs';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REJECTED']);

export function createWorkflowEngine({ db, catalog, runtime, killSwitch }) {
  const active = new Map();

  function validateDefinition(definition) {
    assertObject(definition, 'Workflow definition must be an object');
    if (!Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > 20) throw new HttpError(400, 'Workflow must contain 1–20 steps', 'invalid_workflow');
    const ids = new Set();
    const errors = [];
    for (const [index, step] of definition.steps.entries()) {
      if (!step.id || ids.has(step.id)) errors.push(`step ${index + 1} has a duplicate or missing id`);
      ids.add(step.id);
      if (!catalog.roles.has(step.agent_id)) errors.push(`step ${index + 1} references an unknown agent`);
      if (!step.input_contract || !step.output_contract) errors.push(`step ${index + 1} requires input_contract and output_contract`);
      for (const dependency of step.depends_on || []) if (!definition.steps.some((candidate) => candidate.id === dependency)) errors.push(`step ${step.id} depends on unknown step ${dependency}`);
      if (step.retry_limit !== undefined && (!Number.isInteger(step.retry_limit) || step.retry_limit < 0 || step.retry_limit > 2)) errors.push(`step ${step.id} retry_limit must be 0–2`);
    }
    if (errors.length) throw new HttpError(400, 'Workflow definition is invalid', 'invalid_workflow', errors);
    const requestedConcurrency = Number(definition.max_concurrency || 1);
    if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1) errors.push('max_concurrency must be a positive integer');
    if (errors.length) throw new HttpError(400, 'Workflow definition is invalid', 'invalid_workflow', errors);
    return { ...definition, max_concurrency: Math.min(2, requestedConcurrency) };
  }

  function createWorkflow({ workspaceId, name, description = '', definition }) {
    const normalized = validateDefinition(definition);
    const workflowId = id('workflow');
    const timestamp = now();
    run(db, 'INSERT INTO workflows(id, workspace_id, name, description, definition_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [workflowId, workspaceId, name, description, JSON.stringify(normalized), 1, timestamp, timestamp]);
    return getWorkflow(workflowId, workspaceId);
  }

  function getWorkflow(workflowId, workspaceId) {
    const workflow = get(db, 'SELECT * FROM workflows WHERE id = ? AND workspace_id = ?', [workflowId, workspaceId]);
    if (!workflow) throw new HttpError(404, 'Workflow not found', 'workflow_not_found');
    return { ...workflow, definition: JSON.parse(workflow.definition_json) };
  }

  function listWorkflows(workspaceId) { return db.prepare('SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId).map((workflow) => ({ ...workflow, definition: JSON.parse(workflow.definition_json) })); }

  function createRun({ workspaceId, actorId, workflowId, input, authorization, idempotencyKey = null }) {
    const workflow = getWorkflow(workflowId, workspaceId);
    const definition = validateDefinition(workflow.definition);
    assertObject(input, 'Workflow input must be an object');
    if (idempotencyKey) { const existing = get(db, 'SELECT response_json FROM idempotency_keys WHERE key = ? AND workspace_id = ? AND operation = ?', [idempotencyKey, workspaceId, `workflow:${workflowId}`]); if (existing) return getRun(JSON.parse(existing.response_json).id, workspaceId); }
    const plans = definition.steps.map((step) => runtime.authorizationFor({ actorId, workspaceId, agentId: step.agent_id, requestedCapabilities: step.requested_capabilities || [], allowedTools: authorization.allowedTools || [], dataScope: authorization.dataScope || { mode: 'workflow_input_only' }, timeLimitMs: authorization.timeLimitMs || 15_000, budgetLimit: authorization.budgetLimit || definition.steps.length, approvalPolicy: 'required', explicitGrants: authorization.explicitGrants || [] }).plan);
    const plan = { workflow_id: workflowId, input, steps: plans, max_concurrency: definition.max_concurrency };
    const planHash = hashPlan(plan);
    const runId = id('run');
    const authId = id('auth');
    const correlationId = id('corr');
    const createdAt = now();
    const authorizationRecord = { actor_id: actorId, workspace_id: workspaceId, workflow_id: workflowId, requested_capabilities: [], allowed_tools: authorization.allowedTools || [], data_scope: authorization.dataScope || { mode: 'workflow_input_only' }, time_limit_ms: authorization.timeLimitMs || 15_000, budget_limit: authorization.budgetLimit || definition.steps.length, approval_policy: 'required', explicit_grants: authorization.explicitGrants || [] };
    transaction(db, () => {
      run(db, `INSERT INTO execution_authorizations(id, workspace_id, actor_id, workflow_id, requested_capabilities_json, allowed_tools_json, data_scope_json, time_limit_ms, budget_limit, approval_policy, explicit_grants_json, plan_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [authId, workspaceId, actorId, workflowId, '[]', JSON.stringify(authorizationRecord.allowed_tools), JSON.stringify(authorizationRecord.data_scope), authorizationRecord.time_limit_ms, authorizationRecord.budget_limit, 'required', JSON.stringify(authorizationRecord.explicit_grants), planHash, createdAt]);
      run(db, `INSERT INTO workflow_runs(id, workspace_id, workflow_id, status, input_json, authorization_id, plan_hash, correlation_id, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [runId, workspaceId, workflowId, 'DRAFT', JSON.stringify(input), authId, planHash, correlationId, idempotencyKey, createdAt]);
      definition.steps.forEach((step, index) => run(db, `INSERT INTO workflow_run_steps(id, workflow_run_id, step_index, step_id, agent_id, status, input_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id('step'), runId, index, step.id, step.agent_id, 'PENDING', JSON.stringify({ ...input, step_id: step.id })]));
      audit(db, { workspaceId, actorId, correlationId, eventType: 'WORKFLOW_RUN_CREATED', entityType: 'workflow_run', entityId: runId, payload: { workflowId, planHash } });
      if (idempotencyKey) run(db, 'INSERT INTO idempotency_keys(key, workspace_id, operation, response_json, created_at) VALUES (?, ?, ?, ?, ?)', [idempotencyKey, workspaceId, `workflow:${workflowId}`, JSON.stringify({ id: runId }), createdAt]);
    });
    return getRun(runId, workspaceId);
  }

  function getRun(runId, workspaceId) {
    const workflowRun = get(db, 'SELECT * FROM workflow_runs WHERE id = ? AND workspace_id = ?', [runId, workspaceId]);
    if (!workflowRun) throw new HttpError(404, 'Workflow run not found', 'workflow_run_not_found');
    const steps = db.prepare('SELECT * FROM workflow_run_steps WHERE workflow_run_id = ? ORDER BY step_index').all(runId).map((step) => ({ ...step, input: JSON.parse(step.input_json), output: step.output_json ? JSON.parse(step.output_json) : null, evidence: step.evidence_json ? JSON.parse(step.evidence_json) : null }));
    return { ...workflowRun, input: JSON.parse(workflowRun.input_json), output: workflowRun.output_json ? JSON.parse(workflowRun.output_json) : null, steps };
  }

  function requestApproval(runId, workspaceId, actorId) {
    const workflowRun = getRun(runId, workspaceId);
    if (workflowRun.status === 'DRAFT') run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['VALIDATED', runId]);
    transaction(db, () => { run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['AWAITING_APPROVAL', runId]); run(db, 'INSERT INTO approvals(id, workspace_id, workflow_run_id, plan_hash, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('approval'), workspaceId, runId, workflowRun.plan_hash, 'PENDING', actorId, now()]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_APPROVAL_REQUESTED', entityType: 'workflow_run', entityId: runId, payload: { planHash: workflowRun.plan_hash } }); });
    return getRun(runId, workspaceId);
  }

  function approveRun(runId, workspaceId, actorId, decision = 'APPROVED', reason = '') {
    const workflowRun = getRun(runId, workspaceId);
    const approval = get(db, 'SELECT * FROM approvals WHERE workflow_run_id = ? ORDER BY created_at DESC LIMIT 1', [runId]);
    if (!approval || approval.plan_hash !== workflowRun.plan_hash) throw new HttpError(409, 'Approval is missing or stale for the immutable workflow plan', 'stale_approval');
    const next = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    transaction(db, () => { run(db, 'UPDATE approvals SET status = ?, decided_by = ?, reason = ?, decided_at = ? WHERE id = ?', [next, actorId, reason, now(), approval.id]); run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', [next, runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: `WORKFLOW_${next}`, entityType: 'workflow_run', entityId: runId, payload: { planHash: workflowRun.plan_hash } }); });
    return getRun(runId, workspaceId);
  }

  function start(runId, workspaceId, actorId) {
    const workflowRun = getRun(runId, workspaceId);
    if (workflowRun.status !== 'APPROVED' && workflowRun.status !== 'RECOVERABLE') throw new HttpError(409, 'Workflow run must be approved before execution', 'approval_required');
    if (active.has(runId)) return workflowRun;
    const promise = execute(runId, workspaceId, actorId).finally(() => active.delete(runId));
    active.set(runId, promise);
    return getRun(runId, workspaceId);
  }

  async function execute(runId, workspaceId, actorId) {
    const workflowRun = getRun(runId, workspaceId);
    if (killSwitch()) throw new HttpError(423, 'Execution kill switch is active', 'kill_switch_active');
    const workflow = getWorkflow(workflowRun.workflow_id, workspaceId);
    const definition = workflow.definition;
    const auth = get(db, 'SELECT * FROM execution_authorizations WHERE id = ?', [workflowRun.authorization_id]);
    const authorization = { allowed_tools: JSON.parse(auth.allowed_tools_json), explicitGrants: JSON.parse(auth.explicit_grants_json), timeLimitMs: auth.time_limit_ms };
    transaction(db, () => { run(db, 'UPDATE workflow_runs SET status = ?, started_at = ? WHERE id = ?', ['RUNNING', now(), runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_STARTED', entityType: 'workflow_run', entityId: runId, payload: {} }); });
    const outputs = {};
    try {
      const pending = new Map(definition.steps.map((step, index) => [step.id, { step, index }]));
      const executeStep = async ({ step, index }) => {
        const current = getRun(runId, workspaceId);
        if (current.cancellation_requested) throw new HttpError(409, 'Workflow cancellation requested', 'cancelled');
        if (killSwitch()) throw new HttpError(423, 'Execution kill switch is active', 'kill_switch_active');
        const dependencies = step.depends_on || [];
        const missing = dependencies.filter((dependency) => outputs[dependency] === undefined);
        if (missing.length) throw new HttpError(409, `Dependencies are not complete: ${missing.join(', ')}`, 'dependency_failed');
        const input = { ...workflowRun.input, ...(step.input_template || {}), prior_outputs: outputs, step_input: step.input_template || {}, step_id: step.id };
        const maxAttempts = 1 + Number(step.retry_limit || 0);
        let result;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          run(db, 'UPDATE workflow_run_steps SET status = ?, attempts = ?, started_at = ? WHERE workflow_run_id = ? AND step_id = ?', ['RUNNING', attempt, now(), runId, step.id]);
          try { result = await withTimeout(runtime.deterministic(catalog.roles.get(step.agent_id), input, authorization, { db, catalog, workspaceId, workflowRunId: runId }), Math.min(authorization.timeLimitMs, 60_000)); break; } catch (error) { lastError = error; if (attempt < maxAttempts) await sleep(25 * attempt); }
        }
        if (!result) { run(db, 'UPDATE workflow_run_steps SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE workflow_run_id = ? AND step_id = ?', ['FAILED', lastError?.code || 'step_failed', lastError?.message || 'Step failed', now(), runId, step.id]); throw lastError || new HttpError(500, 'Step failed', 'step_failed'); }
        outputs[step.id] = result.result;
        transaction(db, () => {
          run(db, 'UPDATE workflow_run_steps SET status = ?, output_json = ?, evidence_json = ?, completed_at = ? WHERE workflow_run_id = ? AND step_id = ?', ['COMPLETED', JSON.stringify(result.result), JSON.stringify(result.evidence), now(), runId, step.id]);
          run(db, 'UPDATE workflow_runs SET current_step = ? WHERE id = ?', [index + 1, runId]);
          for (const dependent of definition.steps.filter((candidate) => (candidate.depends_on || []).includes(step.id))) {
            const handoff = validateHandoff({ sender_agent: step.agent_id, recipient_agent: dependent.agent_id, message_type: 'structured_handoff', input, output: result.result, evidence: result.evidence, authorization, correlation_id: workflowRun.correlation_id });
            run(db, 'INSERT INTO handoffs(id, workspace_id, workflow_id, workflow_run_id, sender_agent, recipient_agent, message_type, input_json, output_json, evidence_json, authorization_json, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id('handoff'), workspaceId, workflowRun.workflow_id, runId, handoff.sender_agent, handoff.recipient_agent, handoff.message_type, JSON.stringify(handoff.input), JSON.stringify(handoff.output), JSON.stringify(handoff.evidence), JSON.stringify(handoff.authorization), handoff.correlation_id, now()]);
          }
          audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_STEP_COMPLETED', entityType: 'workflow_run', entityId: runId, payload: { stepId: step.id, agentId: step.agent_id } });
        });
      };
      while (pending.size) {
        const ready = [...pending.values()].filter(({ step }) => (step.depends_on || []).every((dependency) => outputs[dependency] !== undefined));
        if (!ready.length) throw new HttpError(409, 'Workflow dependency graph contains a cycle or failed dependency', 'dependency_failed');
        const batch = ready.slice(0, definition.max_concurrency);
        batch.forEach(({ step }) => pending.delete(step.id));
        await Promise.all(batch.map(executeStep));
      }
      transaction(db, () => { run(db, 'UPDATE workflow_runs SET status = ?, output_json = ?, completed_at = ? WHERE id = ?', ['COMPLETED', JSON.stringify(outputs), now(), runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_COMPLETED', entityType: 'workflow_run', entityId: runId, payload: { steps: definition.steps.length } }); });
    } catch (error) {
      const status = error.code === 'cancelled' ? 'CANCELLED' : error.code === 'execution_timeout' ? 'TIMED_OUT' : 'FAILED';
      transaction(db, () => { run(db, 'UPDATE workflow_runs SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ?', [status, error.code || 'workflow_failed', error.message, now(), runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: `WORKFLOW_${status}`, entityType: 'workflow_run', entityId: runId, payload: { error: error.message } }); });
    }
    return getRun(runId, workspaceId);
  }

  function cancel(runId, workspaceId, actorId) { const workflowRun = getRun(runId, workspaceId); if (TERMINAL.has(workflowRun.status)) return workflowRun; transaction(db, () => { run(db, 'UPDATE workflow_runs SET cancellation_requested = 1, status = ? WHERE id = ?', ['CANCELLED', runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_CANCELLED', entityType: 'workflow_run', entityId: runId, payload: {} }); }); return getRun(runId, workspaceId); }
  function recover() { const runs = db.prepare("SELECT id FROM workflow_runs WHERE status = 'RUNNING'").all(); runs.forEach(({ id: runId }) => run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['RECOVERABLE', runId])); return runs.length; }
  return { validateDefinition, createWorkflow, getWorkflow, listWorkflows, createRun, getRun, requestApproval, approveRun, start, cancel, recover, active };
}

function withTimeout(promise, ms) { return Promise.race([promise, sleep(ms).then(() => { throw new HttpError(408, 'Workflow step timed out', 'execution_timeout'); })]); }
