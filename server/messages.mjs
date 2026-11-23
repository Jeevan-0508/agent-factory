import { HttpError, assertObject } from './util.mjs';

export function validateHandoff(envelope) {
  assertObject(envelope, 'Handoff must be an object');
  for (const field of ['sender_agent', 'recipient_agent', 'message_type', 'correlation_id']) if (typeof envelope[field] !== 'string' || !envelope[field]) throw new HttpError(400, `Handoff requires ${field}`, 'invalid_handoff');
  if (envelope.message_type !== 'structured_handoff') throw new HttpError(400, 'Only structured handoffs are supported', 'invalid_handoff');
  assertObject(envelope.input, 'Handoff input must be an object');
  assertObject(envelope.output, 'Handoff output must be an object');
  if (!Array.isArray(envelope.evidence)) throw new HttpError(400, 'Handoff evidence must be an array', 'invalid_handoff');
  assertObject(envelope.authorization, 'Handoff authorization must be an object');
  return envelope;
}
