export const EXPERIENCES = [
  { id: 'command-center', name: 'Command Center', mark: '⌁', mode: 'operations', description: 'Cinematic operations dashboard for governed coordination.' },
  { id: 'minimal-studio', name: 'Minimal Studio', mark: '—', mode: 'editorial', description: 'Quiet, editorial workspace for deliberate discovery.' },
  { id: 'cyberpunk-neon', name: 'Cyberpunk Neon', mark: '◉', mode: 'terminal', description: 'High-energy neon console for rapid investigation.' },
  { id: 'glass-universe', name: 'Glass Universe', mark: '◌', mode: 'glass', description: 'Layered glass observatory for connected systems.' },
  { id: 'agent-galaxy', name: 'Agent Galaxy', mark: '✦', mode: 'graph', description: 'Capability constellation built from explicit catalog evidence.' },
  { id: 'mythology-atlas', name: 'Mythology Atlas', mark: '✧', mode: 'atlas', description: 'Encyclopedic field guide to the mythic naming system.' },
  { id: 'retro-terminal', name: 'Retro Terminal', mark: '>', mode: 'retro', description: 'Keyboard-first catalog terminal for fast operators.' },
  { id: 'neo-brutalist-lab', name: 'Neo-Brutalist Lab', mark: '▣', mode: 'brutalist', description: 'Bold experimental lab for comparative role design.' }
];

export function experienceById(id) {
  return EXPERIENCES.find((item) => item.id === id) || EXPERIENCES[0];
}

function normalized(value) { return String(value || '').trim().toLowerCase(); }

export function buildCapabilityGraph(data) {
  const roles = (data.roles || []).slice(0, 120);
  const edgeMap = new Map();
  const addEdge = (a, b, evidence) => {
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join('::');
    const current = edgeMap.get(key) || { source: a, target: b, evidence: [], weight: 0 };
    if (!current.evidence.includes(evidence)) current.evidence.push(evidence);
    current.weight = current.evidence.length;
    edgeMap.set(key, current);
  };

  const capabilityOwners = new Map();
  for (const role of roles) {
    for (const capability of (role.capabilities || []).slice(0, 24)) {
      const key = normalized(capability);
      const owners = capabilityOwners.get(key) || [];
      if (owners.length < 24) owners.push(role.name);
      capabilityOwners.set(key, owners);
    }
  }
  for (const [capability, owners] of capabilityOwners) {
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) addEdge(owners[i], owners[j], `shared capability: ${capability}`);
    }
  }

  for (const workflow of data.workflow_templates || []) {
    const steps = workflow.steps || [];
    for (let i = 0; i < steps.length - 1; i += 1) addEdge(steps[i].role, steps[i + 1].role, `workflow: ${workflow.name}`);
  }

  const families = [...new Set(roles.map((role) => role.family))];
  const familyIndex = new Map(families.map((family, index) => [family, index]));
  const nodes = roles.map((role, index) => {
    const familyOffset = familyIndex.get(role.family) || 0;
    const angle = ((index * 137.5 + familyOffset * 17) % 360) * (Math.PI / 180);
    const radius = 190 + ((index * 53) % 130);
    return { id: role.name, label: role.display_name, family: role.family, x: 500 + Math.cos(angle) * radius, y: 330 + Math.sin(angle) * radius, runtime: role.runtime };
  });
  const edges = [...edgeMap.values()].sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source)).slice(0, 260);
  return { nodes, edges, evidence: 'Edges derive only from shared catalog capabilities or adjacent steps in an explicit workflow template.' };
}

function roleChip(ctx, role, className = '') {
  return ctx.el('button', { className: `experience-role-chip ${className}`, type: 'button', dataset: { roleId: role.name }, on: { click: () => ctx.openRole(role.name) } }, [
    ctx.el('span', { className: 'role-chip-mark', text: role.codename.slice(0, 1).toUpperCase() }),
    ctx.el('span', {}, [ctx.el('strong', { text: role.display_name }), ctx.el('small', { text: `${role.family} · ${role.runtime ? 'typed' : 'registry'}` })])
  ]);
}

