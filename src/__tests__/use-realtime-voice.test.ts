import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RealtimeSessionConfig, RealtimeEvent } from '../core/types';

// Capture the onEvent callback the hook passes to RealtimeSession
let capturedOnEvent: ((event: RealtimeEvent) => void) | null = null;

const mockStart = vi.fn(async () => {});
const mockStop = vi.fn();
const mockSendText = vi.fn();
const mockCancelResponse = vi.fn();
const mockDestroy = vi.fn();
const mockGetState = vi.fn(() => 'idle' as const);
const mockGetMessages = vi.fn(() => []);
const mockOn = vi.fn(() => vi.fn());

vi.mock('../core/realtime-session', () => ({
  RealtimeSession: class MockRealtimeSession {
    start = mockStart;
    stop = mockStop;
    sendText = mockSendText;
    cancelResponse = mockCancelResponse;
    destroy = mockDestroy;
    getState = mockGetState;
    getMessages = mockGetMessages;
    on = mockOn;

    constructor(config: RealtimeSessionConfig) {
      capturedOnEvent = config.onEvent ?? null;
    }
  },
}));

// Import after mock is set up
import { useRealtimeVoice } from '../react/use-realtime-voice';

const baseConfig: RealtimeSessionConfig = {
  provider: {
    transportType: 'webrtc',
    createTransport: () => ({
      start: async () => {},
      sendMessage: () => {},
      stop: () => {},
      isReady: () => true,
    }),
    mapMessage: () => null,
    buildSessionUpdate: () => ({}),
  },
};

describe('useRealtimeVoice hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnEvent = null;
  });

  it('starts in idle state with no messages', () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    expect(result.current.state).toBe('idle');
    expect(result.current.messages).toEqual([]);
    expect(result.current.currentVolume).toBe(0);
  });

  it('shows updated state when session state changes', () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    act(() => {
      capturedOnEvent!({ type: 'state.changed', state: 'connected' } as RealtimeEvent);
    });

    expect(result.current.state).toBe('connected');
  });

  it('shows new messages when conversation updates', () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    const mockMessages = [
      { id: '1', role: 'user' as const, text: 'hello', timestamp: new Date().toISOString(), isFinal: true, status: 'final' as const },
      { id: '2', role: 'assistant' as const, text: 'hi back', timestamp: new Date().toISOString(), isFinal: true, status: 'final' as const },
    ];

    act(() => {
      capturedOnEvent!({ type: 'conversation.updated', messages: mockMessages } as RealtimeEvent);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].text).toBe('hello');
    expect(result.current.messages[1].text).toBe('hi back');
  });

  it('shows volume level when audio is active', () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    act(() => {
      capturedOnEvent!({ type: 'volume.changed', level: 0.75 } as RealtimeEvent);
    });

    expect(result.current.currentVolume).toBe(0.75);
  });

  it('resets to clean state when session is stopped', () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    // Simulate some active state
    act(() => {
      capturedOnEvent!({ type: 'volume.changed', level: 0.5 } as RealtimeEvent);
      capturedOnEvent!({
        type: 'conversation.updated',
        messages: [{ id: '1', role: 'user', text: 'hi', timestamp: new Date().toISOString(), isFinal: true, status: 'final' }],
      } as RealtimeEvent);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.currentVolume).toBe(0.5);

    // Stop clears everything
    act(() => {
      result.current.stop();
    });

    expect(mockStop).toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
    expect(result.current.currentVolume).toBe(0);
  });

  it('toggles between starting and stopping', async () => {
    const { result } = renderHook(() => useRealtimeVoice(baseConfig));

    // From idle → starts
    await act(async () => {
      result.current.toggleSession();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);

    // Simulate connected state
    act(() => {
      capturedOnEvent!({ type: 'state.changed', state: 'connected' } as RealtimeEvent);
    });

    // From connected → stops
    act(() => {
      result.current.toggleSession();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('cleans up resources when component unmounts', () => {
    const { unmount } = renderHook(() => useRealtimeVoice(baseConfig));

    unmount();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('forwards events to consumer callback', () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeVoice({ ...baseConfig, onEvent }));

    act(() => {
      capturedOnEvent!({ type: 'state.changed', state: 'connecting' } as RealtimeEvent);
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'state.changed', state: 'connecting' })
    );
  });
});
