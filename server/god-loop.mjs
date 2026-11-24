import { all, get, run, transaction } from './db.mjs';
import { HttpError, assertObject, id, now } from './util.mjs';
import crypto from 'node:crypto';

const TERMINAL = new Set(['COMPLETED', 'BLOCKED', 'CANCELLED', 'FAILED']);
const EVENT_TYPES = new Set(['INSPECTION_RECORDED', 'DEFICIENCY_IDENTIFIED', 'PLAN_RECORDED', 'CHALLENGE_RECORDED', 'IMPLEMENTATION_RECORDED', 'TEST_EVIDENCE_RECORDED', 'REVIEW_RECORDED', 'REPAIR_RECORDED', 'VERIFICATION_RECORDED', 'RELEASE_RECORDED', 'ITERATION_COMPLETED', 'STOP_RECORDED']);
const STOP_REASONS = new Set(['acceptance_satisfied', 'iteration_limit', 'time_limit', 'spending_limit', 'repeated_failure', 'security_violation', 'human_cancelled', 'missing_authorization', 'external_dependency_unavailable']);

function text(value, label, max = 2_000) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) throw new HttpError(400, `${label} is invalid`, 'invalid_god_loop_input');
  return value.trim();
}

function boundedInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, `${label} is outside the permitted bound`, 'invalid_god_loop_input');
  return value;
}

