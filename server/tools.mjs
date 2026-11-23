import { HttpError, id, now, sleep } from './util.mjs';
import { publicRole } from './catalog.mjs';

const tools = [
  { id: 'catalog.lookup', description: 'Read a bounded role contract from the local catalog.', risk: 'low', sideEffect: 'none', timeoutMs: 500, input: ['role_id'], output: ['role'] },
  { id: 'schema.validate', description: 'Validate a local JSON object against a small required-key schema.', risk: 'low', sideEffect: 'none', timeoutMs: 500, input: ['value', 'required_keys'], output: ['valid', 'missing'] },
  { id: 'evidence.compare', description: 'Compare declared controls with supplied evidence identifiers.', risk: 'low', sideEffect: 'none', timeoutMs: 500, input: ['declared', 'observed'], output: ['missing', 'unexpected'] },
  { id: 'risk.score', description: 'Apply documented deterministic likelihood, impact, and control-effectiveness rules.', risk: 'medium', sideEffect: 'none', timeoutMs: 500, input: ['likelihood', 'impact', 'control_effectiveness'], output: ['inherent_score', 'residual_score', 'method'] },
  { id: 'workflow.validate', description: 'Validate step IDs, dependencies, contracts, and bounded concurrency.', risk: 'low', sideEffect: 'none', timeoutMs: 500, input: ['steps'], output: ['valid', 'errors'] },
  { id: 'knowledge.retrieve', description: 'Read local catalog knowledge without network access.', risk: 'low', sideEffect: 'none', timeoutMs: 500, input: ['query'], output: ['matches'] }
];

export const listTools = () => tools.map((tool) => ({ ...tool }));
export const getTool = (toolId) => tools.find((tool) => tool.id === toolId) || null;

export async function invokeTool({ db, catalog, toolId, input, allowedTools, workspaceId, taskId = null, workflowRunId = null }) {
  if (!allowedTools.includes(toolId)) throw new HttpError(403, `Tool ${toolId} is not authorized`, 'tool_not_authorized');
  const definition = getTool(toolId);
  if (!definition) throw new HttpError(404, `Unknown tool ${toolId}`, 'unknown_tool');
  const invocationId = id('tool');
  db.prepare(`INSERT INTO tool_invocations(id, workspace_id, task_id, workflow_run_id, tool_id, status, input_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(invocationId, workspaceId, taskId, workflowRunId, toolId, 'RUNNING', JSON.stringify(input || {}), now());
  try {
    const output = await Promise.race([executeTool(toolId, input || {}, catalog), sleep(definition.timeoutMs).then(() => { throw new HttpError(504, `Tool ${toolId} timed out`, 'tool_timeout'); })]);
    db.prepare('UPDATE tool_invocations SET status = ?, output_json = ?, completed_at = ? WHERE id = ?').run('COMPLETED', JSON.stringify(output), now(), invocationId);
    return { invocationId, toolId, output, evidence: { method: 'local-tool', toolId, invocationId } };
  } catch (error) {
    db.prepare('UPDATE tool_invocations SET status = ?, error_message = ?, completed_at = ? WHERE id = ?').run('FAILED', error.message, now(), invocationId);
    throw error;
  }
}

async function executeTool(toolId, input, catalog) {
  if (toolId === 'catalog.lookup') {
    const role = catalog.roles.get(input.role_id);
    if (!role) throw new HttpError(404, 'Role not found', 'role_not_found');
    return { role: publicRole(role) };
  }
  if (toolId === 'schema.validate') {
    const value = input.value && typeof input.value === 'object' ? input.value : {};
    const missing = (Array.isArray(input.required_keys) ? input.required_keys : []).filter((key) => value[key] === undefined || value[key] === null);
    return { valid: missing.length === 0, missing };
  }
  if (toolId === 'evidence.compare') {
    const declared = new Set(Array.isArray(input.declared) ? input.declared : []);
    const observed = new Set(Array.isArray(input.observed) ? input.observed : []);
    return { missing: [...declared].filter((item) => !observed.has(item)), unexpected: [...observed].filter((item) => !declared.has(item)) };
  }
  if (toolId === 'risk.score') {
    const likelihood = clamp(input.likelihood, 1, 5);
    const impact = clamp(input.impact, 1, 5);
    const controlEffectiveness = clamp(input.control_effectiveness ?? 0, 0, 1);
    const inherentScore = likelihood * impact;
    return { inherent_score: inherentScore, residual_score: Math.round(inherentScore * (1 - controlEffectiveness) * 100) / 100, method: 'likelihood × impact × (1 − control_effectiveness)', inputs: { likelihood, impact, control_effectiveness: controlEffectiveness } };
  }
  if (toolId === 'workflow.validate') {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    const errors = [];
    const ids = new Set();
    steps.forEach((step, index) => { if (!step.id || ids.has(step.id)) errors.push(`step ${index + 1} has a duplicate or missing id`); ids.add(step.id); if (!step.agent_id) errors.push(`step ${index + 1} has no agent_id`); if (!step.input_contract || !step.output_contract) errors.push(`step ${index + 1} requires input and output contracts`); });
    return { valid: errors.length === 0 && steps.length > 0 && steps.length <= 20, errors };
  }
  if (toolId === 'knowledge.retrieve') {
    const query = String(input.query || '').toLowerCase();
    const matches = catalog.catalog.roles.filter((role) => [role.title, role.family, role.mission, ...role.capabilities].join(' ').toLowerCase().includes(query)).slice(0, 20).map(publicRole);
    return { matches, method: 'local-catalog-search' };
  }
  throw new HttpError(404, 'Tool implementation not found', 'unknown_tool');
}

function clamp(value, min, max) { const number = Number(value); if (!Number.isFinite(number)) throw new HttpError(400, 'Numeric risk inputs are required', 'invalid_risk_input'); return Math.min(max, Math.max(min, number)); }
