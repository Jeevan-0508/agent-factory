import { id } from './util.mjs';

export const SCENARIOS = [
  { id: 'risk-assessment', name: 'Risk assessment', description: 'Risk Analyst → ERM Manager with deterministic scoring and evidence.', agents: ['risk_analyst', 'erm_manager'], input: { risk: { likelihood: 4, impact: 5, control_effectiveness: 0.4 }, evidence: ['control-logging', 'owner-risk-acceptance'] }, grants: ['risk_analyst', 'erm_manager'], tools: ['risk.score', 'evidence.compare'] },
  { id: 'ai-governance-review', name: 'AI governance review', description: 'AI Governance Manager → EU AI Act Specialist with control-gap mapping.', agents: ['ai_governance_manager', 'eu_ai_act_specialist'], input: { system_type: 'high-impact employment screening prototype', declared_controls: ['risk_management', 'human_oversight', 'data_governance', 'logging'], observed_controls: ['logging'] }, grants: ['ai_governance_manager', 'eu_ai_act_specialist'], tools: ['evidence.compare', 'schema.validate'] },
  { id: 'architecture-review', name: 'Architecture review', description: 'Solutions Architect → Security Engineer with structured evidence checks.', agents: ['solution_architect', 'security_engineer'], input: { requirements: ['local-only', 'bounded-tools', 'audit-trail'], required_keys: ['requirements'] }, grants: [], tools: ['schema.validate', 'catalog.lookup'] },
  { id: 'program-delivery', name: 'Program delivery', description: 'Program Manager → Risk Manager with delivery risk framing.', agents: ['program_manager', 'risk_manager'], input: { milestones: ['database', 'runtime', 'UI'], risks: ['dependency readiness', 'approval latency'], risk: { likelihood: 3, impact: 4, control_effectiveness: 0.25 } }, grants: ['program_manager'], tools: ['risk.score'] },
  { id: 'workflow-recovery', name: 'Workflow recovery', description: 'Deliberately failing step with bounded retry and recorded recovery evidence.', agents: ['solution_architect', 'backend_engineer'], input: { requirements: ['recovery'], required_keys: ['requirements'] }, grants: [], tools: ['schema.validate'] }
];

export function scenarioById(scenarioId) { return SCENARIOS.find((scenario) => scenario.id === scenarioId) || null; }

export function scenarioDefinition(scenario) {
  return { max_concurrency: 1, steps: scenario.agents.map((agentId, index) => ({ id: `${scenario.id}-${index + 1}`, agent_id: agentId, depends_on: index ? [`${scenario.id}-${index}`] : [], input_contract: { type: 'object' }, output_contract: { type: 'object' }, input_template: scenario.id === 'workflow-recovery' && index === 1 ? { failure_mode: 'deterministic_failure' } : index === 1 ? { scenario_handoff: true } : {}, retry_limit: scenario.id === 'workflow-recovery' ? 1 : 0 })) };
}