function experienceIntro(ctx, eyebrow, title, description, actions = []) {
  return ctx.el('div', { className: 'experience-intro' }, [
    ctx.el('div', {}, [ctx.el('span', { className: 'experience-eyebrow', text: eyebrow }), ctx.el('h1', { text: title }), ctx.el('p', { text: description })]),
    ctx.el('div', { className: 'experience-actions' }, actions)
  ]);
}

function metrics(ctx) {
  return ctx.el('div', { className: 'experience-metrics' }, [
    ctx.metricCard('ROLES', ctx.data.roles.length, 'catalog', '100'),
    ctx.metricCard('TYPED', ctx.data.runtime_supported_roles.length, 'approved surface', '30'),
    ctx.metricCard('REGISTRY', ctx.data.registry_only_roles.length, 'needs promotion', '70'),
    ctx.metricCard('FLOWS', ctx.data.workflow_templates.length, 'design templates', '05')
  ]);
}

function commandCenter(ctx) {
  const families = Object.entries(ctx.data.family_counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...families.map(([, count]) => count));
  return ctx.el('div', { className: 'experience-surface command-center-surface' }, [
    experienceIntro(ctx, 'COMMAND CENTER / 01', 'A governed team for ambitious work.', 'Coordinate 100 specialist roles through evidence, explicit boundaries, and human approval.', [ctx.button('Explore agents', 'primary', () => ctx.setView('agents')), ctx.button('Design workflow', 'ghost', () => ctx.setView('workflows'))]),
    ctx.el('div', { className: 'command-hero' }, [ctx.el('div', { className: 'command-hero-copy' }, [ctx.el('span', { className: 'hero-index', text: 'AGENT FACTORY / MULTIVERSE' }), ctx.el('h2', { text: 'Make coordination feel like a product.' }), ctx.el('p', { text: 'The same governed registry, re-composed for eight distinct ways of thinking.' })]), ctx.el('div', { className: 'command-hero-signal' }, [ctx.el('span', { text: 'SYSTEM STATE' }), ctx.el('strong', { text: 'CATALOG SNAPSHOT' }), ctx.el('small', { text: 'No live telemetry claimed' })])]),
    metrics(ctx),
    ctx.el('div', { className: 'command-columns' }, [
      ctx.el('section', { className: 'command-panel' }, [ctx.el('div', { className: 'section-kicker', text: 'COVERAGE MAP' }), ctx.el('h2', { text: 'Role families' }), ctx.el('div', { className: 'family-bars' }, families.map(([family, count]) => ctx.el('div', { className: 'family-bar-row' }, [ctx.el('span', { text: family }), ctx.el('span', { className: 'bar-track' }, [ctx.el('span', { style: { width: `${Math.round((count / max) * 100)}%` } })]), ctx.el('b', { text: String(count).padStart(2, '0') })]))) ]),
      ctx.el('section', { className: 'command-panel signal-panel' }, [ctx.el('div', { className: 'section-kicker', text: 'TRUTH MODEL' }), ctx.el('h2', { text: 'Declared ≠ running' }), ctx.el('p', { text: 'Runtime compatibility is a versioned catalog fact, not a heartbeat, authorization grant, or performance claim.' }), ctx.badge('Human approval first', 'amber'), ctx.button('Read governance', 'small ghost', () => ctx.setView('governance'))])
    ])
  ]);
}

function minimalStudio(ctx) {
  const featured = ctx.data.roles.filter((role) => role.runtime).slice(0, 6);
  return ctx.el('div', { className: 'experience-surface minimal-surface' }, [
    experienceIntro(ctx, 'FIELD NOTES / 02', 'The agent index.', 'A quiet editorial workspace for choosing the right specialist before the work begins.', [ctx.button('Open full index', 'dark-button', () => ctx.setView('agents'))]),
    ctx.el('div', { className: 'minimal-rule' }),
    ctx.el('div', { className: 'minimal-columns' }, [
      ctx.el('div', { className: 'minimal-display' }, [ctx.el('span', { text: '100' }), ctx.el('p', { text: 'documented roles across engineering, governance, people, research, and operations.' }), ctx.el('button', { className: 'text-link', type: 'button', on: { click: () => ctx.setView('prompts') } }, ['Open prompt studio →'])]),
      ctx.el('div', { className: 'minimal-list' }, [ctx.el('span', { className: 'section-kicker', text: 'SELECTED FROM THE TYPED SURFACE' }), ...featured.map((role, index) => ctx.el('div', { className: 'minimal-row' }, [ctx.el('span', { className: 'minimal-number', text: String(index + 1).padStart(2, '0') }), roleChip(ctx, role), ctx.el('span', { className: 'minimal-arrow', text: '↗' })]))])
    ]),
    ctx.el('div', { className: 'minimal-footer' }, [ctx.el('span', { text: 'Every role exposes its boundaries before delegation.' }), ctx.el('span', { className: 'mono', text: 'AF / 1.1.0 / LOCAL' })])
  ]);
}

