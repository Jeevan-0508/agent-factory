import { EXPERIENCES, buildCapabilityGraph, experienceById, renderExperienceAgents, renderExperienceOverview } from './experiences.js';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const sidebar = document.querySelector('#sidebar');
const pageLabel = document.querySelector('#page-label');
const SVG_TAGS = new Set(['svg', 'g', 'circle', 'line', 'rect', 'title']);
const STATIC_SHOWCASE = location.hostname.endsWith('github.io') || location.port === '4173';
const APP_MODULE_URL = new URL(import.meta.url);
const CATALOG_URL = APP_MODULE_URL.pathname.endsWith('/dashboard/app.js')
  ? new URL('../catalog/roles.json', APP_MODULE_URL).href
  : new URL('./catalog/roles.json', APP_MODULE_URL).href;
const COUNCIL_AGENT_IDS = ['solution_architect', 'backend_engineer', 'frontend_engineer', 'security_engineer', 'risk_manager', 'ai_governance_manager', 'qa_test_engineer', 'performance_engineer', 'documentation_writer', 'release_manager'];
let divineCouncilApi = null;
const viewAliases = { 'council-of-entities': 'divine-council' };
const initialRequestedView = location.hash.slice(1) || 'overview';
const initialView = viewAliases[initialRequestedView] || initialRequestedView;

const state = {
  data: null,
  view: initialView,
  search: '',
  family: '',
  runtime: '',
  sort: 'title',
  agentId: null,
  promptRoleId: null,
  promptFilter: '',
  promptTemplate: 'Role brief',
  promptContext: '',
  workflowId: null,
  workflow: null,
  execution: {
    status: 'disconnected',
    error: '',
    loading: false,
    killSwitch: false,
    scenarios: [],
    providers: [],
    workflows: [],
    roles: [],
    selectedTask: null,
    selectedRun: null,
    events: [],
    evidence: null
  },
  olympus: {
    status: 'disconnected',
    loading: false,
    error: '',
    templates: [],
    organizations: [],
    selected: null
  },
  council: { status: 'disconnected', loading: false, error: '', data: null },
  godLoop: { status: 'disconnected', loading: false, error: '', runs: [], selected: null },
  theme: localStorage.getItem('agent-factory-theme') || 'dark',
  experience: localStorage.getItem('agent-factory-experience') || 'command-center',
  graph: null
};

const viewLabels = {
  overview: 'Overview', 'divine-council': 'Council of Entities', agents: 'Agent explorer', olympus: 'OLYMPUS builder', council: 'Engineering Council', 'god-loop': 'GOD LOOP console', 'agent-detail': 'Agent profile', prompts: 'Prompt Studio', workflows: 'Workflow designer', execution: 'Execution console', evaluations: 'Evaluation lab', governance: 'Governance'
};
const validViews = new Set(Object.keys(viewLabels));
if (!validViews.has(state.view)) state.view = 'overview';

function el(tag, options = {}, children = []) {
  const node = SVG_TAGS.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = value;
    else if (key === 'on') for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = value;
    else if (key === 'selected') node.selected = value;
    else if (key === 'ariaLabel') { if (value) node.setAttribute('aria-label', value); }
    else if (key === 'ariaCurrent') node.setAttribute('aria-current', value);
    else if (key === 'htmlFor') node.setAttribute('for', value);
    else if (key === 'disabled') node.disabled = value;
    else if (key === 'href') node.href = value;
    else if (key === 'target') node.target = value;
    else if (key === 'rel') node.rel = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child) node.append(child.nodeType ? child : document.createTextNode(String(child)));
  return node;
}

function button(label, className, handler, options = {}) {
  return el('button', { className: `button ${className || ''}`, type: 'button', disabled: Boolean(options.disabled), on: { click: handler }, ariaLabel: options.ariaLabel }, [label]);
}

function list(items, className = '') {
  return el('ul', { className }, items.map((item) => el('li', { text: item })));
}

function badge(text, tone = '') { return el('span', { className: `pill ${tone}` }, [el('span', { className: 'status-dot' }), text]); }
function tag(text) { return el('span', { className: 'tag', text }); }
function tags(items) { return el('div', { className: 'tag-list' }, items.map(tag)); }

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

async function copyText(value, success = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = el('textarea', { value });
    input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
  }
  showToast(success);
}

function downloadText(filename, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`);
}

function roleById(id) { return state.data.roles.find((role) => role.name === id); }
function familyCount(family) { return state.data.roles.filter((role) => role.family === family).length; }
function roleRuntimeLabel(role) { return role.runtime ? 'Typed runtime' : 'Registry only'; }
function roleRuntimeTone(role) { return role.runtime ? 'green' : 'amber'; }

function normalizeCatalog(data) {
  const family_counts = data.roles.reduce((counts, role) => {
    counts[role.family] = (counts[role.family] || 0) + 1;
    return counts;
  }, {});
  return { ...data, family_counts };
}

function applyExperience() {
  const experience = experienceById(state.experience);
  state.experience = experience.id;
  document.documentElement.dataset.experience = experience.id;
  const selector = document.querySelector('#experience-select');
  if (selector) selector.value = experience.id;
  localStorage.setItem('agent-factory-experience', experience.id);
}

function setExperience(experience) {
  state.experience = experience;
  applyExperience();
  render();
}

function restoreFocus(selector, value = '') {
  const node = document.querySelector(selector);
  if (!node) return;
  node.focus({ preventScroll: true });
  if (typeof node.setSelectionRange === 'function' && value) node.setSelectionRange(value.length, value.length);
}

async function openDivineCouncil() {
  try {
    const module = await import('./divine-council/divine-council.js');
    divineCouncilApi = module.mountDivineCouncil({ catalog: state.data, onEnterFactory: () => setView('overview', true) });
  } catch (error) {
    state.view = 'overview';
    render();
    showToast('The Council of Entities could not load. The dashboard remains available.');
    console.warn('Council of Entities unavailable', error);
  }
}

async function setView(view, replace = false) {
  if (view === 'divine-council') {
    state.view = view;
    if (replace) history.replaceState({}, '', `#${view}`); else location.hash = view;
    updateNav();
    setSidebarOpen(false);
    await openDivineCouncil();
    return;
  }
  state.view = view;
  state.agentId = null;
  if (replace) history.replaceState({}, '', `#${view}`); else location.hash = view;
  render();
  setSidebarOpen(false);
  app.focus({ preventScroll: true });
}

function setSidebarOpen(open) {
  sidebar.classList.toggle('is-open', open);
  const mobile = window.matchMedia('(max-width: 780px)').matches;
  const mobileMenu = document.querySelector('#mobile-menu');
  mobileMenu?.setAttribute('aria-expanded', String(open));
  mobileMenu?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  if (mobile) {
    sidebar.inert = !open;
    sidebar.setAttribute('aria-hidden', String(!open));
    if (open) requestAnimationFrame(() => sidebar.querySelector('.nav-item')?.focus({ preventScroll: true }));
  } else {
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden', 'false');
  }
}

