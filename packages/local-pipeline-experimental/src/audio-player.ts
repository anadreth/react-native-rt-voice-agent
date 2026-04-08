import { decodeBase64, encodeBase64 } from './base64';

export interface AudioPlayerConfig {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

export interface AudioPlayer {
  enqueue(base64Audio: string): void;
  flush(): void;
  destroy(): void;
}

const DEFAULT_CONFIG: Required<AudioPlayerConfig> = {
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
};

export function createAudioPlayer(config?: AudioPlayerConfig): AudioPlayer {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  const queue: string[] = [];
  let playing = false;
  let destroyed = false;
  let currentSound: any = null;
  let expoAv: any = null;

  try {
    expoAv = require('expo-av');
  } catch {
    expoAv = null;
  }

  async function playNext(): Promise<void> {
    if (destroyed || playing || queue.length === 0) return;

    playing = true;
    const chunk = queue.shift()!;

    try {
      if (expoAv) {
        const wavBase64 = createWavBase64(chunk, resolved);
        const { sound } = await expoAv.Audio.Sound.createAsync(
          { uri: `data:audio/wav;base64,${wavBase64}` },
          { shouldPlay: true },
        );
        currentSound = sound;
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if (status.didJustFinish) {
              resolve();
            }
          });
        });
        await sound.unloadAsync();
        currentSound = null;
      }
    } finally {
      playing = false;
      if (!destroyed && queue.length > 0) {
        void playNext();
      }
    }
  }

  return {
    enqueue(base64Audio: string): void {
      if (destroyed) return;
      queue.push(base64Audio);
      if (!playing) {
        void playNext();
      }
    },

    flush(): void {
      queue.length = 0;
      if (currentSound) {
        void currentSound.stopAsync?.();
        void currentSound.unloadAsync?.();
      }
      currentSound = null;
      playing = false;
    },

    destroy(): void {
      destroyed = true;
      this.flush();
    },
  };
}

function createWavBase64(
  pcmBase64: string,
  config: Required<AudioPlayerConfig>,
): string {
  const pcmBytes = decodeBase64(pcmBase64);
  const byteRate = config.sampleRate * config.channels * (config.bitsPerSample / 8);
  const blockAlign = config.channels * (config.bitsPerSample / 8);

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, config.channels, true);
  view.setUint32(24, config.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, config.bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  const combined = new Uint8Array(44 + pcmBytes.length);
  combined.set(new Uint8Array(header), 0);
  combined.set(pcmBytes, 44);
  return encodeBase64(combined);
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
