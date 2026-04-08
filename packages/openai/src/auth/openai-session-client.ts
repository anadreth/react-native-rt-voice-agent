import { AuthError, ConnectionError } from '@rtva/core';
import type { OpenAIBackendConfig, RTCIceServer } from '../types';

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MODEL = 'gpt-4o-realtime-preview';
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

function getFetch(): FetchLike {
  const fetchFn = (globalThis as { fetch?: FetchLike }).fetch;
  if (!fetchFn) {
    throw new ConnectionError('fetch is not available in this runtime');
  }
  return fetchFn;
}

async function fetchWithTimeout(
  url: string,
  options: Record<string, unknown>,
  timeoutMs: number,
  signal: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await getFetch()(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function defaultTokenExtractor(json: unknown): string {
  const object = json as Record<string, unknown>;
  const data = object.data as Record<string, unknown> | undefined;
  const dataSecret = data?.client_secret as Record<string, unknown> | undefined;
  if (typeof dataSecret?.value === 'string') {
    return dataSecret.value;
  }

  if (typeof object.token === 'string') {
    return object.token;
  }

  const topLevelSecret = object.client_secret as Record<string, unknown> | undefined;
  if (typeof topLevelSecret?.value === 'string') {
    return topLevelSecret.value;
  }

  return '';
}

export function createOpenAISessionClient(config: OpenAIBackendConfig) {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  return {
    async getToken(signal: AbortSignal): Promise<string> {
      const response = await fetchWithTimeout(
        config.tokenUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voice: config.voice ?? 'alloy',
            ...(config.tokenBody ?? {}),
          }),
        },
        timeout,
        signal,
      );

      if (!response.ok) {
        throw new AuthError(
          `Token fetch failed: ${response.status} ${response.statusText}`,
          config.tokenUrl,
          response.status,
        );
      }

      const extractor = config.tokenExtractor ?? defaultTokenExtractor;
      const token = extractor(await response.json());
      if (!token) {
        throw new AuthError('Invalid token response: could not extract token', config.tokenUrl);
      }

      return token;
    },

    async getIceServers(signal: AbortSignal): Promise<RTCIceServer[]> {
      if (!config.iceConfigUrl) {
        return DEFAULT_STUN_SERVERS;
      }

      try {
        const response = await fetchWithTimeout(config.iceConfigUrl, {}, timeout, signal);
        if (!response.ok) {
          return DEFAULT_STUN_SERVERS;
        }
        const payload = await response.json() as { iceServers?: RTCIceServer[] };
        return payload.iceServers ?? DEFAULT_STUN_SERVERS;
      } catch {
        return DEFAULT_STUN_SERVERS;
      }
    },

    getRealtimeEndpoint(): string {
      const model = config.model ?? DEFAULT_MODEL;
      const voice = config.voice ?? 'alloy';
      return `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`;
    },
  };
}
