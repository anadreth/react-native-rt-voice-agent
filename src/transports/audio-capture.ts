/**
 * Audio capture abstraction for WebSocket-based transports.
 * Wraps `react-native-live-audio-stream` to provide raw PCM audio buffers.
 *
 * This module is only used by WebSocket transport — WebRTC transport
 * uses react-native-webrtc's MediaStream instead.
 */

export interface AudioCaptureConfig {
  /** Sample rate in Hz. Default: 16000 (optimal for STT) */
  sampleRate?: number;
  /** Number of channels. Default: 1 (mono) */
  channels?: number;
  /** Bits per sample. Default: 16 */
  bitsPerSample?: number;
  /** Buffer size in bytes. Default: 4096 */
  bufferSize?: number;
  /** Android audio source. Default: 6 (VOICE_RECOGNITION) */
  audioSource?: number;
}

export interface AudioCaptureCallbacks {
  /** Called with base64-encoded PCM audio chunk */
  onAudioData: (base64Data: string) => void;
  /** Called with RMS volume level (0-1) computed from the audio buffer */
  onVolume?: (level: number) => void;
}

const DEFAULT_CONFIG: Required<AudioCaptureConfig> = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  bufferSize: 4096,
  audioSource: 6,
};

/**
 * Compute RMS volume (0-1) from a base64-encoded PCM16 audio buffer.
 */
export function computeVolumeFromBase64(base64Data: string): number {
  try {
    // Decode base64 to bytes
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Interpret as 16-bit signed PCM
    const view = new DataView(bytes.buffer);
    const sampleCount = Math.floor(bytes.length / 2);
    if (sampleCount === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = view.getInt16(i * 2, true); // little-endian
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / sampleCount);
  } catch {
    return 0;
  }
}

/**
 * AudioCapture wraps react-native-live-audio-stream.
 * Lazily imports the native module to avoid crashing when not installed.
 */
export class AudioCapture {
  private liveAudioStream: any = null;
  private callbacks: AudioCaptureCallbacks | null = null;
  private running = false;
  private config: Required<AudioCaptureConfig>;

  constructor(config?: AudioCaptureConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(callbacks: AudioCaptureCallbacks): Promise<void> {
    this.callbacks = callbacks;

    // Lazy import to avoid crash if not installed
    try {
      const mod = require('react-native-live-audio-stream');
      this.liveAudioStream = mod.default ?? mod;
    } catch {
      throw new Error(
        'react-native-live-audio-stream is required for WebSocket transport. ' +
        'Install it with: npm install react-native-live-audio-stream'
      );
    }

    this.liveAudioStream.init({
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      bitsPerSample: this.config.bitsPerSample,
      audioSource: this.config.audioSource,
      bufferSize: this.config.bufferSize,
    });

    this.liveAudioStream.on('data', (base64Data: string) => {
      if (!this.running) return;

      this.callbacks?.onAudioData(base64Data);

      // Compute volume if callback provided
      if (this.callbacks?.onVolume) {
        const level = computeVolumeFromBase64(base64Data);
        this.callbacks.onVolume(level);
      }
    });

    this.liveAudioStream.start();
    this.running = true;
  }

  stop(): void {
    if (this.running && this.liveAudioStream) {
      try {
        this.liveAudioStream.stop();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.running = false;
    this.callbacks = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): Required<AudioCaptureConfig> {
    return { ...this.config };
  }
}
