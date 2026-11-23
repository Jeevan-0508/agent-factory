import { audit } from './auth.mjs';
import { get, run, transaction } from './db.mjs';
import { HttpError, assertObject, cancellationError, hashPlan, id, now, sleep, throwIfAborted } from './util.mjs';
import { validateHandoff } from './messages.mjs';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REJECTED']);

export function createWorkflowEngine({ db, catalog, runtime, killSwitch }) {
  const active = new Map();

  function validateDefinition(definition) {
    assertObject(definition, 'Workflow definition must be an object');
    if (!Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > 20) throw new HttpError(400, 'Workflow must contain 1–20 steps', 'invalid_workflow');
    const ids = new Set();
    const positions = new Map();
    const errors = [];
    for (const [index, step] of definition.steps.entries()) {
      if (!step || typeof step !== 'object') { errors.push(`step ${index + 1} must be an object`); continue; }
      if (typeof step.id !== 'string' || !step.id || ids.has(step.id)) errors.push(`step ${index + 1} has a duplicate or missing id`);
      ids.add(step.id); positions.set(step.id, index);
      if (!catalog.roles.has(step.agent_id)) errors.push(`step ${index + 1} references an unknown agent`);
      for (const [name, contract] of [['input_contract', step.input_contract], ['output_contract', step.output_contract]]) {
        if (!contract || contract.type !== 'object' || (contract.required !== undefined && (!Array.isArray(contract.required) || contract.required.some((key) => typeof key !== 'string')))) errors.push(`step ${step.id || index + 1} has an unsupported ${name}`);
      }
      if (step.input_template !== undefined && (!step.input_template || typeof step.input_template !== 'object' || Array.isArray(step.input_template))) errors.push(`step ${step.id || index + 1} input_template must be an object`);
      if (!Array.isArray(step.depends_on) && step.depends_on !== undefined) errors.push(`step ${step.id || index + 1} depends_on must be an array`);
      const dependencies = Array.isArray(step.depends_on) ? step.depends_on : [];
      if (new Set(dependencies).size !== dependencies.length) errors.push(`step ${step.id || index + 1} has duplicate dependencies`);
      for (const dependency of dependencies) {
        if (dependency === step.id) errors.push(`step ${step.id} cannot depend on itself`);
        if (!definition.steps.some((candidate) => candidate?.id === dependency)) errors.push(`step ${step.id} depends on unknown step ${dependency}`);
      }
      if (step.retry_limit !== undefined && (!Number.isInteger(step.retry_limit) || step.retry_limit < 0 || step.retry_limit > 2)) errors.push(`step ${step.id} retry_limit must be 0–2`);
    }
    for (const step of definition.steps) for (const dependency of Array.isArray(step?.depends_on) ? step.depends_on : []) if (positions.has(dependency) && positions.get(dependency) >= positions.get(step.id)) errors.push(`step ${step.id} must depend only on an earlier step: ${dependency}`);
    const indegree = new Map(definition.steps.map((step) => [step?.id, 0]));
    const edges = new Map(definition.steps.map((step) => [step?.id, []]));
    for (const step of definition.steps) for (const dependency of Array.isArray(step?.depends_on) ? step.depends_on : []) if (indegree.has(step?.id) && indegree.has(dependency)) { indegree.set(step.id, indegree.get(step.id) + 1); edges.get(dependency).push(step.id); }
    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([stepId]) => stepId);
    let visited = 0;
    while (queue.length) { const stepId = queue.shift(); visited += 1; for (const child of edges.get(stepId) || []) { indegree.set(child, indegree.get(child) - 1); if (indegree.get(child) === 0) queue.push(child); } }
    if (visited !== definition.steps.length) errors.push('workflow dependency graph contains a cycle');
    const requestedConcurrency = definition.max_concurrency === undefined ? 1 : Number(definition.max_concurrency);
    if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > 2) errors.push('max_concurrency must be an integer from 1 to 2');
    if (errors.length) throw new HttpError(400, 'Workflow definition is invalid', 'invalid_workflow', errors);
    return { ...definition, max_concurrency: requestedConcurrency, steps: definition.steps.map((step) => ({ ...step, depends_on: step.depends_on || [], input_template: step.input_template || {} })) };
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

  function createRun({ workspaceId, actorId, workflowId, input, authorization = {}, idempotencyKey = null }) {
    if (authorization.explicitGrants !== undefined) throw new HttpError(403, 'Client-controlled explicit grants are not accepted', 'client_grants_not_allowed');
    const workflow = getWorkflow(workflowId, workspaceId);
    const definition = validateDefinition(workflow.definition);
    assertObject(input, 'Workflow input must be an object');
    if (idempotencyKey) { const existing = get(db, 'SELECT response_json FROM idempotency_keys WHERE key = ? AND workspace_id = ? AND operation = ?', [idempotencyKey, workspaceId, `workflow:${workflowId}`]); if (existing) return getRun(JSON.parse(existing.response_json).id, workspaceId); }
    const plans = definition.steps.map((step) => runtime.authorizationFor({ actorId, workspaceId, agentId: step.agent_id, requestedCapabilities: step.requested_capabilities || [], allowedTools: authorization.allowedTools || [], dataScope: authorization.dataScope || { mode: 'workflow_input_only' }, timeLimitMs: authorization.timeLimitMs || 15_000, budgetLimit: authorization.budgetLimit || definition.steps.length, approvalPolicy: 'required', grantContext: authorization.grantContext || null }).plan);
    const plan = { workflow_id: workflowId, input, steps: plans, max_concurrency: definition.max_concurrency };
    const planHash = hashPlan(plan);
    const runId = id('run');
    const authId = id('auth');
    const correlationId = id('corr');
    const createdAt = now();
    const authorizationRecord = { actor_id: actorId, workspace_id: workspaceId, workflow_id: workflowId, requested_capabilities: [], allowed_tools: authorization.allowedTools || [], data_scope: authorization.dataScope || { mode: 'workflow_input_only' }, time_limit_ms: authorization.timeLimitMs || 15_000, budget_limit: authorization.budgetLimit || definition.steps.length, approval_policy: 'required', explicit_grants: [...new Set(plans.flatMap((planEntry) => planEntry.explicit_grants))], grant_context: authorization.grantContext || null };
    transaction(db, () => {
      run(db, `INSERT INTO execution_authorizations(id, workspace_id, actor_id, workflow_id, requested_capabilities_json, allowed_tools_json, data_scope_json, time_limit_ms, budget_limit, approval_policy, explicit_grants_json, plan_hash, grant_context_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [authId, workspaceId, actorId, workflowId, '[]', JSON.stringify(authorizationRecord.allowed_tools), JSON.stringify(authorizationRecord.data_scope), authorizationRecord.time_limit_ms, authorizationRecord.budget_limit, 'required', JSON.stringify(authorizationRecord.explicit_grants), planHash, JSON.stringify(authorizationRecord.grant_context || {}), createdAt]);
      run(db, `INSERT INTO workflow_runs(id, workspace_id, workflow_id, status, input_json, authorization_id, plan_hash, correlation_id, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [runId, workspaceId, workflowId, 'DRAFT', JSON.stringify(input), authId, planHash, correlationId, idempotencyKey, createdAt]);
      definition.steps.forEach((step, index) => run(db, `INSERT INTO workflow_run_steps(id, workflow_run_id, step_index, step_id, agent_id, status, input_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id('step'), runId, index, step.id, step.agent_id, 'PENDING', JSON.stringify({ ...input, ...step.input_template, step_id: step.id })]));
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

  function requestApproval(runId, workspaceId, actorId, { approvalMode = 'human' } = {}) {
    let workflowRun = getRun(runId, workspaceId);
    if (workflowRun.status === 'DRAFT') { run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['VALIDATED', runId]); workflowRun = getRun(runId, workspaceId); }
    if (workflowRun.status !== 'VALIDATED') throw new HttpError(409, `Approval can only be requested from VALIDATED, not ${workflowRun.status}`, 'invalid_state');
    if (!['human', 'demo'].includes(approvalMode)) throw new HttpError(400, 'Unsupported approval mode', 'invalid_approval_mode');
    if (approvalMode === 'demo') { const auth = get(db, 'SELECT grant_context_json FROM execution_authorizations WHERE id = ?', [workflowRun.authorization_id]); const grantContext = JSON.parse(auth?.grant_context_json || '{}'); if (grantContext.source !== 'offline-demo') throw new HttpError(403, 'Demonstration approval requires a trusted offline scenario', 'demo_approval_denied'); }
    transaction(db, () => { const changed = run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ? AND status = ?', ['AWAITING_APPROVAL', runId, 'VALIDATED']).changes; if (changed !== 1) throw new HttpError(409, 'Workflow changed state before approval request', 'invalid_state'); run(db, 'INSERT INTO approvals(id, workspace_id, workflow_run_id, plan_hash, status, requested_by, approval_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id('approval'), workspaceId, runId, workflowRun.plan_hash, 'PENDING', actorId, approvalMode, now()]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_APPROVAL_REQUESTED', entityType: 'workflow_run', entityId: runId, payload: { planHash: workflowRun.plan_hash, approvalMode } }); });
    return getRun(runId, workspaceId);
  }

  function approveRun(runId, workspaceId, actorId, decision = 'APPROVED', reason = '', { trustedDemo = false } = {}) {
    const workflowRun = getRun(runId, workspaceId);
    if (workflowRun.status !== 'AWAITING_APPROVAL') throw new HttpError(409, `Workflow cannot be decided from ${workflowRun.status}`, 'invalid_state');
    const approval = get(db, 'SELECT * FROM approvals WHERE workflow_run_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1', [runId, 'PENDING']);
    if (!approval || approval.plan_hash !== workflowRun.plan_hash) throw new HttpError(409, 'Approval is missing or stale for the immutable workflow plan', 'stale_approval');
    if (approval.approval_mode === 'demo' && !trustedDemo) throw new HttpError(403, 'Demonstration approvals cannot be presented as human authorization', 'demo_approval_denied');
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Approval decision must be APPROVED or REJECTED', 'invalid_approval_decision');
    const next = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    transaction(db, () => { const approvalChanged = run(db, 'UPDATE approvals SET status = ?, decided_by = ?, reason = ?, decided_at = ? WHERE id = ? AND status = ?', [next, actorId, reason, now(), approval.id, 'PENDING']).changes; const runChanged = run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ? AND status = ?', [next, runId, 'AWAITING_APPROVAL']).changes; if (approvalChanged !== 1 || runChanged !== 1) throw new HttpError(409, 'Approval state changed before decision was recorded', 'invalid_state'); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: `WORKFLOW_${next}`, entityType: 'workflow_run', entityId: runId, payload: { planHash: workflowRun.plan_hash, approvalMode: approval.approval_mode } }); });
    return getRun(runId, workspaceId);
  }

  function revalidateRun(workflowRun, workspaceId) {
    const auth = get(db, 'SELECT * FROM execution_authorizations WHERE id = ?', [workflowRun.authorization_id]);
    if (!auth || auth.revoked_at || auth.workspace_id !== workspaceId || auth.workflow_id !== workflowRun.workflow_id || auth.plan_hash !== workflowRun.plan_hash) throw new HttpError(409, 'Workflow authorization is missing, revoked, or inconsistent', 'authorization_invalid');
    const workflow = getWorkflow(workflowRun.workflow_id, workspaceId);
    const definition = validateDefinition(workflow.definition);
    const grantContext = JSON.parse(auth.grant_context_json || '{}');
    const authorization = { allowedTools: JSON.parse(auth.allowed_tools_json), dataScope: JSON.parse(auth.data_scope_json), timeLimitMs: auth.time_limit_ms, budgetLimit: auth.budget_limit, grantContext: Object.keys(grantContext).length ? grantContext : null };
    const plans = definition.steps.map((step) => runtime.authorizationFor({ actorId: auth.actor_id, workspaceId, agentId: step.agent_id, requestedCapabilities: step.requested_capabilities || [], allowedTools: authorization.allowedTools, dataScope: authorization.dataScope, timeLimitMs: authorization.timeLimitMs, budgetLimit: authorization.budgetLimit, approvalPolicy: auth.approval_policy, grantContext: authorization.grantContext }).plan);
    const persistedGrants = JSON.parse(auth.explicit_grants_json || '[]');
    const currentGrants = [...new Set(plans.flatMap((plan) => plan.explicit_grants))];
    if (hashPlan(currentGrants) !== hashPlan(persistedGrants)) throw new HttpError(409, 'Trusted workflow grants are stale or inconsistent', 'authorization_invalid');
    if (hashPlan({ workflow_id: workflowRun.workflow_id, input: workflowRun.input, steps: plans, max_concurrency: definition.max_concurrency }) !== workflowRun.plan_hash) throw new HttpError(409, 'Workflow plan hash is stale or forged', 'plan_hash_mismatch');
    const approval = get(db, 'SELECT * FROM approvals WHERE workflow_run_id = ? AND status = ? AND plan_hash = ? ORDER BY decided_at DESC LIMIT 1', [workflowRun.id, 'APPROVED', workflowRun.plan_hash]);
    const expectedApprovalMode = grantContext.source === 'offline-demo' ? 'demo' : 'human';
    if (!approval || approval.approval_mode !== expectedApprovalMode) throw new HttpError(409, 'A matching approval is required before workflow execution', 'approval_invalid');
    return { auth, authorization: { allowed_tools: authorization.allowedTools, explicitGrants: JSON.parse(auth.explicit_grants_json), timeLimitMs: auth.time_limit_ms }, workflow, definition };
  }

  function start(runId, workspaceId, actorId) {
    const workflowRun = getRun(runId, workspaceId);
    if (workflowRun.status !== 'APPROVED' && workflowRun.status !== 'RECOVERABLE') throw new HttpError(409, 'Workflow run must be approved before execution', 'approval_required');
    revalidateRun(workflowRun, workspaceId);
    if (active.has(runId)) return workflowRun;
    const controller = new AbortController();
    const promise = execute(runId, workspaceId, actorId, controller.signal).finally(() => active.delete(runId));
    active.set(runId, { controller, promise });
    return getRun(runId, workspaceId);
  }

  async function execute(runId, workspaceId, actorId, signal) {
    const workflowRun = getRun(runId, workspaceId);
    if (killSwitch()) throw new HttpError(423, 'Execution kill switch is active', 'kill_switch_active');
    const { workflow, definition, authorization } = revalidateRun(workflowRun, workspaceId);
    throwIfAborted(signal);
    transaction(db, () => { const changed = run(db, 'UPDATE workflow_runs SET status = ?, started_at = ? WHERE id = ? AND status IN (\'APPROVED\', \'RECOVERABLE\')', ['RUNNING', now(), runId]).changes; if (changed !== 1) throw new HttpError(409, 'Workflow changed state before execution began', 'invalid_state'); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_STARTED', entityType: 'workflow_run', entityId: runId, payload: {} }); });
    const persisted = getRun(runId, workspaceId);
    const outputs = Object.fromEntries(persisted.steps.filter((step) => step.status === 'COMPLETED').map((step) => [step.step_id, step.output]));
    try {
      const pending = new Map(definition.steps.map((step, index) => [step.id, { step, index }]));
      for (const completed of persisted.steps.filter((step) => step.status === 'COMPLETED')) pending.delete(completed.step_id);
      const executeStep = async ({ step, index }) => {
        throwIfAborted(signal);
        const current = getRun(runId, workspaceId);
        if (current.status !== 'RUNNING' || current.cancellation_requested) throw cancellationError('Workflow cancellation requested');
        const missing = (step.depends_on || []).filter((dependency) => outputs[dependency] === undefined);
        if (missing.length) throw new HttpError(409, `Dependencies are not complete: ${missing.join(', ')}`, 'dependency_failed');
        const input = { ...workflowRun.input, ...(step.input_template || {}), prior_outputs: outputs, step_input: step.input_template || {}, step_id: step.id };
        const maxAttempts = 1 + Number(step.retry_limit || 0);
        let result;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          throwIfAborted(signal);
          const changed = run(db, 'UPDATE workflow_run_steps SET status = ?, attempts = ?, started_at = ? WHERE workflow_run_id = ? AND step_id = ? AND status IN (\'PENDING\', \'FAILED\')', ['RUNNING', attempt, now(), runId, step.id]).changes;
          if (changed !== 1) throw new HttpError(409, 'Workflow step changed state before execution', 'invalid_state');
          try { result = await withTimeout((stepSignal) => runtime.deterministic(catalog.roles.get(step.agent_id), input, authorization, { db, catalog, workspaceId, workflowRunId: runId, signal: stepSignal }), Math.min(authorization.timeLimitMs, 60_000), signal); break; } catch (error) { lastError = error; if (error.code === 'cancelled') throw error; if (attempt < maxAttempts) await sleep(25 * attempt, signal); }
        }
        if (!result) { run(db, 'UPDATE workflow_run_steps SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE workflow_run_id = ? AND step_id = ? AND status = ?', ['FAILED', lastError?.code || 'step_failed', lastError?.message || 'Step failed', now(), runId, step.id, 'RUNNING']); throw lastError || new HttpError(500, 'Step failed', 'step_failed'); }
        throwIfAborted(signal);
        outputs[step.id] = result.result;
        transaction(db, () => {
          const live = get(db, 'SELECT status, cancellation_requested FROM workflow_runs WHERE id = ?', [runId]);
          if (live?.status !== 'RUNNING' || live.cancellation_requested) throw cancellationError('Workflow cancellation requested');
          const changed = run(db, 'UPDATE workflow_run_steps SET status = ?, output_json = ?, evidence_json = ?, completed_at = ? WHERE workflow_run_id = ? AND step_id = ? AND status = ?', ['COMPLETED', JSON.stringify(result.result), JSON.stringify(result.evidence), now(), runId, step.id, 'RUNNING']).changes;
          if (changed !== 1) throw new HttpError(409, 'Workflow step cannot complete after terminal transition', 'invalid_state');
          run(db, 'UPDATE workflow_runs SET current_step = ? WHERE id = ? AND status = ?', [index + 1, runId, 'RUNNING']);
          for (const dependent of definition.steps.filter((candidate) => (candidate.depends_on || []).includes(step.id))) {
            const handoff = validateHandoff({ sender_agent: step.agent_id, recipient_agent: dependent.agent_id, message_type: 'structured_handoff', input, output: result.result, evidence: result.evidence, authorization, correlation_id: workflowRun.correlation_id });
            run(db, 'INSERT INTO handoffs(id, workspace_id, workflow_id, workflow_run_id, sender_agent, recipient_agent, message_type, input_json, output_json, evidence_json, authorization_json, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id('handoff'), workspaceId, workflowRun.workflow_id, runId, handoff.sender_agent, handoff.recipient_agent, handoff.message_type, JSON.stringify(handoff.input), JSON.stringify(handoff.output), JSON.stringify(handoff.evidence), JSON.stringify(handoff.authorization), handoff.correlation_id, now()]);
          }
          audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_STEP_COMPLETED', entityType: 'workflow_run', entityId: runId, payload: { stepId: step.id, agentId: step.agent_id } });
        });
      };
      while (pending.size) {
        throwIfAborted(signal);
        const ready = [...pending.values()].filter(({ step }) => (step.depends_on || []).every((dependency) => outputs[dependency] !== undefined));
        if (!ready.length) throw new HttpError(409, 'Workflow dependency graph contains a cycle or failed dependency', 'dependency_failed');
        const batch = ready.slice(0, definition.max_concurrency);
        batch.forEach(({ step }) => pending.delete(step.id));
        await Promise.all(batch.map(executeStep));
      }
      transaction(db, () => { const changed = run(db, 'UPDATE workflow_runs SET status = ?, output_json = ?, completed_at = ? WHERE id = ? AND status = ? AND cancellation_requested = 0', ['COMPLETED', JSON.stringify(outputs), now(), runId, 'RUNNING']).changes; if (changed === 1) audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_COMPLETED', entityType: 'workflow_run', entityId: runId, payload: { steps: definition.steps.length } }); });
    } catch (error) {
      const current = get(db, 'SELECT status FROM workflow_runs WHERE id = ?', [runId]);
      const status = error.code === 'cancelled' || current?.status === 'CANCELLED' ? 'CANCELLED' : error.code === 'execution_timeout' || error.code === 'tool_timeout' ? 'TIMED_OUT' : 'FAILED';
      if (current?.status === 'RUNNING') transaction(db, () => { const changed = run(db, 'UPDATE workflow_runs SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ? AND status = ?', [status, error.code || 'workflow_failed', error.message, now(), runId, 'RUNNING']).changes; if (changed === 1) audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: `WORKFLOW_${status}`, entityType: 'workflow_run', entityId: runId, payload: { error: error.message } }); });
    }
    return getRun(runId, workspaceId);
  }

  function cancel(runId, workspaceId, actorId) {
    const workflowRun = getRun(runId, workspaceId);
    if (TERMINAL.has(workflowRun.status)) return workflowRun;
    transaction(db, () => { const changed = run(db, 'UPDATE workflow_runs SET cancellation_requested = 1, status = ?, completed_at = ? WHERE id = ? AND status NOT IN (\'COMPLETED\', \'FAILED\', \'TIMED_OUT\', \'CANCELLED\', \'REJECTED\')', ['CANCELLED', now(), runId]).changes; if (changed === 1) { run(db, 'UPDATE workflow_run_steps SET status = ? WHERE workflow_run_id = ? AND status IN (\'PENDING\', \'RUNNING\')', ['CANCELLED', runId]); audit(db, { workspaceId, actorId, correlationId: workflowRun.correlation_id, eventType: 'WORKFLOW_CANCELLED', entityType: 'workflow_run', entityId: runId, payload: {} }); } });
    active.get(runId)?.controller.abort();
    return getRun(runId, workspaceId);
  }

  function recover() {
    const runs = db.prepare("SELECT id, workspace_id, correlation_id FROM workflow_runs WHERE status = 'RUNNING'").all();
    transaction(db, () => {
      for (const { id: runId, workspace_id: workspaceId, correlation_id: correlationId } of runs) {
        run(db, 'UPDATE workflow_runs SET status = ? WHERE id = ?', ['RECOVERABLE', runId]);
        run(db, 'UPDATE workflow_run_steps SET status = ? WHERE workflow_run_id = ? AND status = ?', ['PENDING', runId, 'RUNNING']);
        run(db, "UPDATE tool_invocations SET status = ?, error_message = ?, completed_at = ? WHERE workflow_run_id = ? AND status = 'RUNNING'", ['ABANDONED', 'Process restarted before tool completion; safe local tools may be retried.', now(), runId]);
        audit(db, { workspaceId, actorId: 'system-recovery', correlationId, eventType: 'WORKFLOW_RECOVERABLE', entityType: 'workflow_run', entityId: runId, payload: { guarantee: 'completed checkpoints are not replayed; interrupted safe local steps may be retried' } });
      }
    });
    return runs.length;
  }

  return { validateDefinition, createWorkflow, getWorkflow, listWorkflows, createRun, getRun, requestApproval, approveRun, start, cancel, recover, active, revalidateRun };
}

async function withTimeout(operation, ms, parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new HttpError(408, 'Workflow step timed out', 'execution_timeout')); }, ms); });
    return await Promise.race([operation(controller.signal), timeout]);
  } finally { clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); }
}
