import { audit } from './auth.mjs';
import { get, run, transaction } from './db.mjs';
import { invokeTool } from './tools.mjs';
import { HttpError, assertObject, cancellationError, hashPlan, id, now, sleep, throwIfAborted } from './util.mjs';

export const STATUSES = ['DRAFT', 'VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'RECOVERABLE'];

export function createRuntime({ db, catalog, killSwitch, grantResolver = () => [] }) {
  const activeTasks = new Map();

  function authorizationFor({ actorId, workspaceId, agentId, requestedCapabilities = [], allowedTools = [], dataScope = { mode: 'task_input_only' }, timeLimitMs = 10_000, budgetLimit = 1, approvalPolicy = 'required', explicitGrants = undefined, grantContext = null }) {
    if (explicitGrants !== undefined) throw new HttpError(403, 'Client-controlled explicit grants are not accepted', 'client_grants_not_allowed');
    const role = catalog.roles.get(agentId);
    if (!role) throw new HttpError(404, 'Agent not found', 'agent_not_found');
    const trustedGrants = grantContext ? grantResolver({ grantContext, agentId, workspaceId }) : [];
    if (!Array.isArray(trustedGrants)) throw new HttpError(403, 'Trusted grant policy rejected the execution request', 'grant_policy_denied');
    if (!role.runtime && !trustedGrants.includes(agentId)) throw new HttpError(403, 'Registry-only roles require a server-controlled offline grant', 'registry_only_denied');
    if (!Array.isArray(allowedTools) || allowedTools.some((tool) => !['catalog.lookup', 'schema.validate', 'evidence.compare', 'risk.score', 'workflow.validate', 'knowledge.retrieve'].includes(tool))) throw new HttpError(403, 'Requested tool is not in the safe local registry', 'unsafe_tool_denied');
    if (timeLimitMs < 100 || timeLimitMs > 60_000 || budgetLimit < 1 || budgetLimit > 100) throw new HttpError(400, 'Execution limits are outside the local safety bounds', 'invalid_limits');
    const plan = { actor_id: actorId, workspace_id: workspaceId, agent_id: agentId, requested_capabilities: requestedCapabilities, allowed_tools: allowedTools, data_scope: dataScope, time_limit_ms: timeLimitMs, budget_limit: budgetLimit, approval_policy: approvalPolicy, explicit_grants: trustedGrants, grant_context: grantContext, mode: 'deterministic-local' };
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
      run(db, `INSERT INTO execution_authorizations(id, workspace_id, actor_id, agent_id, requested_capabilities_json, allowed_tools_json, data_scope_json, time_limit_ms, budget_limit, approval_policy, explicit_grants_json, plan_hash, grant_context_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [authId, workspaceId, actorId, agentId, JSON.stringify(plan.requested_capabilities), JSON.stringify(plan.allowed_tools), JSON.stringify(plan.data_scope), plan.time_limit_ms, plan.budget_limit, plan.approval_policy, JSON.stringify(plan.explicit_grants), planHash, JSON.stringify(plan.grant_context || {}), createdAt]);
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
    if (task.status !== 'DRAFT') throw new HttpError(409, `Task cannot be validated from ${task.status}`, 'invalid_state');
    transaction(db, () => { run(db, 'UPDATE tasks SET status = ? WHERE id = ?', ['VALIDATED', taskId]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_VALIDATED', entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash } }); });
    return getTask(taskId, workspaceId);
  }

  function requestApproval(taskId, workspaceId, actorId, { approvalMode = 'human' } = {}) {
    let task = getTask(taskId, workspaceId);
    if (task.status === 'DRAFT') { task = validateTask(taskId, workspaceId, actorId); }
    if (task.status !== 'VALIDATED') throw new HttpError(409, `Approval can only be requested from VALIDATED, not ${task.status}`, 'invalid_state');
    if (approvalMode !== 'human') throw new HttpError(403, 'Task approvals require explicit human authorization', 'demo_approval_denied');
    transaction(db, () => { const changed = run(db, 'UPDATE tasks SET status = ? WHERE id = ? AND status = ?', ['AWAITING_APPROVAL', taskId, 'VALIDATED']).changes; if (changed !== 1) throw new HttpError(409, 'Task changed state before approval request', 'invalid_state'); run(db, 'INSERT INTO approvals(id, workspace_id, task_id, plan_hash, status, requested_by, approval_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id('approval'), workspaceId, taskId, task.plan_hash, 'PENDING', actorId, approvalMode, now()]); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'APPROVAL_REQUESTED', entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash, approvalMode } }); });
    return getTask(taskId, workspaceId);
  }

  function approveTask(taskId, workspaceId, actorId, decision = 'APPROVED', reason = '') {
    const task = getTask(taskId, workspaceId);
    if (task.status !== 'AWAITING_APPROVAL') throw new HttpError(409, `Task cannot be decided from ${task.status}`, 'invalid_state');
    const approval = get(db, 'SELECT * FROM approvals WHERE task_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1', [taskId, 'PENDING']);
    if (!approval || approval.plan_hash !== task.plan_hash) throw new HttpError(409, 'Approval is missing or stale for the immutable execution plan', 'stale_approval');
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Approval decision must be APPROVED or REJECTED', 'invalid_approval_decision');
    const next = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    transaction(db, () => { const approvalChanged = run(db, 'UPDATE approvals SET status = ?, decided_by = ?, reason = ?, decided_at = ? WHERE id = ? AND status = ?', [next, actorId, reason, now(), approval.id, 'PENDING']).changes; const taskChanged = run(db, 'UPDATE tasks SET status = ? WHERE id = ? AND status = ?', [next, taskId, 'AWAITING_APPROVAL']).changes; if (approvalChanged !== 1 || taskChanged !== 1) throw new HttpError(409, 'Approval state changed before decision was recorded', 'invalid_state'); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: `TASK_${next}`, entityType: 'task', entityId: taskId, payload: { planHash: task.plan_hash, reason } }); });
    return getTask(taskId, workspaceId);
  }

  function revalidateTask(task) {
    const authorizationRow = task.authorization;
    if (!authorizationRow || authorizationRow.revoked_at || authorizationRow.workspace_id !== task.workspace_id || authorizationRow.agent_id !== task.agent_id) throw new HttpError(409, 'Execution authorization is missing, revoked, or inconsistent', 'authorization_invalid');
    const grantContext = JSON.parse(authorizationRow.grant_context_json || '{}');
    const { plan, planHash } = authorizationFor({ actorId: authorizationRow.actor_id, workspaceId: authorizationRow.workspace_id, agentId: authorizationRow.agent_id, requestedCapabilities: JSON.parse(authorizationRow.requested_capabilities_json), allowedTools: JSON.parse(authorizationRow.allowed_tools_json), dataScope: JSON.parse(authorizationRow.data_scope_json), timeLimitMs: authorizationRow.time_limit_ms, budgetLimit: authorizationRow.budget_limit, approvalPolicy: authorizationRow.approval_policy, grantContext: Object.keys(grantContext).length ? grantContext : null });
    const persistedGrants = JSON.parse(authorizationRow.explicit_grants_json || '[]');
    if (hashPlan(plan.explicit_grants) !== hashPlan(persistedGrants)) throw new HttpError(409, 'Trusted execution grants are stale or inconsistent', 'authorization_invalid');
    if (planHash !== task.plan_hash || planHash !== authorizationRow.plan_hash) throw new HttpError(409, 'Execution plan hash is stale or forged', 'plan_hash_mismatch');
    const approval = get(db, 'SELECT * FROM approvals WHERE task_id = ? AND status = ? AND plan_hash = ? ORDER BY decided_at DESC LIMIT 1', [task.id, 'APPROVED', task.plan_hash]);
    if (!approval || approval.approval_mode !== 'human') throw new HttpError(409, 'A matching human approval is required before task execution', 'approval_invalid');
    return { authorizationRow, authorization: { allowed_tools: JSON.parse(authorizationRow.allowed_tools_json), explicitGrants: JSON.parse(authorizationRow.explicit_grants_json), timeLimitMs: authorizationRow.time_limit_ms } };
  }

  async function executeTask(taskId, workspaceId, actorId) {
    if (activeTasks.has(taskId)) throw new HttpError(409, 'Task is already executing', 'already_running');
    const task = getTask(taskId, workspaceId);
    if (task.status !== 'APPROVED') throw new HttpError(409, 'Task must be approved before execution', 'approval_required');
    if (killSwitch()) throw new HttpError(423, 'Execution kill switch is active', 'kill_switch_active');
    const { authorization } = revalidateTask(task);
    const controller = new AbortController();
    activeTasks.set(taskId, controller);
    try {
      transaction(db, () => { const changed = run(db, 'UPDATE tasks SET status = ?, started_at = ? WHERE id = ? AND status = ?', ['RUNNING', now(), taskId, 'APPROVED']).changes; if (changed !== 1) throw new HttpError(409, 'Task changed state before execution began', 'invalid_state'); audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_STARTED', entityType: 'task', entityId: taskId, payload: { mode: 'deterministic-local' } }); });
      const output = await withTimeout((signal) => deterministic(roleFor(task.agent_id), JSON.parse(task.input_json), authorization, { db, catalog, workspaceId, taskId, signal }), Math.min(authorization.timeLimitMs, 60_000), controller.signal);
      throwIfAborted(controller.signal);
      transaction(db, () => { const changed = run(db, 'UPDATE tasks SET status = ?, output_json = ?, evidence_json = ?, completed_at = ? WHERE id = ? AND status = ? AND completed_at IS NULL', ['COMPLETED', JSON.stringify(output.result), JSON.stringify(output.evidence), now(), taskId, 'RUNNING']).changes; if (changed === 1) audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_COMPLETED', entityType: 'task', entityId: taskId, payload: { evidence: output.evidence } }); });
    } catch (error) {
      const current = get(db, 'SELECT status FROM tasks WHERE id = ?', [taskId]);
      const status = error.code === 'cancelled' ? 'CANCELLED' : ['execution_timeout', 'tool_timeout'].includes(error.code) ? 'TIMED_OUT' : 'FAILED';
      if (current?.status === 'RUNNING') transaction(db, () => { const changed = run(db, 'UPDATE tasks SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ? AND status = ?', [status, error.code || 'execution_failed', error.message, now(), taskId, 'RUNNING']).changes; if (changed === 1) audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: `TASK_${status}`, entityType: 'task', entityId: taskId, payload: { error: error.message } }); });
    } finally { activeTasks.delete(taskId); }
    return getTask(taskId, workspaceId);
  }

  function cancelTask(taskId, workspaceId, actorId) {
    const task = getTask(taskId, workspaceId);
    if (['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'REJECTED'].includes(task.status)) return task;
    transaction(db, () => { const changed = run(db, 'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND status NOT IN (\'COMPLETED\', \'FAILED\', \'TIMED_OUT\', \'CANCELLED\', \'REJECTED\')', ['CANCELLED', now(), taskId]).changes; if (changed === 1) audit(db, { workspaceId, actorId, correlationId: task.correlation_id, eventType: 'TASK_CANCELLED', entityType: 'task', entityId: taskId, payload: {} }); });
    activeTasks.get(taskId)?.abort();
    return getTask(taskId, workspaceId);
  }

  async function deterministic(role, input, authorization, context) {
    throwIfAborted(context.signal);
    const delay = Math.min(1000, Math.max(0, Number(input.simulated_delay_ms || 0)));
    if (delay) await sleep(delay, context.signal);
    throwIfAborted(context.signal);
    if (input.failure_mode === 'deterministic_failure') throw new HttpError(422, 'Scenario requested a deterministic failure', 'deterministic_failure');
    const base = { execution_mode: 'deterministic-local', agent_id: role.name, method: 'rule-based operation over supplied local input', input_keys: Object.keys(input).sort(), limitations: ['No model reasoning or external provider call was used.', 'Output requires human review before consequential action.'] };
    if (role.name.includes('risk')) {
      const score = await invokeTool({ ...context, toolId: 'risk.score', input: { ...(input.risk || input), simulated_tool_delay_ms: input.simulated_tool_delay_ms }, allowedTools: authorization.allowed_tools, workflowRunId: null });
      return { result: { ...base, assessment: score.output, recommendation: score.output.residual_score >= 12 ? 'escalate' : 'monitor' }, evidence: [score.evidence] };
    }
    if (role.name.includes('ai_governance') || role.name.includes('eu_ai_act')) {
      const declared = input.declared_controls || ['risk_management', 'human_oversight', 'data_governance', 'logging'];
      const observed = input.observed_controls || [];
      const compare = await invokeTool({ ...context, toolId: 'evidence.compare', input: { declared, observed, simulated_tool_delay_ms: input.simulated_tool_delay_ms }, allowedTools: authorization.allowed_tools });
      return { result: { ...base, applicability: input.system_type || 'unspecified AI system', control_gaps: compare.output.missing, legal_status: 'rule-based assistance; not a legal determination' }, evidence: [compare.evidence] };
    }
    if (role.name === 'solution_architect' || role.name === 'security_engineer') {
      const validation = await invokeTool({ ...context, toolId: 'schema.validate', input: { value: input, required_keys: input.required_keys || ['requirements'], simulated_tool_delay_ms: input.simulated_tool_delay_ms }, allowedTools: authorization.allowed_tools });
      return { result: { ...base, checklist: { valid: validation.output.valid, missing: validation.output.missing }, findings: validation.output.valid ? ['Requirements are structurally present.'] : ['Required evidence is missing.'] }, evidence: [validation.evidence] };
    }
    if (role.name === 'program_manager') return { result: { ...base, delivery_risks: Array.isArray(input.risks) ? input.risks : [], next_review: 'human program owner review' }, evidence: [{ method: 'local-structured-analysis', source: 'task input' }] };
    return { result: { ...base, deliverables: role.deliverables, summary: 'Structured local contract analysis completed.', evidence_required: role.required_inputs }, evidence: [{ method: 'local-role-contract', source: 'catalog/roles.json' }] };
  }

  function roleFor(agentId) { const role = catalog.roles.get(agentId); if (!role) throw new HttpError(404, 'Agent not found', 'agent_not_found'); return role; }
  function hydrateTask(task) { return { ...task, input: JSON.parse(task.input_json), output: task.output_json ? JSON.parse(task.output_json) : null, evidence: task.evidence_json ? JSON.parse(task.evidence_json) : null, authorization: task.authorization_id ? get(db, 'SELECT * FROM execution_authorizations WHERE id = ?', [task.authorization_id]) : null }; }
  return { authorizationFor, createTask, getTask, validateTask, requestApproval, approveTask, executeTask, cancelTask, deterministic, revalidateTask, activeTasks };
}

async function withTimeout(operation, ms, parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new HttpError(408, 'Task execution timed out', 'execution_timeout')); }, ms); });
    return await Promise.race([operation(controller.signal), timeout]);
  } finally { clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); }
}
