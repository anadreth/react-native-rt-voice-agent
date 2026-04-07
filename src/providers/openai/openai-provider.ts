import type {
  RealtimeProvider,
  RealtimeSessionConfig,
  TokenRequestConfig,
  NormalizedMessage,
  RTCIceServer,
} from '../../core/types';
import { AuthError, ProviderError } from '../../core/errors';
import { mapOpenAIMessage } from './openai-message-map';

export interface OpenAIProviderConfig {
  /** URL of your backend endpoint that returns an OpenAI ephemeral token */
  tokenUrl: string;
  /** Optional URL for ICE server config. If omitted, uses default STUN */
  iceConfigUrl?: string;
  /** OpenAI model to use. Defaults to "gpt-4o-realtime-preview" */
  model?: string;
  /** Custom function to extract token from your backend's response JSON */
  tokenExtractor?: (json: unknown) => string;
  /** Additional body fields to send with the token request */
  tokenBody?: Record<string, unknown>;
}

const DEFAULT_MODEL = 'gpt-4o-realtime-preview';

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Creates an OpenAI Realtime provider.
 *
 * @example
 * ```ts
 * const provider = openAIProvider({
 *   tokenUrl: 'https://mybackend.com/api/openai-session',
 * });
 * ```
 */
export function openAIProvider(config: OpenAIProviderConfig): RealtimeProvider {
  const model = config.model ?? DEFAULT_MODEL;

  const extractToken = config.tokenExtractor ?? defaultTokenExtractor;

  return {
    async getToken(tokenConfig: TokenRequestConfig): Promise<string> {
      const { voice, ...restTokenConfig } = tokenConfig;
      const body = {
        voice,
        ...config.tokenBody,
        ...restTokenConfig,
      };

      const res = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new AuthError(
          `Token fetch failed: ${res.status} ${res.statusText}`,
          config.tokenUrl,
          res.status
        );
      }

      const json = await res.json();
      const token = extractToken(json);

      if (!token) {
        throw new AuthError(
          'Invalid token response: could not extract token',
          config.tokenUrl,
          res.status
        );
      }

      return token;
    },

    async getIceServers(): Promise<RTCIceServer[]> {
      if (!config.iceConfigUrl) {
        return DEFAULT_STUN_SERVERS;
      }

      try {
        const res = await fetch(config.iceConfigUrl);
        if (!res.ok) {
          throw new ProviderError(`ICE config fetch failed: ${res.status}`);
        }
        const json = await res.json();
        return json.iceServers ?? DEFAULT_STUN_SERVERS;
      } catch {
        return DEFAULT_STUN_SERVERS;
      }
    },

    getRealtimeEndpoint(voice: string): string {
      return `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`;
    },

    mapMessage(raw: unknown): NormalizedMessage | null {
      if (typeof raw !== 'object' || raw === null) return null;
      return mapOpenAIMessage(raw as Record<string, unknown>);
    },

    buildSessionUpdate(sessionConfig: RealtimeSessionConfig): unknown {
      const sc = sessionConfig.sessionConfig;
      return {
        type: 'session.update',
        session: {
          modalities: sc?.modalities ?? ['text', 'audio'],
          input_audio_transcription: {
            model: sc?.transcriptionModel ?? 'gpt-4o-transcribe',
          },
          ...(sc?.maxResponseTokens != null && {
            conversation: {
              max_response_output_tokens: sc.maxResponseTokens,
            },
          }),
          ...(sessionConfig.tools && sessionConfig.tools.length > 0 && {
            tools: sessionConfig.tools.map((t) => ({
              type: 'function',
              name: t.name,
              description: t.description,
              parameters: t.parameters ?? { type: 'object', properties: {} },
            })),
          }),
        },
      };
    },
  };
}

function defaultTokenExtractor(json: unknown): string {
  const obj = json as Record<string, unknown>;
  // Try OpenAI's response format: { data: { client_secret: { value: "..." } } }
  const data = obj.data as Record<string, unknown> | undefined;
  if (data) {
    const secret = data.client_secret as Record<string, unknown> | undefined;
    if (secret?.value) return secret.value as string;
  }
  // Try flat format: { token: "..." }
  if (typeof obj.token === 'string') return obj.token;
  // Try: { client_secret: { value: "..." } }
  const topSecret = obj.client_secret as Record<string, unknown> | undefined;
  if (topSecret?.value) return topSecret.value as string;
  return '';
}
