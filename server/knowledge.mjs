import { all, get, run, transaction } from './db.mjs';
import { HttpError, id, now } from './util.mjs';

function bounded(value, label, max) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) throw new HttpError(400, `${label} is invalid`, 'invalid_knowledge_input');
  return value.trim();
}

export function createKnowledgeStore({ db }) {
  function list(workspaceId) {
    return all(db, 'SELECT id, category, title, content, version, status, proposed_by, approved_by, supersedes_id, created_at, updated_at FROM engineering_knowledge WHERE workspace_id = ? ORDER BY updated_at DESC', [workspaceId]);
  }
  function propose({ workspaceId, actorId, category, title, content, supersedesId = null }) {
    const item = { id: id('knowledge'), category: bounded(category, 'Category', 80), title: bounded(title, 'Title', 240), content: bounded(content, 'Content', 20_000) };
    const prior = supersedesId ? get(db, 'SELECT id, version, status FROM engineering_knowledge WHERE workspace_id = ? AND id = ?', [workspaceId, supersedesId]) : null;
    if (supersedesId && !prior) throw new HttpError(404, 'Knowledge item to supersede was not found', 'knowledge_not_found');
    const version = prior ? prior.version + 1 : 1;
    const timestamp = now();
    run(db, 'INSERT INTO engineering_knowledge(id, workspace_id, category, title, content, version, status, proposed_by, supersedes_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [item.id, workspaceId, item.category, item.title, item.content, version, 'PROPOSED', actorId, supersedesId, timestamp, timestamp]);
    return get(db, 'SELECT * FROM engineering_knowledge WHERE id = ?', [item.id]);
  }
  function approve({ workspaceId, actorId, itemId }) {
    const item = get(db, 'SELECT * FROM engineering_knowledge WHERE workspace_id = ? AND id = ?', [workspaceId, itemId]);
    if (!item) throw new HttpError(404, 'Knowledge item was not found', 'knowledge_not_found');
    if (item.status !== 'PROPOSED') throw new HttpError(409, 'Knowledge item is not awaiting review', 'knowledge_invalid_transition');
    if (item.proposed_by === actorId) throw new HttpError(403, 'Knowledge proposals require an independent approver', 'knowledge_independent_approval_required');
    transaction(db, () => run(db, 'UPDATE engineering_knowledge SET status = ?, approved_by = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', ['ACCEPTED', actorId, now(), workspaceId, itemId]));
    return get(db, 'SELECT * FROM engineering_knowledge WHERE id = ?', [itemId]);
  }
  function revert({ workspaceId, actorId, itemId }) {
    const item = get(db, 'SELECT * FROM engineering_knowledge WHERE workspace_id = ? AND id = ?', [workspaceId, itemId]);
    if (!item) throw new HttpError(404, 'Knowledge item was not found', 'knowledge_not_found');
    if (item.status !== 'ACCEPTED') throw new HttpError(409, 'Only accepted knowledge can be reverted', 'knowledge_invalid_transition');
    run(db, 'UPDATE engineering_knowledge SET status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', ['REVERTED', now(), workspaceId, itemId]);
    return { ...item, status: 'REVERTED', reverted_by: actorId };
  }
  return { list, propose, approve, revert };
}