function updateNav() {
  const active = state.view === 'agent-detail' ? 'agents' : state.view;
  document.querySelectorAll('.nav-item').forEach((item) => {
    const selected = item.dataset.view === active;
    item.classList.toggle('is-active', selected);
    item.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  pageLabel.textContent = viewLabels[state.view] || 'Overview';
  document.querySelector('#nav-agent-count').textContent = state.data?.roles.length ?? '—';
  document.querySelector('#nav-workflow-count').textContent = state.data?.workflow_templates.length ?? '—';
}

function openRole(roleId) {
  state.agentId = roleId;
  state.view = 'agent-detail';
  location.hash = 'agent-detail';
  render();
  restoreFocus('.detail-header h1');
}

function setSearch(value) {
  state.search = value;
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    const allowedHosts = new Set(['eur-lex.europa.eu', 'digital-strategy.ec.europa.eu', 'www.nist.gov']);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function runtimeRequest(path, options = {}) {
  const request = async () => fetch(`/api/v1${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let response = await request();
  if (response.status === 401) {
    await fetch('/api/v1/session', { credentials: 'same-origin' });
    response = await request();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Runtime request failed: ${response.status}`);
  return payload;
}

async function loadRuntime() {
  if (state.execution.loading) return;
  if (STATIC_SHOWCASE) {
    state.execution.status = 'showcase';
    state.execution.error = 'Local runtime required for execution; backend calls are disabled in the public showcase.';
    return;
  }
  state.execution.loading = true;
  state.execution.error = '';
  render();
  try {
    await runtimeRequest('/session');
    const [scenarios, providers, workflows, roles, killSwitch] = await Promise.all([
      runtimeRequest('/scenarios'), runtimeRequest('/providers'), runtimeRequest('/workflows'), runtimeRequest('/agents'), runtimeRequest('/runtime/kill-switch')
    ]);
    state.execution.scenarios = scenarios.scenarios || [];
    state.execution.providers = providers.providers || [];
    state.execution.workflows = workflows.workflows || [];
    state.execution.roles = roles.roles || [];
    state.execution.killSwitch = Boolean(killSwitch.active);
    state.execution.status = 'connected';
  } catch (error) {
    state.execution.status = 'disconnected';
    state.execution.error = error.message;
  } finally {
    state.execution.loading = false;
    render();
  }
}

async function runtimeAction(path, method = 'POST', body = {}) {
  try {
    return await runtimeRequest(path, { method, body: JSON.stringify(body) });
  } catch (error) {
    state.execution.error = error.message;
    showToast(error.message);
    render();
    throw error;
  }
}

async function loadOlympus() {
  if (state.olympus.loading) return;
  if (STATIC_SHOWCASE) {
    state.olympus.status = 'showcase';
    state.olympus.error = 'Backend disabled in the static showcase.';
    return;
  }
  state.olympus.loading = true;
  state.olympus.error = '';
  render();
  try {
    await runtimeRequest('/session');
    const [templates, organizations] = await Promise.all([runtimeRequest('/olympus/templates'), runtimeRequest('/olympus/organizations')]);
    state.olympus.templates = templates.templates || [];
    state.olympus.organizations = organizations.organizations || [];
    state.olympus.status = 'connected';
  } catch (error) {
    state.olympus.status = 'disconnected';
    state.olympus.error = error.message;
  } finally {
    state.olympus.loading = false;
    render();
  }
}

async function loadCouncil() {
  if (state.council.loading || STATIC_SHOWCASE) {
    if (STATIC_SHOWCASE) state.council.status = 'showcase';
    return;
  }
  state.council.loading = true;
  try {
    await runtimeRequest('/session');
    state.council.data = await runtimeRequest('/olympus/council');
    state.council.status = 'connected';
  } catch (error) {
    state.council.status = 'disconnected';
    state.council.error = error.message;
  } finally {
    state.council.loading = false;
    render();
  }
}

async function initializeCouncil() {
  try {
    state.council.data = await runtimeAction('/olympus/council', 'POST', {});
    state.council.status = 'connected';
    render();
  } catch { /* runtimeAction reports the bounded error */ }
}

async function loadGodLoops() {
  if (state.godLoop.loading || STATIC_SHOWCASE) {
    if (STATIC_SHOWCASE) state.godLoop.status = 'showcase';
    return;
  }
  state.godLoop.loading = true;
  try {
    await runtimeRequest('/session');
    state.godLoop.runs = (await runtimeRequest('/god-loops')).runs || [];
    state.godLoop.status = 'connected';
  } catch (error) {
    state.godLoop.status = 'disconnected';
    state.godLoop.error = error.message;
  } finally {
    state.godLoop.loading = false;
    render();
  }
}

async function createGodLoop(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  try {
    const created = await runtimeAction('/god-loops', 'POST', { objective: formData.get('objective'), repository_scope: formData.get('repository_scope'), acceptance_criteria: String(formData.get('acceptance_criteria') || '').split('\n').map((item) => item.trim()).filter(Boolean), allowed_tools: ['schema.validate', 'workflow.validate'], authorized_agents: ['solution_architect', 'qa_test_engineer'], max_iterations: Number(formData.get('max_iterations') || 5), max_concurrent_agents: 2, max_time_ms: 1800000, spending_limit: 0, approval_required: true });
    state.godLoop.runs = [created, ...state.godLoop.runs];
    state.godLoop.selected = created;
    render();
  } catch { /* runtimeAction reports the bounded error */ }
}

async function selectGodLoop(runId) {
  try {
    state.godLoop.selected = await runtimeRequest(`/god-loops/${runId}`);
    render();
  } catch (error) {
    state.godLoop.error = error.message;
    render();
  }
}

async function approveGodLoop(runId) {
  try {
    state.godLoop.selected = await runtimeAction(`/god-loops/${runId}/approve`, 'POST', {});
    state.godLoop.runs = state.godLoop.runs.map((run) => run.id === runId ? { ...run, status: 'APPROVED' } : run);
    render();
  } catch { /* runtimeAction reports the bounded error */ }
}

function renderCouncil() {
  const roles = COUNCIL_AGENT_IDS.map((agentId) => roleById(agentId)).filter(Boolean);
  const data = state.council.data;
  return el('div', {}, [
    pageHeading('Engineering Council', 'Build the builder with accountable roles.', 'The council is a local OLYMPUS organization composed only of catalog identities. Codex coordinates the workflow; humans retain approval and release ownership.', [el('button', { className: 'button primary', type: 'button', disabled: STATIC_SHOWCASE, on: { click: initializeCouncil } }, [STATIC_SHOWCASE ? 'Local runtime required' : 'Initialize council'])]),
    el('div', { className: 'callout' }, [el('strong', { text: STATIC_SHOWCASE ? 'Showcase mode. ' : 'Structured review mode. ' }), STATIC_SHOWCASE ? 'The public Pages build lists the council roster but does not create local organizations.' : 'The council API creates an auditable local organization; membership never grants execution permissions.', state.council.error ? ` (${state.council.error})` : '']),
    el('div', { className: 'council-workflow' }, ['DISCOVER', 'PLAN', 'CHALLENGE', 'APPROVE', 'IMPLEMENT', 'TEST', 'REVIEW', 'REPAIR', 'VERIFY', 'RELEASE'].map((step, index) => el('div', { className: 'council-step' }, [el('span', { text: String(index + 1).padStart(2, '0') }), el('strong', { text: step })]))),
    el('div', { className: 'council-grid' }, roles.map((role) => el('article', { className: 'panel council-card' }, [el('div', { className: 'eyebrow', text: role.family }), el('h2', { text: role.title }), el('p', { text: role.mission }), badge(role.runtime ? 'Typed runtime' : 'Registry only', role.runtime ? 'green' : 'amber'), button('Open profile', 'small ghost', () => openRole(role.name))]))),
    data ? el('div', { className: 'callout' }, [el('strong', { text: `${data.counts.members} council members initialized. ` }), 'Codex remains the coordinating architect, not an automatic approver.']) : null
  ]);
}

function renderGodLoop() {
  const connected = state.godLoop.status === 'connected';
  const selected = state.godLoop.selected;
  return el('div', {}, [
    pageHeading('GOD LOOP console', 'Bounded improvement, durable evidence.', 'Create an approval-gated engineering loop with hard iteration, concurrency, time, and spending limits. It never recursively spawns itself.'),
    el('div', { className: 'callout' }, [el('strong', { text: connected ? 'Local control plane connected. ' : 'Showcase mode. ' }), connected ? 'This console records plans and evidence events; execution adapters remain separately authorized.' : 'The public dashboard does not create or run local loops. Start the local runtime for the governed control plane.', state.godLoop.error ? ` (${state.godLoop.error})` : '']),
    el('div', { className: 'god-loop-layout' }, [
      el('section', { className: 'panel' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'NEW BOUNDED RUN' }), el('h2', { text: 'Define the objective' }), el('p', { text: 'Approval is required before evidence events can advance.' })])]), el('form', { className: 'olympus-form', on: { submit: createGodLoop } }, [el('label', {}, [el('span', { text: 'Objective' }), el('input', { name: 'objective', required: true, maxLength: 2000, placeholder: 'e.g. repair a verified accessibility defect' })]), el('label', {}, [el('span', { text: 'Repository scope' }), el('input', { name: 'repository_scope', required: true, maxLength: 2000, placeholder: 'dashboard/app.js' })]), el('label', {}, [el('span', { text: 'Acceptance criteria (one per line)' }), el('textarea', { name: 'acceptance_criteria', required: true, rows: 4, placeholder: 'Regression test passes\nNo serious accessibility regression' })]), el('label', {}, [el('span', { text: 'Maximum iterations' }), el('input', { name: 'max_iterations', type: 'number', min: 1, max: 20, value: 5 })]), el('button', { className: 'button primary', type: 'submit', disabled: !connected }, [connected ? 'Create approval-gated loop' : 'Start local runtime first'])])]),
      el('section', { className: 'panel' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'DURABLE RUNS' }), el('h2', { text: `${state.godLoop.runs.length} recorded` }), el('p', { text: 'Terminal runs cannot be overwritten or re-approved.' })]), button('Refresh', 'small ghost', loadGodLoops)]), state.godLoop.runs.length ? el('div', { className: 'olympus-org-list' }, state.godLoop.runs.map((run) => el('button', { className: `olympus-org-row ${selected?.id === run.id ? 'is-selected' : ''}`, type: 'button', on: { click: () => selectGodLoop(run.id) } }, [el('strong', { text: run.objective }), el('span', { text: `${run.status} · ${run.current_iteration}/${run.max_iterations} iterations · $${run.spending_limit} limit` })]))) : el('div', { className: 'empty-state' }, [el('h3', { text: connected ? 'No loop runs yet' : 'No remote loop data' }), el('p', { text: 'The static surface intentionally leaves execution disconnected.' })])])
    ]),
    selected ? el('section', { className: 'panel olympus-detail' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'RUN DETAIL' }), el('h2', { text: selected.status }), el('p', { text: selected.objective })]), selected.status === 'AWAITING_APPROVAL' ? button('Approve plan', 'small primary', () => approveGodLoop(selected.id)) : badge('Read-only evidence', 'blue')]), el('div', { className: 'olympus-stat-grid' }, [['Iteration', `${selected.current_iteration}/${selected.max_iterations}`], ['Concurrency', selected.max_concurrent_agents], ['Time limit', `${Math.round(selected.max_time_ms / 60000)} min`], ['Spend limit', `$${selected.spending_limit}`]].map(([label, value]) => el('div', { className: 'check-card' }, [el('span', { className: 'eyebrow', text: label }), el('strong', { text: String(value) })]))), el('div', { className: 'callout' }, [el('strong', { text: 'Stop rule: ' }), selected.stop_reason || 'The loop remains bounded by approval, iteration, time, spending, security, cancellation, and dependency conditions.'])]) : null
  ]);
}

