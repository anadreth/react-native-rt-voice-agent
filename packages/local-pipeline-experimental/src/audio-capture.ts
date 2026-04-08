import { decodeBase64 } from './base64';

export interface AudioCaptureConfig {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  bufferSize?: number;
  audioSource?: number;
}

export interface AudioCaptureCallbacks {
  onAudioData(base64Data: string): void;
  onVolume?(level: number): void;
}

const DEFAULT_CONFIG: Required<AudioCaptureConfig> = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  bufferSize: 4096,
  audioSource: 6,
};

export function computeVolumeFromBase64(base64Data: string): number {
  try {
    const bytes = decodeBase64(base64Data);
    const view = new DataView(bytes.buffer);
    const sampleCount = Math.floor(bytes.length / 2);
    if (sampleCount === 0) return 0;

    let sumSquares = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = view.getInt16(index * 2, true);
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / sampleCount);
  } catch {
    return 0;
  }
}

export class AudioCapture {
  private liveAudioStream: any = null;
  private callbacks: AudioCaptureCallbacks | null = null;
  private running = false;
  private readonly config: Required<AudioCaptureConfig>;

  constructor(config?: AudioCaptureConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(callbacks: AudioCaptureCallbacks): Promise<void> {
    this.callbacks = callbacks;

    try {
      const module = require('react-native-live-audio-stream');
      this.liveAudioStream = module.default ?? module;
    } catch {
      throw new Error(
        'react-native-live-audio-stream is required for the local pipeline transport',
      );
    }

    this.liveAudioStream.init(this.config);
    this.liveAudioStream.on('data', (base64Data: string) => {
      if (!this.running) return;
      this.callbacks?.onAudioData(base64Data);
      if (this.callbacks?.onVolume) {
        this.callbacks.onVolume(computeVolumeFromBase64(base64Data));
      }
    });

    this.liveAudioStream.start();
    this.running = true;
  }

  stop(): void {
    if (this.running && this.liveAudioStream) {
      this.liveAudioStream.stop();
    }
    this.running = false;
    this.callbacks = null;
  }
}
