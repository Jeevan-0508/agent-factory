import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = process.env.AGENT_FACTORY_DATA_DIR || path.join(root, '.data');
const port = Number(process.env.AGENT_FACTORY_PORT || process.env.PORT || 8787);
const app = createApp({ root, dataDirectory, port });
const address = await app.start();
console.log(JSON.stringify({ ok: true, service: 'agent-factory-runtime', address: `http://${address.address}:${address.port}`, data_directory: dataDirectory, mode: 'deterministic-local', shutdown: 'SIGINT/SIGTERM' }));

const shutdown = async (signal) => { console.log(JSON.stringify({ event: 'shutdown', signal })); await app.close(); process.exit(0); };
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