function cyberpunk(ctx) {
  const roles = ctx.data.roles.filter((role) => role.runtime).slice(0, 8);
  return ctx.el('div', { className: 'experience-surface cyber-surface' }, [
    experienceIntro(ctx, 'NEON GRID // 03', 'Signal detected.', 'A high-energy operator console for scanning the 100-role registry and routing work to a bounded specialist.', [ctx.button('Scan registry', 'cyber-button', () => ctx.setView('agents')), ctx.button('Open evidence lab', 'cyber-button ghost', () => ctx.setView('evaluations'))]),
    ctx.el('div', { className: 'cyber-readout' }, [ctx.el('span', { text: '> AGENT_FACTORY.STATUS' }), ctx.el('strong', { text: 'LOCAL SNAPSHOT / NO EXECUTOR / GOVERNED' }), ctx.el('span', { text: '> 100 NODES // 11 FAMILIES // 05 WORKFLOW TEMPLATES' })]),
    ctx.el('div', { className: 'cyber-grid' }, [ctx.el('section', { className: 'cyber-board' }, [ctx.el('div', { className: 'cyber-label', text: 'TYPED SURFACE / CATALOG COMPATIBILITY' }), ...roles.map((role, index) => ctx.el('button', { className: 'cyber-row', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: `0${index + 1}` }), ctx.el('strong', { text: role.display_name }), ctx.el('span', { text: role.family }), ctx.el('b', { text: 'TYPED' })]))]), ctx.el('aside', { className: 'cyber-aside', ariaLabel: 'Boundary notice' }, [ctx.el('div', { className: 'cyber-label', text: 'BOUNDARY NOTICE' }), ctx.el('p', { text: 'No provider calls, agent execution, or fabricated telemetry are connected to this build.' }), ctx.el('div', { className: 'cyber-meter' }, [ctx.el('span', { style: { width: '30%' } })]), ctx.el('small', { text: 'catalog compatibility 30 / 100' })])])
  ]);
}

function glassUniverse(ctx) {
  const familyCards = Object.entries(ctx.data.family_counts).slice(0, 6);
  return ctx.el('div', { className: 'experience-surface glass-surface' }, [
    experienceIntro(ctx, 'OBSERVATORY / 04', 'A universe of specialists.', 'A layered glass observatory where capability, governance, and workflow shape remain visible together.', [ctx.button('Enter galaxy', 'glass-button', () => { ctx.state.experience = 'agent-galaxy'; ctx.applyExperience(); ctx.render(); })]),
    ctx.el('div', { className: 'glass-orbit orbit-one' }), ctx.el('div', { className: 'glass-orbit orbit-two' }),
    ctx.el('div', { className: 'glass-deck' }, [ctx.el('section', { className: 'glass-panel glass-feature' }, [ctx.el('span', { className: 'glass-kicker', text: 'PRIMARY CONSTELLATION' }), ctx.el('strong', { text: '100' }), ctx.el('p', { text: 'agents are documented as explicit contracts with capabilities, outputs, limits, and maintenance metadata.' }), ctx.button('Browse profiles', 'small glass-button', () => ctx.setView('agents'))]), ...familyCards.map(([family, count], index) => ctx.el('article', { className: `glass-panel glass-card glass-card-${index + 1}` }, [ctx.el('span', { text: `0${index + 1}` }), ctx.el('h2', { text: family }), ctx.el('strong', { text: String(count).padStart(2, '0') }), ctx.el('small', { text: 'catalog roles' })]))]),
    ctx.el('div', { className: 'glass-footnote' }, [ctx.badge('Observed catalog fact', 'green'), ctx.el('span', { text: 'Glass is presentation; governance remains structural.' })])
  ]);
}