async function olympusCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    const organization = await runtimeAction('/olympus/organizations', 'POST', { name: formData.get('name'), template_id: formData.get('template_id'), objective: formData.get('objective'), budget_limit: 0 });
    state.olympus.organizations = [organization, ...state.olympus.organizations.filter((item) => item.id !== organization.id)];
    state.olympus.selected = organization;
    showToast('OLYMPUS organization created');
    render();
  } catch { /* runtimeAction reports the bounded error */ }
}

async function olympusSelect(organizationId) {
  try {
    state.olympus.selected = await runtimeRequest(`/olympus/organizations/${organizationId}`);
    render();
  } catch (error) {
    state.olympus.error = error.message;
    render();
  }
}

function renderOlympus() {
  const runtimeReady = state.olympus.status === 'connected';
  const templates = state.olympus.templates.length ? state.olympus.templates : [{ id: '', name: 'Connect the local runtime to load templates', objective: '' }];
  const selected = state.olympus.selected;
  return el('div', {}, [
    pageHeading('OLYMPUS builder', 'Assemble a governed organization.', 'Create a local workspace organization from a bounded template, recruit catalog roles, and inspect reporting lines without changing execution permissions.'),
    el('div', { className: 'callout' }, [el('strong', { text: runtimeReady ? 'Local runtime connected. ' : 'Showcase mode. ' }), runtimeReady ? 'Organization state is stored in the local SQLite workspace.' : 'The public dashboard intentionally does not expose SQLite or backend execution. Start the local runtime to use this builder.', state.olympus.error ? ` (${state.olympus.error})` : '']),
    el('div', { className: 'olympus-layout' }, [
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'NATIVE ORGANIZATION MODEL' }), el('h2', { text: 'Create an organization' }), el('p', { text: 'Templates create departments only. Catalog runtime status remains authoritative.' })]), badge(runtimeReady ? 'Ready' : 'Local only', runtimeReady ? 'green' : 'amber')]),
        el('form', { className: 'olympus-form', on: { submit: olympusCreate } }, [
          el('label', {}, [el('span', { text: 'Organization name' }), el('input', { name: 'name', required: true, maxLength: 120, placeholder: 'e.g. Olympus engineering' })]),
          el('label', {}, [el('span', { text: 'Template' }), el('select', { name: 'template_id', required: true, disabled: !runtimeReady }, templates.map((template) => el('option', { value: template.id, text: template.name })))]),
          el('label', {}, [el('span', { text: 'Objective' }), el('textarea', { name: 'objective', rows: 4, required: true, maxLength: 1000, placeholder: 'State the bounded organizational objective.' })]),
          el('button', { className: 'button primary', type: 'submit', disabled: !runtimeReady }, [runtimeReady ? 'Create local organization' : 'Start local runtime first'])
        ])
      ]),
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'WORKSPACE ORGANIZATIONS' }), el('h2', { text: `${state.olympus.organizations.length} organizations` }), el('p', { text: 'Workspace-scoped records with activity evidence.' })]), button('Refresh', 'small ghost', loadOlympus)]),
        state.olympus.organizations.length ? el('div', { className: 'olympus-org-list' }, state.olympus.organizations.map((organization) => el('button', { className: `olympus-org-row ${selected?.id === organization.id ? 'is-selected' : ''}`, type: 'button', on: { click: () => olympusSelect(organization.id) } }, [el('strong', { text: organization.name }), el('span', { text: `${organization.member_count} members · ${organization.template_id}` })]))) : el('div', { className: 'empty-state' }, [el('h3', { text: runtimeReady ? 'No organizations yet' : 'No remote organization data' }), el('p', { text: runtimeReady ? 'Create the first organization from a template.' : 'This static showcase keeps local organization state private.' })])
      ])
    ]),
    selected ? el('section', { className: 'panel olympus-detail' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'ORGANIZATION DETAIL' }), el('h2', { text: selected.name }), el('p', { text: selected.objective })]), button('Export JSON', 'small ghost', () => downloadText(`${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify({ schema_version: 1, organization: selected }, null, 2))) ]), el('div', { className: 'olympus-stat-grid' }, [['Departments', selected.counts?.departments ?? selected.departments?.length ?? 0], ['Members', selected.counts?.members ?? selected.members?.length ?? 0], ['Typed runtime', selected.counts?.typed_runtime ?? 0], ['Registry only', selected.counts?.registry_only ?? 0]].map(([label, value]) => el('div', { className: 'check-card' }, [el('span', { className: 'eyebrow', text: label }), el('strong', { text: String(value) })]))), el('div', { className: 'callout' }, [el('strong', { text: 'Promotion boundary: ' }), 'OLYMPUS can arrange catalog roles and reporting lines, but cannot grant execution capability or convert a registry-only role into a typed runtime.'])]) : null,
    !runtimeReady && state.olympus.loading ? el('div', { className: 'loading-state' }, [el('span', { className: 'spinner' }), el('p', { text: 'Checking local runtime…' })]) : null
  ]);
}

function parseRuntimeInput(value) {
  try { return value.trim() ? JSON.parse(value) : {}; } catch { throw new Error('Input must be valid JSON.'); }
}

async function toggleKillSwitch() {
  if (state.execution.status !== 'connected') return;
  const result = await runtimeAction('/runtime/kill-switch', 'POST', { active: !state.execution.killSwitch });
  state.execution.killSwitch = Boolean(result.active);
  showToast(state.execution.killSwitch ? 'Kill switch enabled' : 'Kill switch cleared');
  render();
}

async function runScenario(scenarioId) {
  const result = await runtimeAction('/scenarios/run', 'POST', { scenario_id: scenarioId });
  state.execution.selectedRun = result.run;
  state.execution.selectedTask = null;
  state.execution.events = [];
  state.execution.evidence = null;
  showToast('Offline demonstration approved and started; no human authorization implied');
  render();
  await pollRuntimeRun(result.run.id);
}

async function pollRuntimeRun(runId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    try {
      const [run, events] = await Promise.all([runtimeRequest(`/workflow-runs/${runId}`), runtimeRequest(`/workflow-runs/${runId}/events`)]);
      state.execution.selectedRun = run;
      state.execution.events = events.events || [];
      state.execution.evidence = events.handoffs?.at(-1)?.evidence || events.handoffs?.at(-1)?.output || null;
      render();
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED OUT'].includes(run.status)) return;
    } catch (error) { state.execution.error = error.message; render(); return; }
  }
}

async function createAndExecuteTask(agentId, input) {
  const created = await runtimeAction('/tasks', 'POST', { agent_id: agentId, input });
  await runtimeAction(`/tasks/${created.id}/validate`);
  await runtimeAction(`/tasks/${created.id}/request-approval`);
  const approved = await runtimeAction(`/tasks/${created.id}/approve`, 'POST', { decision: 'APPROVED', reason: 'Explicit local operator approval' });
  const completed = await runtimeAction(`/tasks/${approved.id}/execute`);
  state.execution.selectedTask = completed;
  const events = await runtimeRequest(`/tasks/${completed.id}/events`);
  state.execution.events = events.events || [];
  state.execution.evidence = completed.evidence || null;
  showToast(`Task ${completed.status.toLowerCase()}`);
  render();
}

function runtimeRoleOptions() {
  const roles = (state.execution.roles.length ? state.execution.roles : state.data.roles).filter((role) => role.runtime);
  return roles.sort((a, b) => a.title.localeCompare(b.title));
}

function renderExecution() {
  const runtime = state.execution;
  const experience = experienceById(state.experience);
  const inputId = 'runtime-input';
  const roleOptions = runtimeRoleOptions();
  const scenarioCards = runtime.scenarios.map((scenario) => el('article', { className: 'execution-card scenario-card' }, [
    el('div', { className: 'execution-card-kicker', text: scenario.family || 'Offline scenario' }),
    el('h3', { text: scenario.name }),
    el('p', { text: scenario.description }),
    el('div', { className: 'tag-list' }, scenario.agents.map((agent) => tag(agent))),
    button('Run demonstration', 'small primary', () => runScenario(scenario.id), { disabled: runtime.status !== 'connected' || runtime.killSwitch })
  ]));
  const timeline = runtime.events.length
    ? runtime.events.map((event) => el('li', { className: 'execution-event' }, [el('span', { className: 'execution-event-type', text: event.event_type }), el('time', { text: event.created_at }), el('pre', { text: JSON.stringify(event.payload || {}, null, 2) })]))
    : [el('li', { className: 'execution-empty', text: 'No persisted execution events selected.' })];
  const selected = runtime.selectedRun || runtime.selectedTask;
  return el('div', { className: `execution-surface execution-${experience.id}` }, [
    pageHeading('Runtime / local-first', `${experience.name} execution console`, 'Run only authorized typed roles, inspect persisted evidence, and keep provider boundaries visible.', [
      badge(runtime.status === 'connected' ? 'Backend connected' : 'Backend offline', runtime.status === 'connected' ? 'green' : 'amber'),
      button(runtime.killSwitch ? 'Clear kill switch' : 'Enable kill switch', runtime.killSwitch ? 'small primary' : 'small danger', toggleKillSwitch, { disabled: runtime.status !== 'connected' })
    ]),
    runtime.error ? el('div', { className: 'callout danger', role: 'alert' }, [el('strong', { text: 'Runtime unavailable: ' }), runtime.error, ' Start it with ', el('code', { text: 'npm run start:local' }), '.']) : null,
    el('div', { className: 'execution-status-strip' }, [
      metricCard('Execution mode', 'deterministic-local', 'No network or paid provider calls', '◉'),
      metricCard('Typed roles', runtime.roles.length ? runtime.roles.filter((role) => role.runtime).length : state.data.runtime_supported_roles.length, 'Registry-only roles cannot execute', '⌁'),
      metricCard('Kill switch', runtime.killSwitch ? 'ACTIVE' : 'CLEAR', runtime.killSwitch ? 'New execution denied' : 'Operator control available', '⚠'),
      metricCard('Selected evidence', runtime.evidence ? 'PRESENT' : 'NONE', 'Only persisted outputs are shown', '▣')
    ]),
    el('div', { className: 'execution-grid' }, [
      el('section', { className: 'execution-card execution-console-card' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'TASK LIFECYCLE' }), el('h2', { text: 'Console task' }), el('p', { text: 'DRAFT → VALIDATED → AWAITING APPROVAL → APPROVED → RUNNING → terminal.' })])]),
        el('label', { className: 'field-label', htmlFor: 'runtime-agent' }, ['Typed runtime agent']),
        el('select', { id: 'runtime-agent', className: 'select-field execution-select', ariaLabel: 'Typed runtime agent' }, roleOptions.map((role) => el('option', { value: role.name, text: `${role.title} · ${role.display_name}` }))),
        el('label', { className: 'field-label', htmlFor: inputId }, ['JSON input']),
        el('textarea', { id: inputId, className: 'execution-input', rows: 7, value: '{\n  "question": "Assess the bounded execution posture",\n  "evidence": []\n}', ariaLabel: 'Task JSON input' }),
        el('div', { className: 'heading-actions' }, [button('Create, approve & execute', 'primary', async () => { try { const role = document.querySelector('#runtime-agent').value; const input = parseRuntimeInput(document.querySelector(`#${inputId}`).value); await createAndExecuteTask(role, input); } catch (error) { state.execution.error = error.message; render(); } }, { disabled: runtime.status !== 'connected' || runtime.killSwitch || !roleOptions.length })]),
        el('p', { className: 'form-hint', text: 'The button uses the same API lifecycle as external clients. Approval is explicit and recorded; execution remains local and deterministic.' })
      ]),
      el('section', { className: 'execution-card provider-card' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'PROVIDER BOUNDARY' }), el('h2', { text: 'Runtime compatibility' }), el('p', { text: 'Connected adapters are visible but disabled until credentials and authorization are explicit.' })])]),
        el('div', { className: 'provider-list' }, (runtime.providers.length ? runtime.providers : [{ id: 'deterministic-local', status: 'not loaded', network: 'none' }]).map((provider) => el('div', { className: 'provider-row' }, [el('div', {}, [el('strong', { text: provider.id }), el('span', { text: `${provider.network} · ${provider.credentials || 'no credentials exposed'}` })]), badge(provider.status, provider.status === 'configured' ? 'green' : 'amber')]))),
        el('div', { className: 'execution-note' }, [el('strong', { text: 'Safe tool registry: ' }), 'catalog.lookup, schema.validate, evidence.compare, risk.score, workflow.validate, knowledge.retrieve. Shell, network, arbitrary code, and secret access are not registered.'])
      ])
    ]),
    el('section', { className: 'execution-card scenario-deck' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'SCENARIO LAB · DEMONSTRATIONS' }), el('h2', { text: 'Five offline proofs' }), el('p', { text: 'Server-controlled, deterministic demonstrations exercise risk, governance, architecture, delivery, and recovery paths. Automatic demo approval is not independent human authorization.' })]), badge(runtime.status === 'connected' ? 'Runnable' : 'Start backend', runtime.status === 'connected' ? 'green' : 'amber')]), el('div', { className: 'scenario-grid' }, scenarioCards)]),
    el('div', { className: 'execution-grid execution-bottom-grid' }, [
      el('section', { className: 'execution-card timeline-card' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'AUDIT TRAIL' }), el('h2', { text: selected ? `${selected.id} · ${selected.status}` : 'Execution timeline' }), el('p', { text: 'Append-only audit events and structured handoffs from the selected run.' })])]), el('ol', { className: 'execution-timeline' }, timeline)]),
      el('section', { className: 'execution-card evidence-card' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('div', { className: 'eyebrow', text: 'EVIDENCE INSPECTOR' }), el('h2', { text: 'Structured result' }), el('p', { text: 'Evidence is displayed as persisted JSON, not fabricated telemetry.' })]), runtime.evidence ? button('Copy evidence', 'small ghost', () => copyText(JSON.stringify(runtime.evidence, null, 2), 'Evidence copied')) : null]), el('pre', { className: 'evidence-json', text: runtime.evidence ? JSON.stringify(runtime.evidence, null, 2) : 'Select a completed task or scenario to inspect its evidence.' })])
    ])
  ]);
}

