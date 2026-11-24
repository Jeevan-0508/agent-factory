import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../server/api.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('Paperclip discovery routes require local auth and remain disabled by default', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-factory-provider-'));
  const app = createApp({ root, dataDirectory, port: 0 });
  const address = await app.start();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unauthenticated = await fetch(`${base}/api/v1/providers/paperclip/health`);
    assert.equal(unauthenticated.status, 401);
    const session = await fetch(`${base}/api/v1/session`);
    const cookie = session.headers.get('set-cookie').split(';')[0];
    const disabled = await fetch(`${base}/api/v1/providers/paperclip/health`, { headers: { Cookie: cookie } });
    assert.equal(disabled.status, 503);
    const body = await disabled.json();
    assert.equal(body.error, 'provider_disabled');
    const events = app.db.prepare("SELECT event_type, payload_json FROM audit_events WHERE event_type = 'PROVIDER_READ'").all();
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(events[0].payload_json).status, 'failed');
  } finally { await app.close(); }
});
