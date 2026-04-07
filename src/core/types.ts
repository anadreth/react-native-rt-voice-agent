// ─── Session States ───────────────────────────────────────────────

export type SessionState =
  | 'idle'
  | 'requesting_mic'
  | 'authenticating'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'stopped';

// ─── Conversation ─────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFinal: boolean;
  status?: 'speaking' | 'processing' | 'final';
}

// ─── Events ───────────────────────────────────────────────────────

export type RealtimeEvent =
  | { type: 'state.changed'; state: SessionState; previousState: SessionState }
  | { type: 'user.speech.started' }
  | { type: 'user.speech.stopped' }
  | { type: 'user.transcript.partial'; text: string; messageId: string }
  | { type: 'user.transcript.final'; text: string; messageId: string }
  | { type: 'assistant.delta'; text: string; messageId: string }
  | { type: 'assistant.done'; text: string; messageId: string }
  | { type: 'tool.called'; name: string; args: Record<string, unknown>; callId: string }
  | { type: 'tool.result'; name: string; result: unknown; callId: string }
  | { type: 'conversation.updated'; messages: ConversationMessage[] }
  | { type: 'error'; error: Error; fatal: boolean }
  | { type: 'raw'; data: unknown };

// ─── Tools ────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── Provider ─────────────────────────────────────────────────────

export interface TokenRequestConfig {
  voice: string;
  [key: string]: unknown;
}

export interface NormalizedMessage {
  kind:
    | 'user_speech_started'
    | 'user_speech_stopped'
    | 'audio_committed'
    | 'user_transcript_partial'
    | 'user_transcript_final'
    | 'assistant_delta'
    | 'assistant_done'
    | 'tool_call';
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  callId?: string;
}

export interface RealtimeProvider {
  /** Fetch an ephemeral auth token */
  getToken(config: TokenRequestConfig): Promise<string>;
  /** Return ICE server configuration */
  getIceServers(): Promise<RTCIceServer[]>;
  /** Get the realtime SDP endpoint URL */
  getRealtimeEndpoint(voice: string): string;
  /** Map raw data channel message to a normalized event, or null to skip */
  mapMessage(raw: unknown): NormalizedMessage | null;
  /** Build the session.update payload sent when data channel opens */
  buildSessionUpdate(config: RealtimeSessionConfig): unknown;
}

// ─── Configuration ────────────────────────────────────────────────

export interface RealtimeSessionConfig {
  provider: RealtimeProvider;
  voice?: string;
  tools?: ToolDefinition[];
  onEvent?: (event: RealtimeEvent) => void;
  initialMessage?: string;
  sessionConfig?: {
    modalities?: ('text' | 'audio')[];
    transcriptionModel?: string;
    maxResponseTokens?: number;
  };
  audio?: {
    constraints?: Record<string, unknown>;
  };
  logger?: LoggerInterface;
}

// ─── Logger ───────────────────────────────────────────────────────

export interface LoggerInterface {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─── RTCIceServer (for environments without WebRTC types) ─────────

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