function galaxy(ctx) {
  const graph = ctx.graph;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lines = graph.edges.map((edge) => { const a = nodeById.get(edge.source); const b = nodeById.get(edge.target); return a && b ? ctx.el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, className: 'galaxy-edge', opacity: Math.min(.75, .16 + edge.weight * .15) }) : null; }).filter(Boolean);
  const nodes = graph.nodes.map((node) => ctx.el('g', { className: 'galaxy-node', role: 'presentation', tabIndex: -1, on: { click: () => ctx.openRole(node.id) } }, [ctx.el('circle', { cx: node.x, cy: node.y, r: node.runtime ? 6 : 4, className: node.runtime ? 'galaxy-dot runtime' : 'galaxy-dot registry' }), ctx.el('title', { text: `${node.label} · ${node.family}` })]));
  const strongest = graph.edges.slice(0, 10).map((edge) => { const a = ctx.roleById(edge.source); const b = ctx.roleById(edge.target); return ctx.el('li', {}, [ctx.el('button', { className: 'galaxy-relation', type: 'button', on: { click: () => ctx.openRole(edge.source) } }, [ctx.el('strong', { text: a.display_name }), ctx.el('span', { text: `↔ ${b.display_name}` }), ctx.el('small', { text: edge.evidence.join(' · ') })])]); });
  const directory = ctx.el('details', { className: 'galaxy-directory' }, [ctx.el('summary', { text: 'Open accessible agent directory (100 roles)' }), ctx.el('div', { className: 'galaxy-directory-list' }, graph.nodes.map((node) => { const role = ctx.roleById(node.id); return role ? roleChip(ctx, role) : null; }))]);
  return ctx.el('div', { className: 'experience-surface galaxy-surface' }, [
    experienceIntro(ctx, 'CAPABILITY CONSTELLATION / 05', 'Agent Galaxy.', 'A navigable map of 100 agents. Lines are evidence-backed relationships from shared capabilities and adjacent workflow steps.', [ctx.button('Open searchable index', 'galaxy-button', () => ctx.setView('agents'))]),
      ctx.el('div', { className: 'galaxy-layout' }, [ctx.el('section', { className: 'galaxy-canvas panel' }, [ctx.el('svg', { className: 'galaxy-svg', viewBox: '0 0 1000 660', role: 'group', ariaLabel: 'Agent Galaxy showing catalog-backed relationships among 100 agents' }, [ctx.el('rect', { x: 0, y: 0, width: 1000, height: 660, className: 'galaxy-space' }), ...lines, ...nodes]), ctx.el('div', { className: 'galaxy-legend' }, [ctx.badge('typed runtime', 'green'), ctx.badge('registry-only', 'amber'), ctx.el('span', { text: `${graph.edges.length} explicit relationships shown` })])]), ctx.el('aside', { className: 'galaxy-inspector', ariaLabel: 'Relationship evidence' }, [ctx.el('div', { className: 'section-kicker', text: 'RELATIONSHIP EVIDENCE' }), ctx.el('h2', { text: 'Strongest links' }), ctx.el('p', { text: graph.evidence }), ctx.el('ol', { className: 'galaxy-relations' }, strongest), directory])])
  ]);
}

function atlas(ctx) {
  const groups = new Map();
  for (const role of ctx.data.roles) { const list = groups.get(role.mythology) || []; list.push(role); groups.set(role.mythology, list); }
  const sections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mythology, roles]) => ctx.el('section', { className: 'atlas-section' }, [ctx.el('div', { className: 'atlas-heading' }, [ctx.el('span', { text: mythology }), ctx.el('b', { text: String(roles.length).padStart(2, '0') })]), ctx.el('div', { className: 'atlas-roles' }, roles.slice(0, 8).map((role) => roleChip(ctx, role, 'atlas-chip'))), roles.length > 8 ? ctx.el('small', { text: `+ ${roles.length - 8} more in the full index` }) : null]));
  return ctx.el('div', { className: 'experience-surface atlas-surface' }, [experienceIntro(ctx, 'FIELD GUIDE / 06', 'Mythology Atlas.', 'Mythic names are navigation labels and cultural references; the documented role contract defines the actual capability.', [ctx.button('Open encyclopedia', 'atlas-button', () => ctx.setView('agents'))]), ctx.el('div', { className: 'atlas-note' }, [ctx.el('strong', { text: 'Reading rule' }), ctx.el('span', { text: 'Codename ≠ capability. Always inspect mission, outputs, boundaries, and runtime status.' })]), ctx.el('div', { className: 'atlas-grid' }, sections)]);
}

