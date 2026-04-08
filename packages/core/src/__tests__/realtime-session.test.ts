import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSession } from '../realtime-session';
import type {
  BackendConnectParams,
  LifecycleCallbacks,
  RealtimeBackend,
  RealtimeEvent,
  SessionCommand,
} from '../types';

class TestLifecycle {
  callbacks: LifecycleCallbacks | null = null;

  start(callbacks: LifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  stop(): void {
    this.callbacks = null;
  }
}

function createBackend(setup?: (params: BackendConnectParams) => void): RealtimeBackend {
  return {
    id: 'fake',
    capabilities: {
      audioInput: true,
      audioOutput: true,
      textInput: true,
      toolCalls: true,
      interruptions: true,
      autoReconnect: true,
    },
    async connect(params) {
      setup?.(params);
      params.emit({ type: 'connected' });
      return {
        isReady: () => true,
        send: vi.fn(),
        close: vi.fn(),
      };
    },
  };
}

describe('RealtimeSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and sends text through generic commands', async () => {
    const sent: SessionCommand[] = [];
    const backend: RealtimeBackend = {
      ...createBackend(),
      async connect(params) {
        params.emit({ type: 'connected' });
        return {
          isReady: () => true,
          send: (command) => {
            sent.push(command);
          },
          close: vi.fn(),
        };
      },
    };

    const session = new RealtimeSession({ backend, initialUserText: 'hello' });
    await session.start();

    expect(sent).toEqual([{ type: 'send_text', text: 'hello' }]);
    expect(session.getMessages()[0].text).toBe('hello');
  });

  it('routes interruptions through cancel_response', async () => {
    const sent: SessionCommand[] = [];
    let connectParams: BackendConnectParams | null = null;
    const backend: RealtimeBackend = {
      ...createBackend((params) => {
        connectParams = params;
      }),
      async connect(params) {
        connectParams = params;
        params.emit({ type: 'connected' });
        return {
          isReady: () => true,
          send: (command) => {
            sent.push(command);
          },
          close: vi.fn(),
        };
      },
    };

    const session = new RealtimeSession({ backend });
    await session.start();

    connectParams!.emit({ type: 'assistant_delta', text: 'Hello' });
    await connectParams!.emit({ type: 'user_speech_started' });

    expect(sent).toContainEqual({ type: 'cancel_response' });
  });

  it('executes tool calls and sends tool_result commands', async () => {
    const sent: SessionCommand[] = [];
    let connectParams: BackendConnectParams | null = null;
    const backend: RealtimeBackend = {
      ...createBackend(),
      async connect(params) {
        connectParams = params;
        params.emit({ type: 'connected' });
        return {
          isReady: () => true,
          send: (command) => {
            sent.push(command);
          },
          close: vi.fn(),
        };
      },
    };

    const session = new RealtimeSession({
      backend,
      tools: [
        {
          name: 'lookup',
          description: 'Looks up',
          handler: async (args) => ({ ok: args.q }),
        },
      ],
    });

    await session.start();
    await connectParams!.emit({
      type: 'tool_call',
      name: 'lookup',
      args: { q: 'x' },
      callId: 'call-1',
    });

    expect(sent).toContainEqual({
      type: 'tool_result',
      callId: 'call-1',
      name: 'lookup',
      result: { ok: 'x' },
    });
  });

  it('reconnects without clearing conversation history', async () => {
    let connectCount = 0;
    let currentParams: BackendConnectParams | null = null;

    const backend: RealtimeBackend = {
      id: 'fake',
      capabilities: {
        audioInput: true,
        audioOutput: true,
        textInput: true,
        toolCalls: true,
        interruptions: true,
        autoReconnect: true,
      },
      async connect(params) {
        connectCount += 1;
        currentParams = params;
        params.emit({ type: 'connected' });
        return {
          isReady: () => true,
          send: vi.fn(),
          close: vi.fn(),
        };
      },
    };

    const session = new RealtimeSession({ backend });
    await session.start();
    currentParams!.emit({ type: 'assistant_delta', text: 'Hello' });
    currentParams!.emit({ type: 'assistant_done' });
    currentParams!.emit({ type: 'connection_lost' });

    await vi.advanceTimersByTimeAsync(1000);

    expect(connectCount).toBe(2);
    expect(session.getMessages()[0].text).toBe('Hello');
  });

  it('preserves history across lifecycle pause and resume', async () => {
    const lifecycle = new TestLifecycle();
    let currentParams: BackendConnectParams | null = null;
    const backend: RealtimeBackend = {
      ...createBackend(),
      async connect(params) {
        currentParams = params;
        params.emit({ type: 'connected' });
        return {
          isReady: () => true,
          send: vi.fn(),
          close: vi.fn(),
        };
      },
    };

    const session = new RealtimeSession({ backend, lifecycle });
    await session.start();
    currentParams!.emit({ type: 'assistant_done', text: 'persist me' });

    lifecycle.callbacks?.onBackground();
    lifecycle.callbacks?.onForeground();

    await vi.runAllTimersAsync();

    expect(session.getMessages()[0].text).toBe('persist me');
  });

  it('emits cleanup error when start fails', async () => {
    const events: RealtimeEvent[] = [];
    const session = new RealtimeSession({
      backend: {
        id: 'bad',
        capabilities: {
          audioInput: true,
          audioOutput: true,
          textInput: true,
          toolCalls: false,
          interruptions: false,
          autoReconnect: false,
        },
        async connect() {
          throw new Error('boom');
        },
      },
    });

    session.on('*', (event) => events.push(event));
    await expect(session.start()).rejects.toThrow('boom');
    expect(events.some((event) => event.type === 'error')).toBe(true);
  });
});
