import { useEffect, useState } from 'react';
import type { ConversationMessage, RealtimeEvent, RealtimeSession, SessionState } from '@rtva/core';

export interface UseRealtimeSessionReturn {
  state: SessionState;
  messages: ConversationMessage[];
  currentVolume: number;
  start(): Promise<void>;
  stop(): void;
  sendText(text: string): void;
  cancelResponse(): void;
  toggleSession(): void;
}

export function useRealtimeSession(session: RealtimeSession): UseRealtimeSessionReturn {
  const [state, setState] = useState<SessionState>(session.getState());
  const [messages, setMessages] = useState<ConversationMessage[]>(session.getMessages());
  const [currentVolume, setCurrentVolume] = useState(session.getCurrentVolume());

  useEffect(() => {
    setState(session.getState());
    setMessages(session.getMessages());
    setCurrentVolume(session.getCurrentVolume());

    const unsubscribeState = session.on('state.changed', (event: RealtimeEvent) => {
      const typedEvent = event as Extract<RealtimeEvent, { type: 'state.changed' }>;
      setState(typedEvent.state);
    });
    const unsubscribeConversation = session.on('conversation.updated', (event: RealtimeEvent) => {
      const typedEvent = event as Extract<RealtimeEvent, { type: 'conversation.updated' }>;
      setMessages(typedEvent.messages);
    });
    const unsubscribeVolume = session.on('volume.changed', (event: RealtimeEvent) => {
      const typedEvent = event as Extract<RealtimeEvent, { type: 'volume.changed' }>;
      setCurrentVolume(typedEvent.level);
    });

    return () => {
      unsubscribeState();
      unsubscribeConversation();
      unsubscribeVolume();
    };
  }, [session]);

  return {
    state,
    messages,
    currentVolume,
    start: () => session.start(),
    stop: () => session.stop(),
    sendText: (text: string) => session.sendText(text),
    cancelResponse: () => session.cancelResponse(),
    toggleSession: () => {
      if (state === 'connected') {
        session.stop();
        return;
      }

      if (state === 'idle' || state === 'stopped' || state === 'error') {
        void session.start();
      }
    },
  };
}
