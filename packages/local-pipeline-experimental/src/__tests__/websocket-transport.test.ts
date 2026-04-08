import type { LoggerInterface } from '@rtva/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPlayer } from '../audio-player';
import { LocalWebSocketTransport } from '../transport/websocket-transport';

class FakeAudioCapture {
  async start(): Promise<void> {}
  stop(): void {}
}

describe('LocalWebSocketTransport', () => {
  const logger: LoggerInterface = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  let socketInstance: any;

  beforeEach(() => {
    socketInstance = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };

    class MockWebSocket {
      readyState = socketInstance.readyState;
      send = socketInstance.send;
      close = socketInstance.close;
      onopen = socketInstance.onopen;
      onmessage = socketInstance.onmessage;
      onerror = socketInstance.onerror;
      onclose = socketInstance.onclose;

      constructor(_url: string) {
        return socketInstance;
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes inbound audio payloads to the audio player', async () => {
    const player: AudioPlayer = {
      enqueue: vi.fn(),
      flush: vi.fn(),
      destroy: vi.fn(),
    };

    const transport = new LocalWebSocketTransport({
      serverUrl: 'ws://localhost:8080',
      createAudioCapture: () => new FakeAudioCapture() as any,
      createAudioPlayer: () => player,
    }, logger);

    const connectPromise = transport.connect({
      signal: new AbortController().signal,
      initMessages: [],
      onMessage: vi.fn(),
      onConnectionLost: vi.fn(),
      onVolume: vi.fn(),
      extractAudioPayload: (raw) => (raw.data as any)?.audio ?? null,
    });

    await Promise.resolve();
    socketInstance.onopen();
    await connectPromise;

    socketInstance.onmessage({ data: JSON.stringify({ type: 'audio', data: { audio: 'chunk-1' } }) });

    expect(player.enqueue).toHaveBeenCalledWith('chunk-1');
  });
});
