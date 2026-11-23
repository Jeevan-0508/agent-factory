import crypto from 'node:crypto';

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export const hashPlan = (plan) => sha256(JSON.stringify(canonical(plan)));
export function cancellationError(message = 'Execution was cancelled') { return new HttpError(409, message, 'cancelled'); }
export function throwIfAborted(signal) { if (signal?.aborted) throw cancellationError(); }
export function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(cancellationError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class HttpError extends Error {
  constructor(status, message, code = 'request_error', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonResponse(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

export async function readJson(request, maxBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Request body is too large', 'payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Request body must be valid JSON', 'invalid_json'); }
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    try {
      const key = decodeURIComponent(part.slice(0, separator).trim());
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      if (key && value) cookies[key] = value;
    } catch { /* malformed cookies are ignored and fail authentication */ }
  }
  return cookies;
}

export function assertObject(value, message = 'Expected an object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, message, 'invalid_object');
}