function filteredRoles() {
  return state.data.roles.filter((role) => {
    const haystack = [role.name, role.title, role.display_name, role.family, role.mission, ...role.capabilities, ...role.knowledge_domains].join(' ').toLowerCase();
    return (!state.search || haystack.includes(state.search.toLowerCase())) && (!state.family || role.family === state.family) && (!state.runtime || (state.runtime === 'runtime') === role.runtime);
  }).sort((a, b) => state.sort === 'title' ? a.title.localeCompare(b.title) : state.sort === 'family' ? a.family.localeCompare(b.family) : a.display_name.localeCompare(b.display_name));
}

function agentToolbar() {
  return el('div', { className: 'toolbar' }, [
    el('input', { className: 'search-field', type: 'search', ariaLabel: 'Search agents', placeholder: 'Search names, aliases, families, missions, capabilities…', value: state.search, on: { input: (event) => { const value = event.target.value; state.search = value; render(); restoreFocus('.toolbar .search-field', value); } } }),
    el('select', { className: 'select-field', ariaLabel: 'Family filter', value: state.family, on: { change: (event) => { state.family = event.target.value; render(); restoreFocus('.toolbar .select-field:nth-of-type(1)'); } } }, [el('option', { value: '', text: 'All families' }), ...Object.keys(state.data.family_counts).sort().map((family) => el('option', { value: family, text: family }))]),
    el('select', { className: 'select-field', ariaLabel: 'Runtime state filter', value: state.runtime, on: { change: (event) => { state.runtime = event.target.value; render(); restoreFocus('.toolbar .select-field:nth-of-type(2)'); } } }, [el('option', { value: '', text: 'All runtime states' }), el('option', { value: 'runtime', text: 'Typed runtime' }), el('option', { value: 'registry', text: 'Registry only' })]),
    el('select', { className: 'select-field', ariaLabel: 'Sort order', value: state.sort, on: { change: (event) => { state.sort = event.target.value; render(); restoreFocus('.toolbar .select-field:nth-of-type(3)'); } } }, [el('option', { value: 'title', text: 'Sort: role' }), el('option', { value: 'family', text: 'Sort: family' }), el('option', { value: 'alias', text: 'Sort: codename' })])
  ]);
}

