import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const cli = path.join(root, 'scripts', 'agent-factory.mjs');

function run(...args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

test('portable Codex installer is explicit, project-scoped, reversible, and does not overwrite unmanaged files', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-install-'));
  const dryRun = JSON.parse(run('install', '--target', target, '--roles', 'solution_architect,qa_test_engineer', '--dry-run'));
  assert.equal(dryRun.apply, false);
  assert.equal(fs.existsSync(path.join(target, '.codex')), false);

  const installed = JSON.parse(run('install', '--target', target, '--roles', 'solution_architect,qa_test_engineer', '--apply'));
  assert.equal(installed.apply, true);
  assert.equal(installed.files.length, 2);
  assert.equal(fs.existsSync(path.join(target, '.codex', 'agents', 'solution_architect.toml')), true);
  assert.deepEqual(JSON.parse(run('validate', '--target', target)), { ok: true, files: 2, errors: [] });

  assert.throws(() => run('install', '--target', target, '--roles', 'solution_architect', '--apply'), /Refusing to overwrite/);
  const updated = JSON.parse(run('update', '--target', target, '--roles', 'solution_architect', '--apply'));
  assert.equal(updated.apply, true);
  assert.ok(updated.backup);
  assert.equal(fs.existsSync(path.join(target, updated.backup)), true);

  fs.appendFileSync(path.join(target, '.codex', 'agents', 'qa_test_engineer.toml'), '\nlocal edit\n');
  assert.throws(() => run('uninstall', '--target', target, '--roles', 'qa_test_engineer', '--apply'), /modified file/);
  const removed = JSON.parse(run('uninstall', '--target', target, '--roles', 'solution_architect', '--apply'));
  assert.deepEqual(removed.files, ['.codex/agents/solution_architect.toml']);
  assert.equal(fs.existsSync(path.join(target, '.codex', 'agents', 'solution_architect.toml')), false);
});

test('rollback removes roles introduced by an update and restores the prior manifest', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-rollback-'));
  run('install', '--target', target, '--roles', 'solution_architect', '--apply');
  const before = JSON.parse(fs.readFileSync(path.join(target, '.codex', 'agent-factory-manifest.json'), 'utf8'));

  run('update', '--target', target, '--roles', 'solution_architect,qa_test_engineer', '--apply');
  assert.equal(fs.existsSync(path.join(target, '.codex', 'agents', 'qa_test_engineer.toml')), true);

  run('rollback', '--target', target, '--apply');

  assert.equal(fs.existsSync(path.join(target, '.codex', 'agents', 'qa_test_engineer.toml')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, '.codex', 'agent-factory-manifest.json'), 'utf8')), before);
  assert.deepEqual(JSON.parse(run('validate', '--target', target)), { ok: true, files: 1, errors: [] });
});

test('discover runtime roles is catalog-backed', () => {
  const discovered = JSON.parse(run('discover', '--runtime'));
  assert.equal(discovered.total, 30);
  assert.ok(discovered.roles.some((role) => role.id === 'solution_architect' && role.runtime === true));
});

test('personal Codex scope targets the native agents directory without a nested .codex path', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-codex-home-'));
  const installed = JSON.parse(run('install', '--target', target, '--scope', 'codex-home', '--roles', 'solution_architect', '--apply'));
  assert.deepEqual(installed.files, ['agents/solution_architect.toml']);
  assert.equal(fs.existsSync(path.join(target, 'agents', 'solution_architect.toml')), true);
  assert.equal(fs.existsSync(path.join(target, '.codex', 'agents')), false);
  assert.deepEqual(JSON.parse(run('validate', '--target', target, '--scope', 'codex-home')), { ok: true, files: 1, errors: [] });
});
