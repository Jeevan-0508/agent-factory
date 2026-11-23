import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function projectRoot(metaUrl = import.meta.url) {
  return fileURLToPath(new URL('..', metaUrl));
}

export function validateCatalog(root = projectRoot()) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'roles.json'), 'utf8'));
  const errors = [];
  const roles = catalog.roles || [];
  const names = roles.map((role) => role.name);
  const codenames = roles.map((role) => role.codename);
  if (catalog.name !== 'agent-factory') errors.push('catalog name must be agent-factory');
  if (catalog.total_roles !== 100 || roles.length !== 100) errors.push(`expected exactly 100 roles, found ${roles.length}`);
  if (new Set(names).size !== names.length) errors.push('duplicate role IDs');
  if (new Set(codenames).size !== codenames.length) errors.push('duplicate mythological codenames');
  const runtimeNames = roles.filter((role) => role.runtime).map((role) => role.name).sort();
  const registryNames = roles.filter((role) => !role.runtime).map((role) => role.name).sort();
  if (JSON.stringify([...catalog.runtime_supported_roles].sort()) !== JSON.stringify(runtimeNames)) errors.push('runtime_supported_roles is out of sync with role runtime flags');
  if (JSON.stringify([...catalog.registry_only_roles].sort()) !== JSON.stringify(registryNames)) errors.push('registry_only_roles is out of sync with role runtime flags');
  for (const role of roles) {
    for (const field of ['name', 'title', 'family', 'mission', 'codename', 'mythology', 'prompt']) if (!role[field]) errors.push(`${role.name || '<unknown>'} missing ${field}`);
    for (const field of ['capabilities', 'deliverables', 'boundaries']) if (!Array.isArray(role[field]) || role[field].length < 2) errors.push(`${role.name || '<unknown>'} has incomplete ${field}`);
    for (const field of ['required_inputs', 'tools_integrations', 'knowledge_domains', 'frameworks_standards', 'example_tasks', 'failure_handling', 'evaluation_criteria', 'known_limitations']) if (!Array.isArray(role[field]) || role[field].length < 2) errors.push(`${role.name || '<unknown>'} has incomplete ${field}`);
    for (const field of ['approval_requirements', 'runtime_compatibility', 'maintenance']) if (!role[field]) errors.push(`${role.name || '<unknown>'} missing ${field}`);
    if (typeof role.prompt !== 'string' || role.prompt.length < 200) errors.push(`${role.name || '<unknown>'} prompt is too short`);
    const toml = path.join(root, 'agents', `${role.name.replaceAll('_', '-')}.toml`);
    if (!fs.existsSync(toml)) errors.push(`${role.name} missing TOML definition`);
    if (role.runtime && !fs.existsSync(path.join(root, 'runtime', 'approved', `${role.name.replaceAll('_', '-')}.toml`))) errors.push(`${role.name} missing approved runtime TOML`);
    if (fs.existsSync(toml)) {
      const tomlText = fs.readFileSync(toml, 'utf8');
      if (!new RegExp(`^name = "${role.name}"$`, 'm').test(tomlText)) errors.push(`${role.name} TOML name mismatch`);
      if (!tomlText.includes('developer_instructions = """')) errors.push(`${role.name} TOML missing developer_instructions`);
    }
  }
  const runtimeCount = roles.filter((role) => role.runtime).length;
  if (runtimeCount !== 30) errors.push(`expected 30 runtime roles, found ${runtimeCount}`);
  const roleSet = new Set(names);
  if (!Array.isArray(catalog.workflow_templates) || catalog.workflow_templates.length < 5) errors.push('workflow_templates must contain at least five templates');
  for (const workflow of catalog.workflow_templates || []) {
    if (!workflow.id || !workflow.name || !Array.isArray(workflow.steps) || workflow.steps.length < 2) errors.push(`invalid workflow template: ${workflow.id || '<unknown>'}`);
    for (const step of workflow.steps || []) if (!roleSet.has(step.role)) errors.push(`${workflow.id || '<unknown>'} references unknown role ${step.role}`);
  }
  if (!catalog.evaluation_policy || !catalog.evaluation_policy.schema_validation) errors.push('evaluation_policy is missing');
  for (const required of ['dashboard/index.html', 'dashboard/app.js', 'dashboard/styles.css', 'catalog/schema.json', 'docs/governance.md', 'docs/installation.md', 'docs/prompt-library.md', 'docs/role-catalog.md']) if (!fs.existsSync(path.join(root, required))) errors.push(`missing artifact: ${required}`);
  const agentFiles = fs.readdirSync(path.join(root, 'agents')).filter((file) => file.endsWith('.toml'));
  if (agentFiles.length !== 100) errors.push(`expected 100 agent TOML files, found ${agentFiles.length}`);
  const approvedFiles = fs.readdirSync(path.join(root, 'runtime', 'approved')).filter((file) => file.endsWith('.toml'));
  if (approvedFiles.length !== 30) errors.push(`expected 30 approved TOML files, found ${approvedFiles.length}`);
  return { errors, total_roles: roles.length, runtime_supported: runtimeCount, registry_only: roles.length - runtimeCount };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = validateCatalog();
  if (result.errors.length) { console.error(result.errors.join('\n')); process.exit(1); }
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}
