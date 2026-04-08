export type SessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'stopped';

export type ErrorCode =
  | 'permission_denied'
  | 'auth_failed'
  | 'transport_failed'
  | 'protocol_error'
  | 'tool_failed'
  | 'invalid_state'
  | 'internal_error';

export interface LoggerInterface {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isFinal: boolean;
  status?: 'speaking' | 'processing' | 'final';
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  timeoutMs?: number;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface BackendCapabilities {
  audioInput: boolean;
  audioOutput: boolean;
  textInput: boolean;
  toolCalls: boolean;
  interruptions: boolean;
  autoReconnect: boolean;
}

export type SessionCommand =
  | { type: 'send_text'; text: string }
  | { type: 'cancel_response' }
  | { type: 'tool_result'; callId: string; name: string; result: unknown };

export type BackendSignal =
  | { type: 'connected' }
  | { type: 'connection_lost' }
  | { type: 'error'; error: Error; fatal: boolean }
  | { type: 'user_speech_started' }
  | { type: 'user_speech_stopped' }
  | { type: 'user_transcript_partial'; text: string }
  | { type: 'user_transcript_final'; text: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_done'; text?: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown>; callId: string }
  | { type: 'volume_changed'; level: number };

export interface LifecycleCallbacks {
  onBackground(): void;
  onForeground(): void;
}

export interface LifecycleAdapter {
  start(callbacks: LifecycleCallbacks): void;
  stop(): void;
}

export interface BackendConnectParams {
  signal: AbortSignal;
  emit: (signal: BackendSignal) => void;
  logger: LoggerInterface;
  tools: ReadonlyArray<ToolDefinition>;
}

export interface BackendConnection {
  isReady(): boolean;
  send(command: SessionCommand): void;
  close(): Promise<void> | void;
}

export interface RealtimeBackend {
  readonly id: string;
  readonly capabilities: BackendCapabilities;
  connect(params: BackendConnectParams): Promise<BackendConnection>;
}

export interface ReconnectPolicy {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RealtimeSessionConfig {
  backend: RealtimeBackend;
  tools?: ToolDefinition[];
  lifecycle?: LifecycleAdapter;
  maxMessages?: number;
  reconnectPolicy?: ReconnectPolicy;
  initialUserText?: string;
  logger?: LoggerInterface;
}

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
  | { type: 'error'; error: Error; fatal: boolean; code?: ErrorCode };
