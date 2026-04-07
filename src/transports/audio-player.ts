/**
 * Audio playback abstraction for WebSocket-based transports.
 * Receives PCM audio chunks from the server (TTS output) and plays them.
 *
 * Uses expo-av or react-native-audio-api depending on what's available.
 * Falls back to a no-op player if neither is installed (text-only mode).
 */

export interface AudioPlayerConfig {
  /** Sample rate of incoming audio. Default: 24000 */
  sampleRate?: number;
  /** Number of channels. Default: 1 */
  channels?: number;
  /** Bits per sample. Default: 16 */
  bitsPerSample?: number;
}

export interface AudioPlayer {
  /** Queue a base64-encoded PCM audio chunk for playback */
  enqueue(base64Audio: string): void;
  /** Stop playback and clear the queue */
  flush(): void;
  /** Clean up resources */
  destroy(): void;
}

const DEFAULT_CONFIG: Required<AudioPlayerConfig> = {
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
};

/**
 * Creates an AudioPlayer that buffers PCM chunks and plays them sequentially.
 *
 * Current implementation: buffers audio and writes WAV files for expo-av playback.
 * This is a basic implementation — can be swapped for a lower-latency approach
 * using react-native-audio-api (Web Audio API polyfill) when available.
 */
export function createAudioPlayer(config?: AudioPlayerConfig): AudioPlayer {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const queue: string[] = [];
  let playing = false;
  let destroyed = false;
  let expoAv: any = null;
  let currentSound: any = null;

  // Try to load expo-av lazily
  try {
    expoAv = require('expo-av');
  } catch {
    // expo-av not available — try react-native-sound or fall back to no-op
  }

  async function playNext(): Promise<void> {
    if (destroyed || playing || queue.length === 0) return;

    playing = true;
    const base64Audio = queue.shift()!;

    try {
      if (expoAv) {
        // Create a WAV from the PCM data and play it
        const wavBase64 = createWavBase64(base64Audio, cfg);
        const { Sound } = expoAv.Audio;
        const { sound } = await Sound.createAsync(
          { uri: `data:audio/wav;base64,${wavBase64}` },
          { shouldPlay: true },
        );
        currentSound = sound;

        // Wait for playback to finish
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
      // If no audio library available, just skip (text-only mode)
    } catch {
      // Playback error — skip this chunk
    }

    playing = false;

    // Play next queued chunk
    if (!destroyed && queue.length > 0) {
      playNext();
    }
  }

  return {
    enqueue(base64Audio: string): void {
      if (destroyed) return;
      queue.push(base64Audio);
      if (!playing) {
        playNext();
      }
    },

    flush(): void {
      queue.length = 0;
      if (currentSound) {
        try {
          currentSound.stopAsync();
          currentSound.unloadAsync();
        } catch {
          // Ignore cleanup errors
        }
        currentSound = null;
      }
      playing = false;
    },

    destroy(): void {
      destroyed = true;
      this.flush();
    },
  };
}

/**
 * Wrap raw PCM data in a WAV header.
 * Input: base64-encoded PCM data
 * Output: base64-encoded WAV file
 */
function createWavBase64(
  pcmBase64: string,
  config: Required<AudioPlayerConfig>,
): string {
  const pcmBinary = atob(pcmBase64);
  const pcmLength = pcmBinary.length;
  const byteRate = config.sampleRate * config.channels * (config.bitsPerSample / 8);
  const blockAlign = config.channels * (config.bitsPerSample / 8);

  // WAV header is 44 bytes
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, config.channels, true);
  view.setUint32(24, config.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, config.bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmLength, true);

  // Combine header + PCM data
  const headerBytes = new Uint8Array(header);
  const combined = new Uint8Array(44 + pcmLength);
  combined.set(headerBytes, 0);
  for (let i = 0; i < pcmLength; i++) {
    combined[i + 44] = pcmBinary.charCodeAt(i);
  }

  // Convert to base64
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
