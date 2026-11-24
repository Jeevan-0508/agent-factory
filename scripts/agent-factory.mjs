#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'catalog', 'roles.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const roles = new Map(catalog.roles.map((role) => [role.name, role]));
const manifestName = 'agent-factory-manifest.json';

function usage() {
  console.log(`AGENT//FACTORY portable Codex integration

Commands:
  discover [--runtime]                         List catalog roles without changing files
  install --target <repo> --roles <ids>        Preview selected project-scoped agents
  install --target <dir> --scope codex-home     Preview personal agents under <dir>\\agents
  validate --target <repo>                     Validate an installed manifest and files
  update --target <repo> --roles <ids>         Backup and replace selected files
  uninstall --target <repo> --roles <ids>     Remove only unchanged installed files
  rollback --target <repo>                    Restore the most recent backup

Mutating commands require --apply. Use --dry-run to make the plan explicit.
No command changes CODEX_HOME unless --target points there explicitly.
`);
}

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command, roles: [], apply: false, dryRun: false, runtime: false, scope: 'project' };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === '--apply') options.apply = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--runtime') options.runtime = true;
    else if (value === '--scope') options.scope = rest[++index];
    else if (value === '--target') options.target = rest[++index];
    else if (value === '--roles') options.roles.push(...String(rest[++index] || '').split(',').map((item) => item.trim()).filter(Boolean));
    else if (value === '--role') options.roles.push(rest[++index]);
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

function targetPath(options) {
  if (!options.target) throw new Error('--target is required; choose a project or an explicit Codex directory.');
  const resolved = path.resolve(options.target);
  if (resolved === path.parse(resolved).root) throw new Error('Refusing to operate on a filesystem root.');
  return resolved;
}

function selectedRoles(options) {
  const requested = options.roles.length ? options.roles : catalog.roles.filter((role) => options.runtime ? role.runtime : false).map((role) => role.name);
  if (!requested.length) throw new Error('Select roles with --roles or pass --runtime for the typed runtime set.');
  const unique = [...new Set(requested)];
  const unknown = unique.filter((name) => !roles.has(name));
  if (unknown.length) throw new Error(`Unknown catalog role(s): ${unknown.join(', ')}`);
  return unique.map((name) => roles.get(name));
}

function tomlQuote(value) { return JSON.stringify(value); }
function prompt(role) {
  return [
    `You are ${role.display_name}, the ${role.title}, in a governed engineering workspace.`,
    `Mission: ${role.mission}`,
    `Capabilities: ${role.capabilities.join('; ')}`,
    `Expected deliverables: ${role.deliverables.join('; ')}`,
    `Boundaries: ${role.boundaries.join('; ')}`,
    'Work only within the assigned repository scope. State assumptions, evidence, acceptance criteria, and unresolved risks.',
    'Do not commit, push, deploy, publish, expose secrets, change permissions, or bypass approval requirements unless the parent session explicitly authorizes that action.'
  ].join('\n');
}
function agentToml(role) { return `name = ${tomlQuote(role.name)}\ndescription = ${tomlQuote(role.mission)}\ndeveloper_instructions = """\n${prompt(role)}\n"""\n`; }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function layout(target, scope) {
  if (!['project', 'codex-home'].includes(scope)) throw new Error('--scope must be project or codex-home.');
  if (scope === 'codex-home') return { manifest: path.join(target, manifestName), agents: path.join(target, 'agents'), prefix: 'agents' };
  return { manifest: path.join(target, '.codex', manifestName), agents: path.join(target, '.codex', 'agents'), prefix: path.posix.join('.codex', 'agents') };
}
function manifestPath(target, scope = 'project') { return layout(target, scope).manifest; }
function agentsPath(target, scope = 'project') { return layout(target, scope).agents; }

function readManifest(target, scope = 'project') {
  const file = manifestPath(target, scope);
  if (!fs.existsSync(file)) return { version: 1, files: {} };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.version !== 1 || !value.files || typeof value.files !== 'object') throw new Error('The AGENT//FACTORY manifest is invalid.');
  return value;
}

function planInstall(target, selected, replace = false, scope = 'project') {
  const existing = readManifest(target, scope);
  const manifestFile = manifestPath(target, scope);
  const files = selected.map((role) => ({ role: role.name, file: path.posix.join(layout(target, scope).prefix, `${role.name}.toml`), content: agentToml(role) }));
  const conflicts = files.filter((item) => fs.existsSync(path.join(target, item.file)) && !replace);
  const unmanaged = files.filter((item) => fs.existsSync(path.join(target, item.file)) && !existing.files[item.file]);
  if (conflicts.length) throw new Error(`Refusing to overwrite existing file(s): ${conflicts.map((item) => item.file).join(', ')}. Use update for manifest-owned files or review the target manually.`);
  if (unmanaged.length) throw new Error(`Refusing to overwrite unmanaged file(s): ${unmanaged.map((item) => item.file).join(', ')}`);
  return { files, existing, manifestFile, manifestExists: fs.existsSync(manifestFile) };
}

