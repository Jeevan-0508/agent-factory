import { audit } from './auth.mjs';
import { get, run, transaction } from './db.mjs';
import { invokeTool } from './tools.mjs';
import { HttpError, assertObject, hashPlan, id, now, sleep } from './util.mjs';

export const STATUSES = ['DRAFT', 'VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'RECOVERABLE'];

export function createRuntime({ db, catalog, killSwitch }) {
  function authorizationFor({ actorId, workspaceId, agentId, requestedCapabilities = [], allowedTools = [], dataScope = { mode: 'task_input_only' }, timeLimitMs = 10_000, budgetLimit = 1, approvalPolicy = 'required', explicitGrants = [] }) {
    const role = catalog.roles.get(agentId);
    if (!role) throw new HttpError(404, 'Agent not found', 'agent_not_found');
    if (!role.runtime && !explicitGrants.includes(agentId)) throw new HttpError(403, 'Registry-only roles require an explicit scenario or promotion grant', 'registry_only_denied');
    if (!Array.isArray(allowedTools) || allowedTools.some((tool) => !['catalog.lookup', 'schema.validate', 'evidence.compare', 'risk.score', 'workflow.validate', 'knowledge.retrieve'].includes(tool))) throw new HttpError(403, 'Requested tool is not in the safe local registry', 'unsafe_tool_denied');
    if (timeLimitMs < 100 || timeLimitMs > 60_000 || budgetLimit < 1 || budgetLimit > 100) throw new HttpError(400, 'Execution limits are outside the local safety bounds', 'invalid_limits');
    const plan = { actor_id: actorId, workspace_id: workspaceId, agent_id: agentId, requested_capabilities: requestedCapabilities, allowed_tools: allowedTools, data_scope: dataScope, time_limit_ms: timeLimitMs, budget_limit: budgetLimit, approval_policy: approvalPolicy, explicit_grants: explicitGrants, mode: 'deterministic-local' };
    return { plan, planHash: hashPlan(plan), role };
  }

  function createTask({ actorId, workspaceId, agentId, input, idempotencyKey = null, ...authorization }) {
    assertObject(input, 'Task input must be an object');
    if (idempotencyKey) {
      const existing = get(db, 'SELECT id FROM tasks WHERE workspace_id = ? AND idempotency_key = ?', [workspaceId, idempotencyKey]);
      if (existing) return getTask(existing.id, workspaceId);
    }
    const { plan, planHash } = authorizationFor({ actorId, workspaceId, agentId, ...authorization });
    const taskId = id('task');
    const correlationId = id('corr');
    const authId = id('auth');
    const createdAt = now();
    transaction(db, () => {
      run(db, `INSERT INTO execution_authorizations(id, workspace_id, actor_id, agent_id, requested_capabilities_json, allowed_tools_json, data_scope_json, time_limit_ms, budget_limit, approval_policy, explicit_grants_json, plan_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [authId, workspaceId, actorId, agentId, JSON.stringify(plan.requested_capabilities), JSON.stringify(plan.allowed_tools), JSON.stringify(plan.data_scope), plan.time_limit_ms, plan.budget_limit, plan.approval_policy, JSON.stringify(plan.explicit_grants), planHash, createdAt]);
      run(db, `INSERT INTO tasks(id, workspace_id, agent_id, status, input_json, authorization_id, plan_hash, correlation_id, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [taskId, workspaceId, agentId, 'DRAFT', JSON.stringify(input), authId, planHash, correlationId, idempotencyKey, createdAt]);
      run(db, 'UPDATE execution_authorizations SET task_id = ? WHERE id = ?', [taskId, authId]);
      audit(db, { workspaceId, actorId, correlationId, eventType: 'TASK_CREATED', entityType: 'task', entityId: taskId, payload: { agentId, mode: 'deterministic-local' } });
    });
    return getTask(taskId, workspaceId);
  }

  function getTask(taskId, workspaceId) {
    const task = get(db, 'SELECT * FROM tasks WHERE id = ? AND workspace_id = ?', [taskId, workspaceId]);
    if (!task) throw new HttpError(404, 'Task not found', 'task_not_found');
    return hydrateTask(task);
  }

  function validateTask(taskId, workspaceId, actorId) {
    const task = getTask(taskId, workspaceId);
    if (task.status !== 'DRAFT') return task;
    transaction(db, () => { run(db, 'UPDATE tasks SET status = ? WHERE id = ?', ['VALIDATED', taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_VALIDATED', entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash } }); });
    return getTask(taskId, workspaceId);
  }

  function requestApproval(taskId, workspaceId, actorId) {
    const task = validateTask(taskId, workspaceId, actorId);
    transaction(db, () => { run(db, 'UPDATE tasks SET status = ? WHERE id = ?', ['AWAITING_APPROVAL', taskId]); run(db, 'INSERT INTO approvals(id, workspace_id, task_id, plan_hash, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('approval'), workspaceId, taskId, task.plan_hash, 'PENDING', actorId, now()]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'APPROVAL_REQUESTED', entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash } }); });
    return getTask(taskId, workspaceId);
  }

  function approveTask(taskId, workspaceId, actorId, decision = 'APPROVED', reason = '') {
    const task = getTask(taskId, workspaceId);
    const approval = get(db, 'SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at DESC LIMIT 1', [taskId]);
    if (!approval || approval.plan_hash !== task.plan_hash) throw new HttpError(409, 'Approval is missing or stale for the immutable execution plan', 'stale_approval');
    const next = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    transaction(db, () => { run(db, 'UPDATE approvals SET status = ?, decided_by = ?, reason = ?, decided_at = ? WHERE id = ?', [next, actorId, reason, now(), approval.id]); run(db, 'UPDATE tasks SET status = ? WHERE id = ?', [next, taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: `TASK_${next}`, entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash, reason } }); });
    return getTask(taskId, workspaceId);
  }

  async function executeTask(taskId, workspaceId, actorId) {
    const task = getTask(taskId, workspaceId);
    if (task.status !== 'APPROVED') throw new HttpError(409, 'Task must be approved before execution', 'approval_required');
    if (killSwitch()) throw new HttpError(423, 'Execution kill switch is active', 'kill_switch_active');
    const authorizationRow = task.authorization;
    const authorization = { allowed_tools: JSON.parse(authorizationRow.allowed_tools_json), explicitGrants: JSON.parse(authorizationRow.explicit_grants_json), timeLimitMs: authorizationRow.time_limit_ms };
    transaction(db, () => { run(db, 'UPDATE tasks SET status = ?, started_at = ? WHERE id = ?', ['RUNNING', now(), taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_STARTED', entityType: 'task', entityId: taskId, payload: { mode: 'deterministic-local' } }); });
    try {
      const output = await withTimeout(deterministic(roleFor(task.agent_id), JSON.parse(task.input_json), authorization, { db, catalog, workspaceId, taskId }), Math.min(authorization.timeLimitMs, 60_000));
      transaction(db, () => { run(db, 'UPDATE tasks SET status = ?, output_json = ?, evidence_json = ?, completed_at = ? WHERE id = ?', ['COMPLETED', JSON.stringify(output.result), JSON.stringify(output.evidence), now(), taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_COMPLETED', entityType: 'task', entityId: taskId, payload: { evidence: output.evidence } }); });
    } catch (error) {
      const status = error.code === 'execution_timeout' ? 'TIMED_OUT' : 'FAILED';
      transaction(db, () => { run(db, 'UPDATE tasks SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ?', [status, error.code || 'execution_failed', error.message, now(), taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: `TASK_${status}`, entityType: 'task', entityId: taskId, payload: { error: error.message } }); });
    }
    return getTask(taskId, workspaceId);
  }

  function cancelTask(taskId, workspaceId, actorId) {
    const task = getTask(taskId, workspaceId);
    if (['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'REJECTED'].includes(task.status)) return task;
    transaction(db, () => { run(db, 'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?', ['CANCELLED', now(), taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_CANCELLED', entityType: 'task', entityId: taskId, payload: {} }); });
    return getTask(taskId, workspaceId);
  }

  async function deterministic(role, input, authorization, context) {
    const delay = Math.min(1000, Math.max(0, Number(input.simulated_delay_ms || 0)));
    if (delay) await sleep(delay);
    if (input.failure_mode === 'deterministic_failure') throw new HttpError(422, 'Scenario requested a deterministic failure', 'deterministic_failure');
    const base = { execution_mode: 'deterministic-local', agent_id: role.name, method: 'rule-based operation over supplied local input', input_keys: Object.keys(input).sort(), limitations: ['No model reasoning or external provider call was used.', 'Output requires human review before consequential action.'] };
    if (role.name.includes('risk')) {
      const score = await invokeTool({ ...context, toolId: 'risk.score', input: input.risk || input, allowedTools: authorization.allowed_tools, workflowRunId: null });
      return { result: { ...base, assessment: score.output, recommendation: score.output.residual_score >= 12 ? 'escalate' : 'monitor' }, evidence: [score.evidence] };
    }
    if (role.name.includes('ai_governance') || role.name.includes('eu_ai_act')) {
      const declared = input.declared_controls || ['risk_management', 'human_oversight', 'data_governance', 'logging'];
      const observed = input.observed_controls || [];
      const compare = await invokeTool({ ...context, toolId: 'evidence.compare', input: { declared, observed }, allowedTools: authorization.allowed_tools });
      return { result: { ...base, applicability: input.system_type || 'unspecified AI system', control_gaps: compare.output.missing, legal_status: 'rule-based assistance; not a legal determination' }, evidence: [compare.evidence] };
    }
    if (role.name === 'solution_architect' || role.name === 'security_engineer') {
      const validation = await invokeTool({ ...context, toolId: 'schema.validate', input: { value: input, required_keys: input.required_keys || ['requirements'] }, allowedTools: authorization.allowed_tools });
      return { result: { ...base, checklist: { valid: validation.output.valid, missing: validation.output.missing }, findings: validation.output.valid ? ['Requirements are structurally present.'] : ['Required evidence is missing.'] }, evidence: [validation.evidence] };
    }
    if (role.name === 'program_manager') return { result: { ...base, delivery_risks: Array.isArray(input.risks) ? input.risks : [], next_review: 'human program owner review' }, evidence: [{ method: 'local-structured-analysis', source: 'task input' }] };
    return { result: { ...base, deliverables: role.deliverables, summary: 'Structured local contract analysis completed.', evidence_required: role.required_inputs }, evidence: [{ method: 'local-role-contract', source: 'catalog/roles.json' }] };
  }

  function roleFor(agentId) { const role = catalog.roles.get(agentId); if (!role) throw new HttpError(404, 'Agent not found', 'agent_not_found'); return role; }
  function hydrateTask(task) { return { ...task, input: JSON.parse(task.input_json), output: task.output_json ? JSON.parse(task.output_json) : null, evidence: task.evidence_json ? JSON.parse(task.evidence_json) : null, authorization: task.authorization_id ? get(db, 'SELECT * FROM execution_authorizations WHERE id = ?', [task.authorization_id]) : null }; }
  return { authorizationFor, createTask, getTask, validateTask, requestApproval, approveTask, executeTask, cancelTask, deterministic };
}

function withTimeout(promise, ms) { return Promise.race([promise, sleep(ms).then(() => { throw new HttpError(408, 'Task execution timed out', 'execution_timeout'); })]); }