export function createGodLoop({ db, catalog, allowedTools = [] }) {
  const knownAgents = new Set((catalog?.roles || []).map((role) => role.name));
  const knownTools = new Set(allowedTools);
  const machineVerifierKey = crypto.randomBytes(32);
  function view(workspaceId, runId) {
    const loop = get(db, 'SELECT * FROM god_loop_runs WHERE workspace_id = ? AND id = ?', [workspaceId, runId]);
    if (!loop) throw new HttpError(404, 'GOD LOOP run not found', 'god_loop_not_found');
    return { ...loop, acceptance_criteria: JSON.parse(loop.acceptance_criteria_json), allowed_tools: JSON.parse(loop.allowed_tools_json), authorized_agents: JSON.parse(loop.authorized_agents_json), approval_required: Boolean(loop.approval_required), events: all(db, 'SELECT * FROM god_loop_events WHERE workspace_id = ? AND run_id = ? ORDER BY created_at', [workspaceId, runId]).map((event) => ({ ...event, payload: JSON.parse(event.payload_json) })) };
  }

  function record(workspaceId, runId, iteration, eventType, payload) {
    run(db, 'INSERT INTO god_loop_events(id, workspace_id, run_id, iteration, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id('god_loop_event'), workspaceId, runId, iteration, eventType, JSON.stringify(payload || {}), now()]);
  }

  function transitionStop(workspaceId, actorId, loop, status, reason) {
    transaction(db, () => {
      run(db, 'UPDATE god_loop_runs SET status = ?, stop_reason = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', [status, reason, now(), workspaceId, loop.id]);
      record(workspaceId, loop.id, loop.current_iteration, 'STOP_RECORDED', { actor_id: actorId, reason, evidence_origin: 'server_control_plane' });
    });
  }

  function create({ workspaceId, actorId, objective, repositoryScope, acceptanceCriteria, allowedTools: requestedTools = [], authorizedAgents = [], maxIterations = 5, maxConcurrentAgents = 3, maxTimeMs = 1_800_000, spendingLimit = 0 }) {
    const criteria = Array.isArray(acceptanceCriteria) ? acceptanceCriteria.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
    const tools = Array.isArray(requestedTools) ? requestedTools.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 30) : [];
    const agents = Array.isArray(authorizedAgents) ? authorizedAgents.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 10) : [];
    if (!criteria.length || !agents.length) throw new HttpError(400, 'Acceptance criteria and authorized agents are required', 'invalid_god_loop_input');
    if (agents.some((agent) => agent === 'god-loop' || agent === 'self')) throw new HttpError(400, 'Recursive self-spawning is not permitted', 'recursive_delegation_denied');
    const unknownAgents = agents.filter((agent) => !knownAgents.has(agent));
    if (unknownAgents.length) throw new HttpError(400, `Unknown catalog agent(s): ${unknownAgents.join(', ')}`, 'unknown_catalog_role');
    const unknownTools = tools.filter((tool) => !knownTools.has(tool));
    if (unknownTools.length) throw new HttpError(400, `Unauthorized GOD LOOP tool(s): ${unknownTools.join(', ')}`, 'tool_not_authorized');
    const runId = id('god_loop');
    const timestamp = now();
    transaction(db, () => {
      run(db, 'INSERT INTO god_loop_runs(id, workspace_id, objective, repository_scope, acceptance_criteria_json, allowed_tools_json, authorized_agents_json, max_iterations, max_concurrent_agents, max_time_ms, spending_limit, approval_required, status, current_iteration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [runId, workspaceId, text(objective, 'Objective'), text(repositoryScope, 'Repository scope'), JSON.stringify(criteria), JSON.stringify(tools), JSON.stringify(agents), boundedInteger(maxIterations, 'Maximum iterations', 1, 20), boundedInteger(maxConcurrentAgents, 'Maximum concurrent agents', 1, 5), boundedInteger(maxTimeMs, 'Maximum execution time', 1_000, 3_600_000), boundedInteger(spendingLimit, 'Spending limit', 0, 100_000), 1, 'AWAITING_APPROVAL', 0, timestamp, timestamp]);
      record(workspaceId, runId, 0, 'PLAN_RECORDED', { actor_id: actorId, bounded: true, recursive_spawning: false });
    });
    return view(workspaceId, runId);
  }

  function approve({ workspaceId, actorId, runId }) {
    const loop = get(db, 'SELECT * FROM god_loop_runs WHERE workspace_id = ? AND id = ?', [workspaceId, runId]);
    if (!loop) throw new HttpError(404, 'GOD LOOP run not found', 'god_loop_not_found');
    if (loop.status !== 'AWAITING_APPROVAL') throw new HttpError(409, 'GOD LOOP run is not awaiting approval', 'invalid_god_loop_transition');
    transaction(db, () => {
      run(db, 'UPDATE god_loop_runs SET status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', ['APPROVED', now(), workspaceId, runId]);
      record(workspaceId, runId, loop.current_iteration, 'CHALLENGE_RECORDED', { actor_id: actorId, decision: 'approved', independent_review_required: true, evidence_origin: 'operator_recorded' });
    });
    return view(workspaceId, runId);
  }

  function appendEvent({ workspaceId, actorId, runId, eventType, payload = {}, iteration }) {
    const loop = get(db, 'SELECT * FROM god_loop_runs WHERE workspace_id = ? AND id = ?', [workspaceId, runId]);
    if (!loop) throw new HttpError(404, 'GOD LOOP run not found', 'god_loop_not_found');
    if (TERMINAL.has(loop.status)) throw new HttpError(409, 'GOD LOOP run is terminal', 'god_loop_terminal');
    if (!['APPROVED', 'RUNNING'].includes(loop.status)) throw new HttpError(409, 'GOD LOOP run requires approval before events can be recorded', 'god_loop_approval_required');
    if (!EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Unsupported GOD LOOP event', 'invalid_god_loop_event');
    assertObject(payload, 'GOD LOOP event payload must be an object');
    if (Object.hasOwn(payload, 'active_agents') || Object.hasOwn(payload, 'spending_used') || Object.hasOwn(payload, 'active_agents_delta') || Object.hasOwn(payload, 'spending_delta')) throw new HttpError(403, 'Runtime usage must be recorded by a trusted executor', 'machine_usage_evidence_required');
    const elapsed = Date.now() - Date.parse(loop.created_at);
    if (elapsed > loop.max_time_ms) {
      transitionStop(workspaceId, actorId, loop, 'BLOCKED', 'time_limit');
      return view(workspaceId, runId);
    }
    const nextIteration = iteration === undefined ? loop.current_iteration : boundedInteger(iteration, 'Iteration', 0, loop.max_iterations);
    if (nextIteration < loop.current_iteration) throw new HttpError(409, 'Iterations cannot move backward from a durable checkpoint', 'invalid_god_loop_iteration');
    if (nextIteration > loop.current_iteration + 1) throw new HttpError(409, 'Iterations must advance from a durable checkpoint', 'invalid_god_loop_iteration');
    if (eventType === 'ITERATION_COMPLETED' && nextIteration !== loop.current_iteration + 1) throw new HttpError(409, 'Iteration completion must advance exactly one durable checkpoint', 'invalid_god_loop_iteration');
    const nextStatus = loop.status === 'APPROVED' ? 'RUNNING' : loop.status;
    transaction(db, () => {
      run(db, 'UPDATE god_loop_runs SET status = ?, current_iteration = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', [nextStatus, nextIteration, now(), workspaceId, runId]);
      record(workspaceId, runId, nextIteration, eventType, { ...payload, actor_id: actorId, evidence_origin: 'operator_recorded' });
      if (eventType === 'ITERATION_COMPLETED' && nextIteration >= loop.max_iterations) {
        run(db, 'UPDATE god_loop_runs SET status = ?, stop_reason = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', ['BLOCKED', 'iteration_limit', now(), workspaceId, runId]);
        record(workspaceId, runId, nextIteration, 'STOP_RECORDED', { actor_id: actorId, reason: 'iteration_limit', evidence_origin: 'server_control_plane' });
      }
    });
    return view(workspaceId, runId);
  }

  function stop({ workspaceId, actorId, runId, reason }) {
    if (!STOP_REASONS.has(reason)) throw new HttpError(400, 'Stop reason is invalid', 'invalid_god_loop_input');
    const loop = get(db, 'SELECT * FROM god_loop_runs WHERE workspace_id = ? AND id = ?', [workspaceId, runId]);
    if (!loop) throw new HttpError(404, 'GOD LOOP run not found', 'god_loop_not_found');
    if (TERMINAL.has(loop.status)) throw new HttpError(409, 'GOD LOOP run is already terminal', 'god_loop_terminal');
    if (reason === 'acceptance_satisfied') throw new HttpError(403, 'Acceptance completion requires trusted machine verification', 'machine_verification_required');
    const status = reason === 'human_cancelled' ? 'CANCELLED' : reason === 'security_violation' ? 'FAILED' : 'BLOCKED';
    transitionStop(workspaceId, actorId, loop, status, reason);
    return view(workspaceId, runId);
  }

  function completeVerified({ workspaceId, actorId, runId, verification }) {
    const loop = get(db, 'SELECT * FROM god_loop_runs WHERE workspace_id = ? AND id = ?', [workspaceId, runId]);
    if (!loop) throw new HttpError(404, 'GOD LOOP run not found', 'god_loop_not_found');
    if (!['APPROVED', 'RUNNING'].includes(loop.status)) throw new HttpError(409, 'GOD LOOP run is not executable', 'invalid_god_loop_transition');
    if (!verification || verification.source !== 'machine' || verification.criteria_passed !== true || verification.evidence_origin !== 'machine_generated' || typeof verification.evidence_ref !== 'string' || verification.evidence_ref.length < 1) throw new HttpError(403, 'Trusted machine verification is required', 'machine_verification_required');
    const expectedRef = crypto.createHmac('sha256', machineVerifierKey).update(`${runId}:${verification.criteria_digest || ''}:${verification.evidence_digest || ''}`).digest('hex');
    if (verification.evidence_ref !== expectedRef) throw new HttpError(403, 'Machine evidence reference is not trusted', 'machine_verification_invalid');
    transaction(db, () => {
      run(db, 'UPDATE god_loop_runs SET status = ?, stop_reason = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', ['COMPLETED', 'acceptance_satisfied', now(), workspaceId, runId]);
      record(workspaceId, runId, loop.current_iteration, 'VERIFICATION_RECORDED', { actor_id: actorId, verification, evidence_origin: 'machine_generated' });
    });
    return view(workspaceId, runId);
  }

  return { create, approve, view, appendEvent, stop, completeVerified, list: (workspaceId) => all(db, 'SELECT id, objective, status, current_iteration, max_iterations, max_concurrent_agents, spending_limit, stop_reason, created_at, updated_at FROM god_loop_runs WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]) };
}