function retroTerminal(ctx) {
  const roles = ctx.data.roles.slice(0, 12);
  const commandInput = ctx.el('input', { className: 'terminal-input', type: 'search', placeholder: 'type a role, alias, family, or capability…', ariaLabel: 'Terminal search', on: { keydown: (event) => { if (event.key === 'Enter') { ctx.setSearch(event.target.value); ctx.setView('agents'); } } } });
  return ctx.el('div', { className: 'experience-surface retro-surface' }, [
    experienceIntro(ctx, 'AF-TERM / 07', 'Agent Factory terminal.', 'A keyboard-first catalog shell. Type a query and press Enter to jump into the shared explorer.', [ctx.button('Open workflow shell', 'terminal-button', () => ctx.setView('workflows'))]),
    ctx.el('div', { className: 'terminal-window' }, [ctx.el('div', { className: 'terminal-bar' }, [ctx.el('span', { text: '●' }), ctx.el('span', { text: '●' }), ctx.el('span', { text: '●' }), ctx.el('strong', { text: 'agent-factory.local' })]), ctx.el('div', { className: 'terminal-body' }, [ctx.el('p', { text: 'AGENT FACTORY BIOS v1.1.0' }), ctx.el('p', { text: '100 roles / 30 typed / 70 registry / 5 workflows' }), ctx.el('p', { text: 'All output is catalog-backed. No execution channel attached.' }), ctx.el('label', { className: 'terminal-prompt' }, [ctx.el('span', { text: 'af> ' }), commandInput]), ctx.el('div', { className: 'terminal-list' }, roles.map((role, index) => ctx.el('button', { className: 'terminal-line', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: String(index + 1).padStart(2, '0') }), ctx.el('strong', { text: role.display_name }), ctx.el('span', { text: role.family }), ctx.el('span', { text: role.runtime ? '[TYPED]' : '[REG]' })])))])])
  ]);
}

function brutalist(ctx) {
  const roles = ctx.data.roles.filter((role) => role.runtime).slice(0, 5);
  return ctx.el('div', { className: 'experience-surface brutalist-surface' }, [
    experienceIntro(ctx, 'LAB NOTE / 08', '100 agents. No soft edges.', 'A direct, graphic workspace for comparing role contracts, feasibility, and governance boundaries.', [ctx.button('Open all roles', 'brutalist-button', () => ctx.setView('agents'))]),
    ctx.el('div', { className: 'brutalist-banner' }, [ctx.el('span', { text: 'GOVERNED' }), ctx.el('strong', { text: 'NOT AUTONOMOUS' }), ctx.el('span', { text: 'CATALOG / PROMPTS / WORKFLOWS / EVIDENCE' })]),
    ctx.el('div', { className: 'brutalist-grid' }, [ctx.el('article', { className: 'brutalist-block block-yellow' }, [ctx.el('span', { text: '01' }), ctx.el('strong', { text: '100' }), ctx.el('p', { text: 'roles in the registry' })]), ctx.el('article', { className: 'brutalist-block block-pink' }, [ctx.el('span', { text: '02' }), ctx.el('strong', { text: '30 / 70' }), ctx.el('p', { text: 'typed / registry-only' })]), ctx.el('article', { className: 'brutalist-block block-blue' }, [ctx.el('span', { text: '03' }), ctx.el('strong', { text: '05' }), ctx.el('p', { text: 'workflow templates' })]), ...roles.map((role, index) => ctx.el('button', { className: 'brutalist-role', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: `0${index + 4}` }), ctx.el('strong', { text: role.title }), ctx.el('small', { text: role.display_name }), ctx.el('b', { text: 'OPEN →' })]))])
  ]);
}

export function renderExperienceOverview(ctx) {
  switch (ctx.state.experience) {
    case 'minimal-studio': return minimalStudio(ctx);
    case 'cyberpunk-neon': return cyberpunk(ctx);
    case 'glass-universe': return glassUniverse(ctx);
    case 'agent-galaxy': return galaxy(ctx);
    case 'mythology-atlas': return atlas(ctx);
    case 'retro-terminal': return retroTerminal(ctx);
    case 'neo-brutalist-lab': return brutalist(ctx);
    default: return commandCenter(ctx);
  }
}

