import { HttpError } from './util.mjs';

const PROVIDER_METADATA = [
  { id: 'deterministic-local', status: 'configured', network: 'none', credentials: 'not applicable', execution_mode: 'rule-based local contract' },
  { id: 'connected-model-adapter', status: 'disabled', network: 'disabled until explicit credentials and authorization', credentials: 'never displayed', execution_mode: 'provider-neutral interface only' }
];

export function createProviderRegistry() {
  return {
    list() { return PROVIDER_METADATA.map((provider) => ({ ...provider })); },
    async invoke(providerId) {
      if (providerId !== 'deterministic-local') throw new HttpError(403, 'Connected providers are disabled until explicit credentials and authorization are configured', 'provider_disabled');
      throw new HttpError(501, 'Deterministic execution is implemented by the local runtime contract, not a remote provider call', 'provider_not_applicable');
    }
  };
}
