import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'roles.json'), 'utf8'));
const errors = [];
const roles = catalog.roles || [];
const names = roles.map((role) => role.name);
const codenames = roles.map((role) => role.codename);
if (catalog.name !== 'agent-factory') errors.push('catalog name must be agent-factory');
if (catalog.total_roles !== 100 || roles.length !== 100) errors.push(`expected exactly 100 roles, found ${roles.length}`);
if (new Set(names).size !== names.length) errors.push('duplicate role IDs');
if (new Set(codenames).size !== codenames.length) errors.push('duplicate mythological codenames');
for (const role of roles) {
  for (const field of ['name', 'title', 'family', 'mission', 'codename', 'mythology', 'prompt']) if (!role[field]) errors.push(`${role.name || '<unknown>'} missing ${field}`);
  for (const field of ['capabilities', 'deliverables', 'boundaries']) if (!Array.isArray(role[field]) || role[field].length < 2) errors.push(`${role.name || '<unknown>'} has incomplete ${field}`);
  if (typeof role.prompt !== 'string' || role.prompt.length < 200) errors.push(`${role.name || '<unknown>'} prompt is too short`);
  const toml = path.join(root, 'agents', `${role.name.replaceAll('_', '-')}.toml`);
  if (!fs.existsSync(toml)) errors.push(`${role.name} missing TOML definition`);
  if (role.runtime && !fs.existsSync(path.join(root, 'runtime', 'approved', `${role.name.replaceAll('_', '-')}.toml`))) errors.push(`${role.name} missing approved runtime TOML`);
}
const runtimeCount = roles.filter((role) => role.runtime).length;
if (runtimeCount !== 30) errors.push(`expected 30 runtime roles, found ${runtimeCount}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(JSON.stringify({ ok: true, total_roles: roles.length, runtime_supported: runtimeCount, registry_only: roles.length - runtimeCount }, null, 2));
