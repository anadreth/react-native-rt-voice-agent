import { ConnectionError, type LoggerInterface } from '@rtva/core';
import { AudioCapture, type AudioCaptureConfig } from '../audio-capture';
import { createAudioPlayer, type AudioPlayer, type AudioPlayerConfig } from '../audio-player';

export interface LocalWebSocketTransportConfig {
  serverUrl: string;
  audioCaptureConfig?: AudioCaptureConfig;
  audioPlayerConfig?: AudioPlayerConfig;
  sendAudioAsJson?: boolean;
  audioMessageKey?: string;
  audioMessageType?: string;
  timeout?: number;
  createAudioCapture?: (config?: AudioCaptureConfig) => AudioCapture;
  createAudioPlayer?: (config?: AudioPlayerConfig) => AudioPlayer;
}

export interface LocalWebSocketTransportConnectParams {
  signal: AbortSignal;
  initMessages: unknown[];
  onMessage(raw: unknown): void;
  onConnectionLost(): void;
  onVolume(level: number): void;
  extractAudioPayload(raw: Record<string, unknown>): string | null;
}

export class LocalWebSocketTransport {
  private ws: WebSocket | null = null;
  private audioCapture: AudioCapture | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private ready = false;

  constructor(
    private readonly config: LocalWebSocketTransportConfig,
    private readonly logger: LoggerInterface,
  ) {}

  async connect(params: LocalWebSocketTransportConnectParams): Promise<void> {
    this.audioCapture = (this.config.createAudioCapture ?? ((cfg) => new AudioCapture(cfg)))(this.config.audioCaptureConfig);
    this.audioPlayer = (this.config.createAudioPlayer ?? createAudioPlayer)(this.config.audioPlayerConfig);

    await this.audioCapture.start({
      onAudioData: (base64Data) => this.sendAudio(base64Data),
      onVolume: params.onVolume,
    });

    const timeoutMs = this.config.timeout ?? 10_000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectionError(`WebSocket connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const abort = () => {
        clearTimeout(timer);
        void this.close();
        reject(new ConnectionError('WebSocket connection aborted'));
      };

      params.signal.addEventListener('abort', abort);

      this.ws = new WebSocket(this.config.serverUrl);
      this.ws.onopen = () => {
        clearTimeout(timer);
        this.ready = true;
        for (const message of params.initMessages) {
          this.sendRaw(message);
        }
        resolve();
      };

      this.ws.onmessage = (event: any) => {
        const raw = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (raw && typeof raw === 'object') {
          const audioPayload = params.extractAudioPayload(raw as Record<string, unknown>);
          if (audioPayload) {
            this.audioPlayer?.enqueue(audioPayload);
          }
        }
        params.onMessage(raw);
      };

      this.ws.onerror = () => {
        clearTimeout(timer);
        if (!this.ready) {
          reject(new ConnectionError('WebSocket connection failed'));
        }
      };

      this.ws.onclose = (event: any) => {
        this.ready = false;
        if (!event?.wasClean) {
          params.onConnectionLost();
        }
      };
    }).catch(async (error) => {
      await this.close();
      throw error;
    });
  }

  isReady(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  sendRaw(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new ConnectionError('WebSocket is not open');
    }
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    this.ready = false;
    this.audioCapture?.stop();
    this.audioCapture = null;
    this.audioPlayer?.destroy();
    this.audioPlayer = null;

    if (this.ws) {
      this.ws.close(1000, 'Client stopped');
      this.ws = null;
    }
  }

  private sendAudio(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.config.sendAudioAsJson ?? true) {
      const type = this.config.audioMessageType ?? 'audio.input';
      const key = this.config.audioMessageKey ?? 'audio';
      this.ws.send(JSON.stringify({ type, [key]: base64Data }));
      return;
    }

    this.ws.send(base64Data);
  }
}
