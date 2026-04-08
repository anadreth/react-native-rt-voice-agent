import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@rtva/core';
import { useRealtimeSession } from '../use-realtime-session';

class MockSession {
  private handlers = new Map<string, Set<(event: any) => void>>();

  start = vi.fn(async () => {});
  stop = vi.fn(() => {});
  sendText = vi.fn((_: string) => {});
  cancelResponse = vi.fn(() => {});

  constructor(
    private state: any = 'idle',
    private messages: any[] = [],
    private volume = 0,
  ) {}

  getState() {
    return this.state;
  }

  getMessages() {
    return this.messages;
  }

  getCurrentVolume() {
    return this.volume;
  }

  on(type: string, handler: (event: RealtimeEvent) => void) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  emit(event: RealtimeEvent) {
    if (event.type === 'state.changed') {
      this.state = event.state;
    }
    if (event.type === 'conversation.updated') {
      this.messages = event.messages;
    }
    if (event.type === 'volume.changed') {
      this.volume = event.level;
    }
    this.handlers.get(event.type)?.forEach((handler) => handler(event));
  }
}

describe('useRealtimeSession', () => {
  it('mirrors session state and events', () => {
    const session = new MockSession() as any;
    const { result } = renderHook(() => useRealtimeSession(session));

    act(() => {
      session.emit({ type: 'state.changed', state: 'connected', previousState: 'idle' });
      session.emit({
        type: 'conversation.updated',
        messages: [{ id: '1', role: 'assistant', text: 'hello', timestamp: '', isFinal: true }],
      });
      session.emit({ type: 'volume.changed', level: 0.5 });
    });

    expect(result.current.state).toBe('connected');
    expect(result.current.messages[0].text).toBe('hello');
    expect(result.current.currentVolume).toBe(0.5);
  });

  it('cleans up subscriptions on unmount', () => {
    const session = new MockSession() as any;
    const unsubscribe = vi.spyOn(session, 'on');
    const { unmount } = renderHook(() => useRealtimeSession(session));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(3);
  });

  it('forwards commands to the session', async () => {
    const session = new MockSession() as any;
    const { result } = renderHook(() => useRealtimeSession(session));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.sendText('test');
      result.current.cancelResponse();
      result.current.stop();
    });

    expect(session.start).toHaveBeenCalled();
    expect(session.sendText).toHaveBeenCalledWith('test');
    expect(session.cancelResponse).toHaveBeenCalled();
    expect(session.stop).toHaveBeenCalled();
  });
});
