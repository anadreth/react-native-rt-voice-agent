import type {
  Transport,
  TransportStartConfig,
  TransportCallbacks,
  RealtimeSessionConfig,
  LoggerInterface,
} from '../core/types';
import { ConnectionError } from '../core/errors';
import { createLogger } from '../core/logger';
import { AudioCapture, type AudioCaptureConfig } from './audio-capture';
import { createAudioPlayer, type AudioPlayer, type AudioPlayerConfig } from './audio-player';

export interface WebSocketTransportConfig {
  /** WebSocket URL to connect to (e.g., ws://localhost:8080/ws) */
  serverUrl: string;
  /** Audio capture config for microphone input */
  audioCaptureConfig?: AudioCaptureConfig;
  /** Audio playback config for TTS output */
  audioPlayerConfig?: AudioPlayerConfig;
  /** Whether to send audio as base64 in JSON (true) or as binary frames (false). Default: true */
  sendAudioAsJson?: boolean;
  /** The JSON key to use when sending audio. Default: 'audio' */
  audioMessageKey?: string;
  /** The JSON type field value when sending audio. Default: 'audio.input' */
  audioMessageType?: string;
  /** Connection timeout in ms. Default: 10000 */
  timeout?: number;
}

/**
 * WebSocket transport for local voice pipeline servers.
 *
 * Connects to a local server (e.g., Pipecat, RealtimeVoiceChat) over WebSocket.
 * Captures microphone audio via react-native-live-audio-stream,
 * sends PCM chunks to the server, and receives JSON messages + audio back.
 *
 * No dependency on react-native-webrtc.
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private audioCapture: AudioCapture | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private logger: LoggerInterface;
  private callbacks: TransportCallbacks | null = null;
  private config: RealtimeSessionConfig | null = null;
  private transportConfig: WebSocketTransportConfig;
  private ready = false;

  constructor(transportConfig: WebSocketTransportConfig, logger?: LoggerInterface) {
    this.transportConfig = transportConfig;
    this.logger = createLogger(logger);
  }

  async start(startConfig: TransportStartConfig): Promise<void> {
    this.callbacks = startConfig.callbacks;
    this.config = startConfig.sessionConfig;

    // Step 1: Request microphone access
    this.callbacks.onStateChange('requesting_mic');
    this.logger.info('Starting audio capture');

    this.audioCapture = new AudioCapture(this.transportConfig.audioCaptureConfig);

    try {
      await this.audioCapture.start({
        onAudioData: (base64Data) => this.sendAudio(base64Data),
        onVolume: this.callbacks.onVolume
          ? (level) => this.callbacks?.onVolume?.(level)
          : undefined,
      });
      this.logger.info('Audio capture started');
    } catch (err) {
      throw new ConnectionError(
        `Audio capture failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }

    // Step 2: Connect WebSocket (skip authenticating — no token needed for local)
    this.callbacks.onStateChange('connecting');
    this.logger.info(`Connecting to ${this.transportConfig.serverUrl}`);

    await this.connectWebSocket();

    // Step 3: Create audio player for TTS output
    this.audioPlayer = createAudioPlayer(this.transportConfig.audioPlayerConfig);

    this.logger.info('WebSocket transport established');
  }

  sendMessage(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('Cannot send message: WebSocket not open');
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send WebSocket message', error);
    }
  }

  stop(): void {
    this.logger.info('Stopping WebSocket transport');
    this.ready = false;

    this.audioCapture?.stop();
    this.audioCapture = null;

    this.audioPlayer?.destroy();
    this.audioPlayer = null;

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client stopped');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.callbacks = null;
    this.config = null;
    this.logger.info('WebSocket transport cleanup complete');
  }

  isReady(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Queue audio for playback (called by provider's message handler) */
  playAudio(base64Audio: string): void {
    this.audioPlayer?.enqueue(base64Audio);
  }

  /** Flush audio playback queue (e.g., on interruption) */
  flushAudio(): void {
    this.audioPlayer?.flush();
  }

  private sendAudio(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const sendAsJson = this.transportConfig.sendAudioAsJson ?? true;

    if (sendAsJson) {
      const type = this.transportConfig.audioMessageType ?? 'audio.input';
      const key = this.transportConfig.audioMessageKey ?? 'audio';
      this.ws.send(JSON.stringify({ type, [key]: base64Data }));
    } else {
      // Send raw binary — decode base64 to ArrayBuffer
      try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        this.ws.send(bytes.buffer);
      } catch (err) {
        this.logger.error('Failed to send binary audio', err);
      }
    }
  }

  private connectWebSocket(): Promise<void> {
    const timeoutMs = this.transportConfig.timeout ?? 10_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectionError(`WebSocket connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.transportConfig.serverUrl);
      } catch (err) {
        clearTimeout(timer);
        reject(new ConnectionError(
          `Failed to create WebSocket: ${err instanceof Error ? err.message : 'Unknown error'}`
        ));
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timer);
        this.logger.info('WebSocket connected');
        this.ready = true;

        // Send session config
        const sessionUpdate = this.config!.provider.buildSessionUpdate(this.config!);
        this.sendMessage(sessionUpdate);

        // Send initial message if provided
        if (this.config!.initialMessage) {
          const provider = this.config!.provider;
          if (provider.buildUserTextMessages) {
            const messages = provider.buildUserTextMessages(this.config!.initialMessage);
            for (const msg of messages) {
              this.sendMessage(msg);
            }
          }
        }

        this.callbacks?.onReady();
        this.callbacks?.onStateChange('connected');
        resolve();
      };

      this.ws.onmessage = (event: any) => {
        try {
          const raw = event.data ?? event;
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          this.callbacks?.onMessage(data);
        } catch (err) {
          this.logger.error('Failed to parse WebSocket message', err);
        }
      };

      this.ws.onerror = (event: any) => {
        this.logger.error('WebSocket error', event);
        if (!this.ready) {
          clearTimeout(timer);
          reject(new ConnectionError('WebSocket connection failed'));
        } else {
          this.callbacks?.onError(
            new ConnectionError('WebSocket error'),
            false,
          );
        }
      };

      this.ws.onclose = (event: any) => {
        const code = event?.code ?? 0;
        const reason = event?.reason ?? '';
        const wasClean = event?.wasClean ?? false;
        this.logger.info(`WebSocket closed: code=${code} reason=${reason}`);
        this.ready = false;

        if (!wasClean && this.callbacks) {
          this.callbacks.onConnectionLost();
        }
      };
    });
  }
}
