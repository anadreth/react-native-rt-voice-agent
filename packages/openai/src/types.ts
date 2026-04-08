export interface OpenAIBackendConfig {
  tokenUrl: string;
  iceConfigUrl?: string;
  model?: string;
  voice?: string;
  timeout?: number;
  tokenBody?: Record<string, unknown>;
  tokenExtractor?: (json: unknown) => string;
  session?: {
    modalities?: ('text' | 'audio')[];
    transcriptionModel?: string;
    maxResponseTokens?: number;
  };
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
