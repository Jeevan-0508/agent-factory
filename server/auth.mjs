import crypto from 'node:crypto';
import { HttpError, id, now, parseCookies } from './util.mjs';

export const LOCAL_WORKSPACE = 'local-workspace';

export function createAuth(db) {
  const sessions = new Map();
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  return {
    issue() {
      const token = crypto.randomBytes(32).toString('base64url');
      const createdAt = now();
      const session = { token, actorId: 'local-operator', workspaceId: LOCAL_WORKSPACE, createdAt, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(), trust: 'loopback-single-operator' };
      sessions.set(token, session);
      return session;
    },
    require(request) {
      const cookies = parseCookies(request.headers.cookie || '');
      const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null;
      const session = sessions.get(cookies.af_session || bearer);
      if (!session || Date.parse(session.expiresAt) <= Date.now()) { if (session) sessions.delete(session.token); throw new HttpError(401, 'Authenticated local session required', 'unauthenticated'); }
      return session;
    },
    cookie(session) { return `af_session=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`; },
    clear() { sessions.clear(); }
  };
}

export function ensureWorkspace(db, workspaceId = LOCAL_WORKSPACE) {
  const row = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!row) db.prepare('INSERT INTO workspaces(id, name, created_at) VALUES (?, ?, ?)').run(workspaceId, 'Local Agent Factory Workspace', now());
  return workspaceId;
}

export function audit(db, event) {
  db.prepare(`INSERT INTO audit_events(id, workspace_id, actor_id, correlation_id, event_type, entity_type, entity_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id('audit'), event.workspaceId, event.actorId, event.correlationId, event.eventType, event.entityType, event.entityId, JSON.stringify(event.payload || {}), now());
}