function experienceContext() {
  return { el, button, badge, tags, list, metricCard, setView, openRole, setSearch, roleById, data: state.data, state, graph: state.graph, filteredRoles, agentToolbar, agentCard, applyExperience, render };
}

function pageHeading(eyebrow, title, description, actions = []) {
  return el('div', { className: 'page-heading' }, [
    el('div', {}, [el('div', { className: 'eyebrow', text: eyebrow }), el('h1', { text: title }), el('p', { text: description })]),
    el('div', { className: 'heading-actions' }, actions)
  ]);
}

function metricCard(label, value, foot, icon = '◈') {
  return el('article', { className: 'metric-card' }, [
    el('div', { className: 'metric-top' }, [el('span', { text: label }), el('span', { className: 'metric-icon', text: icon })]),
    el('strong', { className: 'metric-value', text: String(value) }),
    el('span', { className: 'metric-foot', text: foot })
  ]);
}

function renderOverviewLegacy() {
  const roles = state.data.roles;
  const families = Object.entries(state.data.family_counts).sort((a, b) => b[1] - a[1]);
  const maxFamily = Math.max(...families.map(([, count]) => count));
  const overview = el('div', {}, [
    pageHeading('Command center', 'A governed team for ambitious work.', 'Explore 100 specialist roles, compose bounded workflows, and inspect the evidence behind every runtime claim.', [button('Explore agents', 'primary', () => setView('agents')), button('Open workflow designer', 'ghost', () => setView('workflows'))]),
    el('div', { className: 'hero' }, [
      el('section', { className: 'hero-card' }, [el('div', { className: 'eyebrow', text: 'AGENT FACTORY / GOD MODE V2' }), el('h2', { text: 'Make coordination feel like a product.' }), el('p', { text: 'A high-signal command center for agent roles, prompt contracts, workflow design, evaluations, and human approval boundaries.' }), el('div', { className: 'hero-meta' }, [badge('Catalog verified', 'green'), badge('Static / no executor', 'blue'), badge('Human approval first', 'amber')])]),
      el('aside', { className: 'hero-side' }, [
        el('section', { className: 'insight-card' }, [el('h3', { text: 'Runtime truth' }), el('p', { text: '30 profiles are typed runtime roles. 70 are registry-only. This dashboard never converts a TOML file into a claim that an agent is running.' })]),
        el('section', { className: 'insight-card' }, [el('h3', { text: 'Evaluation posture' }), el('p', { text: 'Catalog and prompt contracts are statically validated. Scenario and live-runtime evaluation remain explicitly unmeasured.' })])
      ])
    ]),
    el('div', { className: 'metric-grid' }, [
      metricCard('Registered agents', roles.length, 'Source: catalog / 100 roles', '◎'),
      metricCard('Typed runtime roles', state.data.runtime_supported_roles.length, 'Source: approved runtime list', '⌁'),
      metricCard('Registry-only roles', state.data.registry_only_roles.length, 'Needs explicit promotion', '◌'),
      metricCard('Workflow templates', state.data.workflow_templates.length, 'Design and export only', '⌘')
    ]),
    el('div', { className: 'dashboard-grid' }, [
      el('section', { className: 'panel' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Role families' }), el('p', { text: 'Coverage across engineering, AI, governance, people, and operations.' })]), badge('11 domains', 'blue')]), el('div', { className: 'family-list' }, families.map(([family, count]) => el('div', { className: 'family-row' }, [el('strong', { text: family }), el('div', { className: 'family-bar' }, [el('span', { style: { width: `${Math.round((count / maxFamily) * 100)}%` } })]), el('span', { className: 'mono', text: String(count).padStart(2, '0') })]))) ]),
      el('section', { className: 'panel' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Workflow templates' }), el('p', { text: 'Predefined paths with visible feasibility.' })]), button('View all', 'small ghost', () => setView('workflows'))]), el('div', { className: 'workflow-list' }, state.data.workflow_templates.slice(0, 5).map((workflow) => { const runtime = workflow.steps.filter((step) => roleById(step.role)?.runtime).length; return el('button', { className: 'workflow-row', type: 'button', on: { click: () => { state.workflowId = workflow.id; setView('workflows'); } } }, [el('span', { className: 'workflow-glyph', text: '⌘' }), el('div', {}, [el('strong', { text: workflow.name }), el('span', { text: `${workflow.steps.length} steps · ${runtime}/${workflow.steps.length} typed` })]), badge(runtime === workflow.steps.length ? 'Runnable shape' : 'Design only', runtime === workflow.steps.length ? 'green' : 'amber')]); })) ])
    ]),
    el('section', { className: 'panel', style: { marginTop: '17px' } }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Verification ledger' }), el('p', { text: 'Checks that are recorded versus checks that still need execution.' })]), button('Open evaluation lab', 'small ghost', () => setView('evaluations'))]), el('div', { className: 'governance-grid' }, [
      el('div', { className: 'check-card' }, [el('h2', { text: 'Catalog integrity' }), el('p', { text: 'All stable IDs, mythic aliases, profile fields, and TOML definitions agree.' }), el('div', { className: 'check-status' }, [el('span', { text: 'Static validation' }), el('strong', { text: 'PASSED' })])]),
      el('div', { className: 'check-card' }, [el('h2', { text: 'Prompt contracts' }), el('p', { text: 'Every role has a reusable prompt, boundaries, inputs, outputs, and failure behavior.' }), el('div', { className: 'check-status' }, [el('span', { text: 'Schema coverage' }), el('strong', { text: '100 / 100' })])]),
      el('div', { className: 'check-card' }, [el('h2', { text: 'Live performance' }), el('p', { text: 'No provider runs or empirical performance scores are present in this static build.' }), el('div', { className: 'check-status' }, [el('span', { text: 'Evidence status' }), el('strong', { style: { color: 'var(--amber)' }, text: 'NOT MEASURED' })])])
    ])])
  ]);
  return overview;
}

function agentCard(role) {
  const article = el('article', { className: 'agent-card', dataset: { roleId: role.name } }, [
    el('div', { className: 'agent-card-head' }, [el('div', {}, [el('div', { className: 'agent-symbol', text: '✦' }), el('h2', { className: 'agent-title', text: role.title }), el('span', { className: 'agent-alias', text: role.display_name })]), badge(roleRuntimeLabel(role), roleRuntimeTone(role))]),
    el('p', { className: 'agent-mission', text: role.mission }),
    tags(role.capabilities.slice(0, 3)),
    el('div', { className: 'agent-footer' }, [el('span', { text: role.family }), button('Open profile', 'small ghost', () => { state.agentId = role.name; state.view = 'agent-detail'; location.hash = 'agent-detail'; render(); })])
  ]);
  return article;
}

function renderAgentsLegacy() {
  const filtered = state.data.roles.filter((role) => {
    const haystack = [role.name, role.title, role.display_name, role.family, role.mission, ...role.capabilities, ...role.knowledge_domains].join(' ').toLowerCase();
    return (!state.search || haystack.includes(state.search.toLowerCase())) && (!state.family || role.family === state.family) && (!state.runtime || (state.runtime === 'runtime') === role.runtime);
  }).sort((a, b) => state.sort === 'title' ? a.title.localeCompare(b.title) : state.sort === 'family' ? a.family.localeCompare(b.family) : a.display_name.localeCompare(b.display_name));
  const toolbar = el('div', { className: 'toolbar' }, [
    el('input', { className: 'search-field', type: 'search', placeholder: 'Search names, aliases, families, missions, capabilities…', value: state.search, on: { input: (event) => { state.search = event.target.value; render(); } } }),
    el('select', { className: 'select-field', value: state.family, on: { change: (event) => { state.family = event.target.value; render(); } } }, [el('option', { value: '', text: 'All families' }), ...Object.keys(state.data.family_counts).sort().map((family) => el('option', { value: family, text: family }))]),
    el('select', { className: 'select-field', value: state.runtime, on: { change: (event) => { state.runtime = event.target.value; render(); } } }, [el('option', { value: '', text: 'All runtime states' }), el('option', { value: 'runtime', text: 'Typed runtime' }), el('option', { value: 'registry', text: 'Registry only' })]),
    el('select', { className: 'select-field', value: state.sort, on: { change: (event) => { state.sort = event.target.value; render(); } } }, [el('option', { value: 'title', text: 'Sort: role' }), el('option', { value: 'family', text: 'Sort: family' }), el('option', { value: 'alias', text: 'Sort: codename' })])
  ]);
  return el('div', {}, [pageHeading('Agent explorer', 'Find the right specialist.', `${filtered.length} of ${state.data.roles.length} roles match the current view. Every profile exposes capabilities and boundaries before you delegate.`), toolbar, filtered.length ? el('div', { className: 'agent-grid' }, filtered.map(agentCard)) : el('div', { className: 'empty-state' }, [el('h2', { text: 'No roles found' }), el('p', { text: 'Try clearing a filter or searching for a family, alias, or capability.' }), button('Clear filters', 'primary small', () => { state.search = ''; state.family = ''; state.runtime = ''; render(); })])]);
}

function renderOverview() { return renderExperienceOverview(experienceContext()); }
function renderAgents() { return renderExperienceAgents(experienceContext()); }

function profileSection(title, content) { return el('section', { className: 'panel profile-section' }, [el('h2', { text: title }), content]); }
function renderAgentDetail() {
  const role = roleById(state.agentId) || state.data.roles[0];
  const main = el('div', {}, [
    el('div', { className: 'detail-header' }, [el('div', { className: 'agent-symbol', text: '✦' }), el('div', {}, [button('← Back to explorer', 'small ghost', () => setView('agents')), el('h1', { text: role.title }), el('p', { text: role.mission }), el('div', { className: 'detail-badges' }, [badge(role.display_name, 'blue'), badge(roleRuntimeLabel(role), roleRuntimeTone(role)), badge(role.mythology, 'blue')])])]),
    el('div', { className: 'detail-grid' }, [
      el('div', {}, [
        profileSection('Mission and capabilities', el('div', {}, [el('p', { text: role.mission }), tags(role.capabilities)])),
        profileSection('Required inputs', list(role.required_inputs)),
        profileSection('Expected outputs', list(role.deliverables)),
        profileSection('Example tasks', list(role.example_tasks)),
        profileSection('Developer prompt', el('div', {}, [el('div', { className: 'prompt-actions' }, [button('Copy prompt', 'small primary', () => copyText(role.prompt)), button('Download .txt', 'small ghost', () => downloadText(`${role.name}-prompt.txt`, role.prompt, 'text/plain'))]), el('div', { className: 'prompt-box', text: role.prompt })])),
        profileSection('Evaluation criteria', list(role.evaluation_criteria))
      ]),
      el('aside', {}, [
        profileSection('Role contract', el('dl', {}, [el('dt', { text: 'Stable ID' }), el('dd', { className: 'mono', text: role.name }), el('dt', { text: 'Family' }), el('dd', { text: role.family }), el('dt', { text: 'Codename' }), el('dd', { text: role.codename }), el('dt', { text: 'Mythology' }), el('dd', { text: role.mythology }), el('dt', { text: 'Version' }), el('dd', { className: 'mono', text: role.maintenance.version }), el('dt', { text: 'Last reviewed' }), el('dd', { text: role.maintenance.last_reviewed })])),
        profileSection('Tools and integrations', list(role.tools_integrations)),
        profileSection('Knowledge and standards', el('div', {}, [el('h3', { className: 'subtle', style: { fontSize: '11px' }, text: 'Knowledge domains' }), tags(role.knowledge_domains), el('h3', { className: 'subtle', style: { fontSize: '11px', marginTop: '17px' }, text: 'Frameworks and standards' }), tags(role.frameworks_standards)])),
        profileSection('Approval and failure handling', el('div', {}, [el('p', { text: role.approval_requirements }), list(role.failure_handling)])),
        profileSection('Boundaries and limitations', el('div', {}, [list(role.boundaries), list(role.known_limitations)])),
        profileSection('Runtime compatibility', el('div', {}, [badge(role.runtime_compatibility.mode === 'live' ? 'Live-capable profile' : 'Registry only', roleRuntimeTone(role)), el('p', { text: role.runtime ? 'The current typed delegation surface exposes this role. Concurrency remains bounded by the host session.' : 'This profile is documented and portable, but the current typed runtime does not expose it as a direct delegation role.' })]))
      ])
    ])
  ]);
  return main;
}

function promptForRole(role) {
  const context = state.promptContext.trim();
  const template = state.promptTemplate === 'Custom role brief' ? '' : `\n\nTask template: ${state.promptTemplate}.`;
  return `${role.prompt}${template}${context ? `\n\nTask-specific context:\n${context}` : ''}`;
}

function renderPrompts() {
  const selected = roleById(state.promptRoleId) || state.data.roles[0];
  state.promptRoleId = selected.name;
  const available = state.data.roles.filter((role) => [role.title, role.display_name, role.family].join(' ').toLowerCase().includes(state.promptFilter.toLowerCase()));
  const roleList = el('div', { className: 'role-list' }, available.map((role) => el('button', { className: `role-list-button ${role.name === selected.name ? 'is-selected' : ''}`, dataset: { roleId: role.name }, type: 'button', on: { click: () => { state.promptRoleId = role.name; render(); restoreFocus(`.role-list-button[data-role-id="${role.name}"]`); } } }, [el('strong', { text: role.display_name }), el('span', { text: role.title })])));
  const preview = promptForRole(selected);
   return el('div', {}, [pageHeading('Prompt Studio', 'Make the contract explicit.', 'Preview, adapt, compare, and export role prompts. Previewing a prompt never executes an agent.'), el('div', { className: 'studio-layout' }, [el('aside', { className: 'panel', ariaLabel: 'Prompt library' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Prompt library' }), el('p', { text: `${available.length} roles` })])]), el('input', { className: 'search-field', type: 'search', ariaLabel: 'Filter prompts', placeholder: 'Filter prompts…', value: state.promptFilter, on: { input: (event) => { const value = event.target.value; state.promptFilter = value; render(); restoreFocus('.studio-layout aside .search-field', value); } } }), roleList]), el('section', { className: 'panel studio-main' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: selected.title }), el('p', { className: 'mono', text: `${selected.display_name} · ${selected.maintenance.version}` })]), badge('Preview only', 'amber')]), el('div', { className: 'studio-controls' }, [el('div', { className: 'field-group' }, [el('label', { text: 'Task template', htmlFor: 'prompt-template' }), el('select', { id: 'prompt-template', className: 'select-field', value: state.promptTemplate, on: { change: (event) => { state.promptTemplate = event.target.value; render(); } } }, ['Role brief', 'Audit a proposed change', 'Prepare a handoff', 'Create a test plan', 'Custom role brief'].map((item) => el('option', { value: item, text: item })))]), el('div', { className: 'field-group' }, [el('label', { text: 'Task context', htmlFor: 'prompt-context' }), el('textarea', { id: 'prompt-context', className: 'text-field', rows: 5, placeholder: 'Add bounded task context, file scope, acceptance criteria, and evidence requirements…', value: state.promptContext, on: { input: (event) => { state.promptContext = event.target.value; const previewNode = document.querySelector('#prompt-preview'); if (previewNode) previewNode.textContent = promptForRole(selected); } } })])]), el('div', { className: 'prompt-actions' }, [button('Copy configuration', 'small primary', () => copyText(preview)), button('Export .txt', 'small ghost', () => downloadText(`${selected.name}-prompt-preview.txt`, preview, 'text/plain'))]), el('div', { id: 'prompt-preview', className: 'prompt-box prompt-preview', tabIndex: 0, ariaLabel: 'Prompt preview', text: preview })])])]);
}

function currentWorkflow() {
  const template = state.data.workflow_templates.find((item) => item.id === state.workflowId) || state.data.workflow_templates[0];
  if (!state.workflow || state.workflow.id !== template.id) state.workflow = JSON.parse(JSON.stringify(template));
  return state.workflow;
}

function workflowFeasibility(workflow) {
  const typed = workflow.steps.filter((step) => roleById(step.role)?.runtime).length;
  return { typed, total: workflow.steps.length, ready: typed === workflow.steps.length };
}

function renderWorkflows() {
  const workflow = currentWorkflow();
  const feasibility = workflowFeasibility(workflow);
  const templates = el('aside', { className: 'template-list' }, state.data.workflow_templates.map((template) => el('button', { className: `template-button ${template.id === workflow.id ? 'is-selected' : ''}`, type: 'button', on: { click: () => { state.workflowId = template.id; state.workflow = null; render(); } } }, [el('strong', { text: template.name }), el('span', { text: template.description })])));
  const makeRoleOptions = () => [el('option', { value: '', text: 'Select a role' }), ...state.data.roles.map((role) => el('option', { value: role.name, text: `${role.display_name} · ${role.runtime ? 'typed' : 'registry'}` }))];
  const steps = workflow.steps.map((step, index) => { const role = roleById(step.role); return el('article', { className: 'workflow-step' }, [el('span', { className: 'step-index', text: `STEP ${String(index + 1).padStart(2, '0')}` }), el('h3', { text: role?.title || 'Unassigned role' }), el('p', { text: role?.display_name || 'Choose a role for this step.' }), el('div', { className: 'step-fields' }, [el('select', { ariaLabel: `Step ${index + 1} role`, value: step.role, on: { change: (event) => { step.role = event.target.value; render(); } } }, makeRoleOptions()), el('input', { type: 'text', value: step.gate, ariaLabel: 'Approval gate', on: { input: (event) => { step.gate = event.target.value; } } }), el('input', { type: 'text', value: step.output, ariaLabel: 'Expected output', on: { input: (event) => { step.output = event.target.value; } } }), button('Remove', 'small danger', () => { workflow.steps.splice(index, 1); render(); })])]); });
  return el('div', {}, [pageHeading('Workflow designer', 'Compose a bounded path.', 'Design and export workflows with explicit roles, outputs, dependencies, and approval gates. Execution is intentionally unavailable in this static build.'), el('div', { className: 'workflow-layout' }, [templates, el('section', { className: 'workflow-main' }, [el('div', { className: 'workflow-toolbar' }, [el('div', {}, [el('h1', { text: workflow.name }), el('p', { text: workflow.description })]), el('div', { className: 'workflow-actions' }, [badge(feasibility.ready ? 'All steps typed' : `${feasibility.typed}/${feasibility.total} typed`, feasibility.ready ? 'green' : 'amber'), button('Add step', 'small ghost', () => { workflow.steps.push({ role: '', gate: 'Human review', output: 'Documented output' }); render(); }), button('Copy JSON', 'small ghost', () => copyText(JSON.stringify(workflow, null, 2))), button('Export JSON', 'small primary', () => downloadText(`${workflow.id}.json`, JSON.stringify(workflow, null, 2)))])]), el('div', { className: 'workflow-canvas', role: 'region', ariaLabel: 'Workflow canvas' }, [el('h2', { className: 'sr-only', text: 'Workflow steps' }), el('div', { className: 'workflow-rail' }, steps.length ? steps : [el('div', { className: 'empty-state', text: 'Add a step to start designing.' })])]), el('div', { className: 'panel outline-panel' }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Accessible workflow outline' }), el('p', { text: 'The linear view is the authoritative reading order for this design surface.' })]), badge('Design only', 'amber')]), el('div', { className: 'outline-list' }, workflow.steps.map((step, index) => { const role = roleById(step.role); return el('div', { className: 'outline-item' }, [el('span', { className: 'outline-number', text: String(index + 1) }), el('div', {}, [el('strong', { text: role?.title || 'Unassigned role' }), el('span', { text: `${step.gate} → ${step.output}` })]), badge(role?.runtime ? 'typed' : 'registry', role?.runtime ? 'green' : 'amber')]); }))])])])]);
}

function renderEvaluations() {
  const checks = [
    ['Catalog schema', 'All 100 roles, aliases, definitions, and profile fields are statically validated.', 'PASSED', 'green'],
    ['Prompt contract', 'Every prompt has explicit role identity, outputs, boundaries, and no-execution guardrails.', 'PASSED', 'green'],
    ['Scenario evaluation', 'Positive, negative, boundary, and missing-evidence fixtures are specified but not executed in this build.', 'PENDING', 'amber'],
    ['Live runtime evaluation', 'No live provider or agent execution is connected to this static command center.', 'NOT MEASURED', 'amber'],
    ['Performance score', 'No observed numerator, denominator, time window, or provider run exists to support a score.', 'NOT MEASURED', 'amber'],
    ['Cross-platform validator', 'The catalog validator resolves its root through fileURLToPath and is designed for Windows and Linux.', 'RETEST REQUIRED', 'blue']
  ];
  return el('div', {}, [pageHeading('Evaluation lab', 'Evidence before confidence.', 'Separate schema checks, prompt contracts, offline scenarios, live runtime checks, and empirical performance. Never collapse them into one score.'), el('div', { className: 'eval-grid' }, checks.map(([title, description, status, tone]) => el('article', { className: 'check-card' }, [el('h2', { text: title }), el('p', { text: description }), el('div', { className: 'check-status' }, [el('span', { text: 'Recorded state' }), badge(status, tone)])]))), el('section', { className: 'panel', style: { marginTop: '17px' } }, [el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Evaluation policy' }), el('p', { text: state.data.evaluation_policy.performance_scores })])]), el('div', { className: 'callout' }, [el('strong', { text: 'Interpretation rule: ' }), 'a passing catalog check means the artifact is structurally consistent. It does not prove professional competence, production reliability, legal compliance, or successful agent execution.'])])]);
}

function renderGovernance() {
  const sources = state.data.sources.map((source) => {
    const href = safeSourceUrl(source.url);
    return href
      ? el('a', { className: 'source-link', href, target: '_blank', rel: 'noopener noreferrer' }, [el('span', { text: source.title }), el('strong', { text: '↗' })])
      : el('div', { className: 'source-link' }, [el('span', { text: source.title + ' · blocked URL' }), badge('Untrusted', 'amber')]);
  });
  return el('div', {}, [
    pageHeading('Governance', 'Keep autonomy bounded.', 'The command center makes human ownership, legal caveats, prompt boundaries, and runtime truth visible at the point of use.'),
    el('div', { className: 'governance-grid' }, [
      el('article', { className: 'check-card' }, [el('h2', { text: 'Runtime status' }), el('p', { text: 'Typed runtime roles and registry-only profiles are separate catalog states. A profile file is not an execution heartbeat or an authorization grant.' }), badge('Truthful by design', 'green')]),
      el('article', { className: 'check-card' }, [el('h2', { text: 'Human approval' }), el('p', { text: 'HR, legal, privacy, security, governance, and consequential risk workflows require qualified human review before reliance or external action.' }), badge('Required', 'amber')]),
      el('article', { className: 'check-card' }, [el('h2', { text: 'Prompt safety' }), el('p', { text: 'Prompts are contracts and documentation. They are not permission boundaries. The parent session still controls tools, connectors, sandboxing, and approvals.' }), badge('Guardrail', 'blue')])
    ]),
    el('div', { className: 'dashboard-grid', style: { marginTop: '17px' } }, [
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Governance principles' }), el('p', { text: 'Apply these before promoting or delegating a role.' })])]),
        list(['Evidence first: label observed, configured, simulated, and missing states.', 'Least authority: define the smallest task and write scope that can satisfy the outcome.', 'Human accountability: retain an owner for risk acceptance, legal conclusions, employment decisions, and external actions.', 'No hidden execution: preview and export surfaces never execute agents or workflows.', 'No invented telemetry: performance and success rates appear only when persisted measurements exist.'])
      ]),
      el('section', { className: 'panel' }, [
        el('div', { className: 'panel-header' }, [el('div', {}, [el('h2', { text: 'Authoritative references' }), el('p', { text: 'External sources for role contracts and governance research.' })])]),
        el('div', { className: 'source-list' }, sources)
      ])
    ]),
    el('div', { className: 'callout', style: { marginTop: '17px' } }, [el('strong', { text: 'Legal notice: ' }), 'the EU AI Act Specialist, Legal Counsel, DPO, HR, and related roles provide structured research assistance. They are not licensed counsel, a regulator, an auditor, or a substitute for accountable decision-makers.'])
  ]);
}

function render() {
  if (!state.data) return;
  updateNav();
  if (state.view === 'overview') app.replaceChildren(renderOverview());
  else if (state.view === 'agents') app.replaceChildren(renderAgents());
  else if (state.view === 'olympus') {
    app.replaceChildren(renderOlympus());
    if (state.olympus.status === 'disconnected' && !state.olympus.loading) loadOlympus();
  }
  else if (state.view === 'council') {
    app.replaceChildren(renderCouncil());
    if (state.council.status === 'disconnected' && !state.council.loading) loadCouncil();
  }
  else if (state.view === 'god-loop') {
    app.replaceChildren(renderGodLoop());
    if (state.godLoop.status === 'disconnected' && !state.godLoop.loading) loadGodLoops();
  }
  else if (state.view === 'agent-detail') app.replaceChildren(renderAgentDetail());
  else if (state.view === 'prompts') app.replaceChildren(renderPrompts());
  else if (state.view === 'workflows') app.replaceChildren(renderWorkflows());
  else if (state.view === 'execution') {
    app.replaceChildren(renderExecution());
    if (state.execution.status === 'disconnected' && !state.execution.loading) loadRuntime();
  }
  else if (state.view === 'evaluations') app.replaceChildren(renderEvaluations());
  else if (state.view === 'governance') app.replaceChildren(renderGovernance());
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('agent-factory-theme', state.theme);
  const themeToggle = document.querySelector('#theme-toggle');
  themeToggle?.setAttribute('aria-label', state.theme === 'dark' ? 'Toggle light theme' : 'Toggle dark theme');
  themeToggle?.setAttribute('aria-pressed', String(state.theme === 'light'));
}

function initializeExperiencePicker() {
  const selector = document.querySelector('#experience-select');
  if (!selector) return;
  selector.replaceChildren(...EXPERIENCES.map((experience) => el('option', { value: experience.id, text: `${experience.mark} ${experience.name}` })));
  selector.addEventListener('change', (event) => setExperience(event.target.value));
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
document.querySelector('#mobile-menu').addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('is-open')));
document.querySelector('#sidebar-toggle').addEventListener('click', () => { const collapsed = sidebar.classList.toggle('is-collapsed'); document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', String(!collapsed)); });
document.querySelector('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
document.querySelector('#global-search').addEventListener('input', (event) => { const value = event.target.value; state.search = value; if (state.view !== 'agents') state.view = 'agents'; location.hash = 'agents'; render(); restoreFocus('#global-search', value); });
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#global-search').focus(); } if (event.key === 'Escape' && sidebar.classList.contains('is-open')) { setSidebarOpen(false); document.querySelector('#mobile-menu')?.focus(); } });
window.addEventListener('hashchange', () => { const requested = location.hash.slice(1) || 'overview'; const next = viewAliases[requested] || requested; state.view = validViews.has(next) ? next : 'overview'; if (!validViews.has(next)) history.replaceState({}, '', '#overview'); if (state.view === 'divine-council') openDivineCouncil(); else render(); });

initializeExperiencePicker();
applyTheme();
applyExperience();
setSidebarOpen(false);
window.matchMedia('(max-width: 780px)').addEventListener?.('change', () => setSidebarOpen(false));
fetch(CATALOG_URL, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`); return response.json(); }).then((data) => { state.data = normalizeCatalog(data); state.graph = buildCapabilityGraph(state.data); render(); const firstVisit = !location.hash && !localStorage.getItem('agent-factory-divine-council-seen'); if (state.view === 'divine-council' || firstVisit) openDivineCouncil(); }).catch((error) => { app.replaceChildren(el('div', { className: 'error-state' }, [el('h1', { text: 'Command center unavailable' }), el('p', { text: error.message }), button('Retry', 'primary', () => location.reload())])); });