function experienceAgentHeader(ctx) {
  const current = experienceById(ctx.state.experience);
  return experienceIntro(ctx, `${current.name.toUpperCase()} / AGENT INDEX`, 'Find the right specialist.', 'Every experience reads the same 100-role registry. Presentation changes; contracts, prompts, workflows, and governance do not.', [ctx.button('Back to experience', 'ghost', () => ctx.setView('overview'))]);
}

export function renderExperienceAgents(ctx) {
  const roles = ctx.filteredRoles();
  const toolbar = ctx.agentToolbar();
  const current = ctx.state.experience;
  if (current === 'agent-galaxy') return ctx.el('div', { className: 'experience-surface galaxy-agent-index' }, [experienceAgentHeader(ctx), toolbar, galaxy({ ...ctx, state: { ...ctx.state, experience: 'agent-galaxy' } })]);
  if (current === 'retro-terminal') return ctx.el('div', { className: 'experience-surface retro-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'terminal-list full-terminal-list' }, roles.map((role, index) => ctx.el('button', { className: 'terminal-line', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: String(index + 1).padStart(3, '0') }), ctx.el('strong', { text: role.display_name }), ctx.el('span', { text: role.family }), ctx.el('span', { text: role.runtime ? '[TYPED]' : '[REG]' })]))) ]);
  if (current === 'mythology-atlas') return ctx.el('div', { className: 'experience-surface atlas-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'atlas-agent-grid' }, roles.map((role) => roleChip(ctx, role, 'atlas-chip')))]);
  if (current === 'minimal-studio') return ctx.el('div', { className: 'experience-surface minimal-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'minimal-agent-list' }, roles.map((role, index) => ctx.el('div', { className: 'minimal-row' }, [ctx.el('span', { className: 'minimal-number', text: String(index + 1).padStart(3, '0') }), roleChip(ctx, role), ctx.el('p', { text: role.mission }), ctx.el('span', { className: 'minimal-arrow', text: '↗' })])))]);
  if (current === 'neo-brutalist-lab') return ctx.el('div', { className: 'experience-surface brutalist-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'brutalist-agent-grid' }, roles.map((role, index) => ctx.el('button', { className: 'brutalist-role', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: String(index + 1).padStart(3, '0') }), ctx.el('strong', { text: role.title }), ctx.el('small', { text: `${role.display_name} · ${role.family}` }), ctx.el('b', { text: role.runtime ? 'TYPED' : 'REGISTRY' })])))]);
  if (current === 'cyberpunk-neon') return ctx.el('div', { className: 'experience-surface cyber-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'cyber-board' }, roles.map((role, index) => ctx.el('button', { className: 'cyber-row', type: 'button', on: { click: () => ctx.openRole(role.name) } }, [ctx.el('span', { text: String(index + 1).padStart(3, '0') }), ctx.el('strong', { text: role.display_name }), ctx.el('span', { text: role.mission }), ctx.el('b', { text: role.runtime ? 'TYPED' : 'REGISTRY' })]))) ]);
  if (current === 'glass-universe') return ctx.el('div', { className: 'experience-surface glass-agent-index' }, [experienceAgentHeader(ctx), toolbar, ctx.el('div', { className: 'glass-agent-deck' }, roles.map((role) => ctx.el('article', { className: 'glass-panel glass-agent-card' }, [ctx.el('span', { className: 'glass-kicker', text: role.family }), ctx.el('h2', { text: role.title }), ctx.el('p', { text: role.mission }), ctx.tags(role.capabilities.slice(0, 3)), ctx.button('Open profile', 'small glass-button', () => ctx.openRole(role.name))])))]);
  return ctx.el('div', { className: 'experience-surface command-agent-index' }, [experienceAgentHeader(ctx), toolbar, roles.length ? ctx.el('div', { className: 'agent-grid' }, roles.map(ctx.agentCard)) : ctx.el('div', { className: 'empty-state' }, [ctx.el('h2', { text: 'No roles found' }), ctx.el('p', { text: 'Try clearing a filter or searching for a family, alias, or capability.' })])]);
}
