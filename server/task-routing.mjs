import { HttpError } from './util.mjs';

const RULES = [
  { terms: ['security', 'auth', 'credential', 'vulnerability', 'owasp', 'threat'], roles: ['security_engineer', 'risk_manager'] },
  { terms: ['privacy', 'personal data', 'gdpr', 'eu ai act', 'governance', 'compliance'], roles: ['compliance_governance', 'privacy_engineer'] },
  { terms: ['frontend', 'dashboard', 'ui', 'css', 'browser', 'responsive'], roles: ['frontend_engineer', 'ux_designer'] },
  { terms: ['backend', 'api', 'server', 'database', 'sqlite'], roles: ['backend_engineer', 'systems_architect'] },
  { terms: ['performance', 'latency', 'load', 'benchmark', 'memory'], roles: ['performance_engineer'] },
  { terms: ['documentation', 'readme', 'guide', 'docs'], roles: ['documentation_writer'] },
  { terms: ['release', 'deploy', 'publish', 'ci', 'pipeline'], roles: ['release_manager', 'devops_engineer'] },
  { terms: ['test', 'regression', 'playwright', 'qa'], roles: ['qa_test_engineer'] }
];

const COMPLEXITY_TERMS = ['integrate', 'migration', 'multi-repo', 'architecture', 'workflow', 'governance', 'production', 'security'];

export function createTaskRouter({ catalog }) {
  const roleMap = new Map(catalog.roles.map((role) => [role.name, role]));
  function preview({ objective, repository = '', requirements = [] } = {}) {
    if (typeof objective !== 'string' || objective.trim().length < 3 || objective.length > 4_000) throw new HttpError(400, 'Task objective is invalid', 'invalid_task_objective');
    const text = `${objective} ${repository} ${Array.isArray(requirements) ? requirements.join(' ') : ''}`.toLowerCase();
    const matches = RULES.filter((rule) => rule.terms.some((term) => text.includes(term)));
    const complexity = COMPLEXITY_TERMS.filter((term) => text.includes(term)).length + (objective.length > 500 ? 1 : 0);
    const roles = new Set();
    for (const match of matches) for (const role of match.roles) if (roleMap.get(role)?.runtime) roles.add(role);
    if (complexity >= 2) roles.add('solution_architect');
    if (!roles.size) roles.add('requirements_analyst');
    if (complexity >= 1 || matches.length > 1) roles.add('qa_test_engineer');
    const priority = ['solution_architect', 'security_engineer', 'qa_test_engineer'];
    const selected = [...roles].filter((role) => roleMap.has(role)).sort((left, right) => {
      const leftRank = priority.includes(left) ? priority.indexOf(left) : priority.length;
      const rightRank = priority.includes(right) ? priority.indexOf(right) : priority.length;
      return leftRank - rightRank;
    }).slice(0, complexity >= 3 ? 5 : 3);
    return {
      objective: objective.trim(),
      complexity: complexity >= 3 ? 'high' : complexity >= 1 ? 'medium' : 'low',
      risk: matches.some((match) => match.roles.includes('security_engineer')) ? 'high' : matches.some((match) => match.roles.includes('compliance_governance')) ? 'medium' : 'standard',
      selected_roles: selected,
      reasons: matches.map((match) => ({ terms: match.terms.filter((term) => text.includes(term)), roles: match.roles.filter((role) => selected.includes(role)) })).filter((item) => item.roles.length),
      workflow: ['DISCOVER', 'PLAN', 'CHALLENGE', 'APPROVE', 'IMPLEMENT', 'TEST', 'REVIEW', 'REPAIR', 'VERIFY', 'COMPLETE'],
      release_approval_separate: true,
      execution_mode: 'selection-preview-only'
    };
  }
  return { preview };
}
