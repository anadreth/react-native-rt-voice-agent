// ─── Core ─────────────────────────────────────────────────────────
export { RealtimeSession } from './core/realtime-session';
export { ToolRegistry } from './core/tool-registry';
export { ConversationManager } from './core/conversation-manager';

// ─── React ────────────────────────────────────────────────────────
export { useRealtimeVoice } from './react/use-realtime-voice';
export type { UseRealtimeVoiceReturn } from './react/use-realtime-voice';

// ─── Providers ────────────────────────────────────────────────────
export { openAIProvider } from './providers/openai/openai-provider';
export type { OpenAIProviderConfig } from './providers/openai/openai-provider';

// ─── Types ────────────────────────────────────────────────────────
export type {
  SessionState,
  ConversationMessage,
  RealtimeEvent,
  RealtimeSessionConfig,
  ToolDefinition,
  RealtimeProvider,
  TokenRequestConfig,
  NormalizedMessage,
  LoggerInterface,
  RTCIceServer,
} from './core/types';

// ─── Errors ───────────────────────────────────────────────────────
export {
  RealtimeVoiceError,
  SessionError,
  ConnectionError,
  AuthError,
  ProviderError,
} from './core/errors';

// ─── Utilities ────────────────────────────────────────────────────
export { transition, canTransition } from './core/session-state';
export { createLogger } from './core/logger';
