import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  RealtimeSessionConfig,
  SessionState,
  ConversationMessage,
} from '../core/types';
import { RealtimeSession } from '../core/realtime-session';

export interface UseRealtimeVoiceReturn {
  /** Current session state */
  state: SessionState;
  /** Conversation messages (updated in real-time) */
  messages: ConversationMessage[];
  /** Current mic volume level (0-1) */
  currentVolume: number;
  /** Start the voice session */
  start: () => Promise<void>;
  /** Stop the voice session */
  stop: () => void;
  /** Send a text message */
  sendText: (text: string) => void;
  /** Cancel the current assistant response */
  cancelResponse: () => void;
  /** Toggle session on/off */
  toggleSession: () => void;
}

/**
 * React hook for managing a realtime voice session.
 *
 * @example
 * ```tsx
 * import { useRealtimeVoice, openAIProvider } from 'react-native-rt-voice-agent';
 *
 * function VoiceScreen() {
 *   const { state, messages, start, stop } = useRealtimeVoice({
 *     voice: 'alloy',
 *     provider: openAIProvider({ tokenUrl: 'https://myapi.com/token' }),
 *     onEvent: (e) => console.log(e.type),
 *   });
 *
 *   return <Button onPress={state === 'connected' ? stop : start} />;
 * }
 * ```
 */
export function useRealtimeVoice(config: RealtimeSessionConfig): UseRealtimeVoiceReturn {
  const [state, setState] = useState<SessionState>('idle');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentVolume, setCurrentVolume] = useState(0);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Create session on mount
  useEffect(() => {
    const session = new RealtimeSession({
      ...configRef.current,
      onEvent: (event) => {
        // Route state changes to React state
        if (event.type === 'state.changed') {
          setState(event.state);
        }
        // Route conversation updates to React state
        if (event.type === 'conversation.updated') {
          setMessages(event.messages);
        }
        if (event.type === 'volume.changed') {
          setCurrentVolume(event.level);
        }
        // Forward to user's callback
        configRef.current.onEvent?.(event);
      },
    });
    sessionRef.current = session;

    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, []); // Stable — config changes handled via ref

  const start = useCallback(async () => {
    await sessionRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    setMessages([]);
    setCurrentVolume(0);
  }, []);

  const sendText = useCallback((text: string) => {
    sessionRef.current?.sendText(text);
  }, []);

  const cancelResponse = useCallback(() => {
    sessionRef.current?.cancelResponse();
  }, []);

  const toggleSession = useCallback(() => {
    if (state === 'connected') {
      stop();
    } else if (state === 'idle' || state === 'stopped' || state === 'error') {
      start();
    }
  }, [state, start, stop]);

  return {
    state,
    messages,
    currentVolume,
    start,
    stop,
    sendText,
    cancelResponse,
    toggleSession,
  };
}
