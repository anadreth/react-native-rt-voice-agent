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
  | { type: 'volume.changed'; level: number }
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
    | 'tool_call'
    | 'provider_error'
    | 'session_created';
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  callId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface RealtimeProvider {
  /** Transport type this provider uses */
  readonly transportType: 'webrtc' | 'websocket';
  /** Create the transport instance for this provider */
  createTransport(logger?: LoggerInterface): Transport;
  /** Map raw incoming message to a normalized event, or null to skip */
  mapMessage(raw: unknown): NormalizedMessage | null;
  /** Build the session initialization payload sent when transport is ready */
  buildSessionUpdate(config: RealtimeSessionConfig): unknown;
  /** Build provider-specific messages for sending user text. Returns array of messages to send in order. */
  buildUserTextMessages?(text: string): unknown[];
  /** Build provider-specific message for canceling a response */
  buildCancelMessage?(): unknown;
}

// ─── Transport ───────────────────────────────────────────────────

export interface Transport {
  /** Start the transport: acquire audio, connect to remote */
  start(config: TransportStartConfig): Promise<void>;
  /** Send a JSON message to the remote side */
  sendMessage(message: unknown): void;
  /** Stop and clean up all resources */
  stop(): void;
  /** Whether the transport is ready to send/receive */
  isReady(): boolean;
}

export interface TransportStartConfig {
  sessionConfig: RealtimeSessionConfig;
  callbacks: TransportCallbacks;
}

export interface TransportCallbacks {
  onStateChange: (state: 'requesting_mic' | 'authenticating' | 'connecting' | 'connected') => void;
  onMessage: (data: unknown) => void;
  onReady: () => void;
  onConnectionLost: () => void;
  onVolume?: (level: number) => void;
  onError: (error: Error, fatal: boolean) => void;
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
  /** Timeout in ms for network requests (token fetch, SDP exchange). Default: 15000 */
  timeout?: number;
  /** Max conversation messages to keep in memory. Oldest are pruned. Default: 200 */
  maxMessages?: number;
  /** Auto-reconnect on connection loss. Default: true */
  autoReconnect?: boolean;
  /** Max reconnection attempts. Default: 3 */
  maxReconnectAttempts?: number;
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