function backup(target, files, manifest, manifestFile, manifestExists) {
  const backupDir = path.join(target, '.agent-factory', 'backups', new Date().toISOString().replaceAll(':', '-'));
  fs.mkdirSync(backupDir, { recursive: true });
  const snapshot = {
    version: 1,
    manifest_exists: manifestExists,
    manifest_content: manifestExists ? fs.readFileSync(manifestFile, 'utf8') : null
  };
  fs.writeFileSync(path.join(backupDir, 'state.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  for (const file of files) {
    const source = path.join(target, file);
    if (fs.existsSync(source)) {
      const destination = path.join(backupDir, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  }
  return backupDir;
}

function writeInstall(target, selected, replace = false, scope = 'project') {
  const plan = planInstall(target, selected, replace, scope);
  const changed = plan.files.map((item) => item.file);
  const backupDir = replace ? backup(target, changed, plan.existing, plan.manifestFile, plan.manifestExists) : null;
  for (const item of plan.files) {
    const file = path.join(target, item.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, item.content, 'utf8');
  }
  const files = { ...plan.existing.files, ...Object.fromEntries(plan.files.map((item) => [item.file, { role: item.role, sha256: sha(item.content) }])) };
  const manifest = { version: 1, source: 'AGENT//FACTORY', catalog_version: catalog.version, installed_at: new Date().toISOString(), backup: backupDir ? path.relative(target, backupDir) : null, files };
  fs.mkdirSync(path.dirname(manifestPath(target, scope)), { recursive: true });
  fs.writeFileSync(manifestPath(target, scope), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { files: changed, backup: backupDir ? path.relative(target, backupDir) : null };
}

function uninstall(target, selected, apply, scope = 'project') {
  const manifest = readManifest(target, scope);
  const files = selected.map((role) => path.posix.join(layout(target, scope).prefix, `${role.name}.toml`));
  const removable = [];
  for (const file of files) {
    const entry = manifest.files[file];
    const absolute = path.join(target, file);
    if (!entry) throw new Error(`Refusing to remove unmanaged file: ${file}`);
    if (!fs.existsSync(absolute)) continue;
    const actual = sha(fs.readFileSync(absolute));
    if (actual !== entry.sha256) throw new Error(`Refusing to remove modified file: ${file}`);
    removable.push({ file, absolute });
  }
  if (apply) {
    for (const item of removable) fs.rmSync(item.absolute);
    for (const file of files) delete manifest.files[file];
    fs.writeFileSync(manifestPath(target, scope), `${JSON.stringify({ ...manifest, updated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  }
  return removable.map((item) => item.file);
}

function validate(target, scope = 'project') {
  const manifest = readManifest(target, scope);
  const errors = [];
  for (const [file, entry] of Object.entries(manifest.files)) {
    const absolute = path.join(target, file);
    if (!fs.existsSync(absolute)) errors.push(`${file}: missing`);
    else if (sha(fs.readFileSync(absolute)) !== entry.sha256) errors.push(`${file}: modified`);
  }
  return { ok: errors.length === 0, files: Object.keys(manifest.files).length, errors };
}

function rollback(target, scope = 'project') {
  const manifest = readManifest(target, scope);
  if (!manifest.backup) throw new Error('No backup is recorded in the manifest.');
  const backupDir = path.join(target, manifest.backup);
  if (!fs.existsSync(backupDir)) throw new Error('The recorded backup directory is missing.');
  const stateFile = path.join(backupDir, 'state.json');
  if (!fs.existsSync(stateFile)) throw new Error('The recorded backup snapshot is missing.');
  const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (snapshot.version !== 1 || typeof snapshot.manifest_exists !== 'boolean') throw new Error('The recorded backup snapshot is invalid.');
  const priorManifest = snapshot.manifest_exists ? JSON.parse(snapshot.manifest_content) : { version: 1, files: {} };
  const priorFiles = new Set(Object.keys(priorManifest.files || {}));
  for (const file of Object.keys(manifest.files)) {
    if (priorFiles.has(file)) continue;
    const destination = path.join(target, file);
    if (fs.existsSync(destination)) fs.rmSync(destination);
  }
  for (const file of priorFiles) {
    const source = path.join(backupDir, file);
    const destination = path.join(target, file);
    if (fs.existsSync(source)) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); }
  }
  const manifestFile = manifestPath(target, scope);
  if (snapshot.manifest_exists) fs.writeFileSync(manifestFile, snapshot.manifest_content, 'utf8');
  else if (fs.existsSync(manifestFile)) fs.rmSync(manifestFile);
  return backupDir;
}

function discover(options) {
  const list = catalog.roles.filter((role) => !options.runtime || role.runtime).map((role) => ({ id: role.name, title: role.title, runtime: role.runtime, family: role.family }));
  console.log(JSON.stringify({ catalog_version: catalog.version, total: list.length, roles: list }, null, 2));
}

function main(options) {
  if (options.command === 'help' || options.command === '--help') return usage();
  if (options.command === 'discover') return discover(options);
  const target = targetPath(options);
  if (options.command === 'validate') return console.log(JSON.stringify(validate(target, options.scope), null, 2));
  if (options.command === 'rollback') {
    if (!options.apply) return console.log(JSON.stringify({ action: 'rollback', target, apply_required: true }, null, 2));
    return console.log(JSON.stringify({ action: 'rollback', backup: rollback(target, options.scope) }, null, 2));
  }
  const selected = selectedRoles(options);
  if (options.command === 'uninstall') {
    const files = uninstall(target, selected, options.apply && !options.dryRun, options.scope);
    return console.log(JSON.stringify({ action: 'uninstall', target, apply: options.apply && !options.dryRun, files }, null, 2));
  }
  if (!['install', 'update'].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
  const replace = options.command === 'update';
  if (!options.apply || options.dryRun) {
    const plan = planInstall(target, selected, replace, options.scope);
    return console.log(JSON.stringify({ action: options.command, target, apply: false, files: plan.files.map((item) => item.file), backup_required: replace }, null, 2));
  }
  return console.log(JSON.stringify({ action: options.command, target, scope: options.scope, apply: true, ...writeInstall(target, selected, replace, options.scope) }, null, 2));
}

try { main(parseArgs(process.argv.slice(2))); } catch (error) { console.error(`agent-factory: ${error.message}`); process.exitCode = 1; }
