import fs from 'node:fs';
import path from 'node:path';

export function loadCatalog(root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'roles.json'), 'utf8'));
  const roles = new Map(catalog.roles.map((role) => [role.name, role]));
  return { catalog, roles };
}

export function publicRole(role) {
  if (!role) return null;
  return { name: role.name, title: role.title, family: role.family, mission: role.mission, runtime: role.runtime, display_name: role.display_name, capabilities: role.capabilities, deliverables: role.deliverables, boundaries: role.boundaries };
}
