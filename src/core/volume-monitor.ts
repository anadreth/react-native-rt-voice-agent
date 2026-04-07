import type { LoggerInterface } from './types';
import { createLogger } from './logger';

/**
 * Monitors microphone input volume by analyzing the audio track.
 * Emits volume levels (0-1) at a configurable interval.
 *
 * Note: Uses a polling approach on the audio track's stats since
 * react-native-webrtc doesn't expose Web Audio API (AudioContext/AnalyserNode).
 * Volume is derived from RTCPeerConnection.getStats() audioLevel.
 */
export class VolumeMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private peerConnection: any = null; // RTCPeerConnection
  private onVolume: (level: number) => void;
  private logger: LoggerInterface;
  private intervalMs: number;

  constructor(
    onVolume: (level: number) => void,
    intervalMs = 100,
    logger?: LoggerInterface,
  ) {
    this.onVolume = onVolume;
    this.intervalMs = intervalMs;
    this.logger = createLogger(logger);
  }

  start(peerConnection: unknown): void {
    // Clear any existing interval without nulling the peer connection
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.peerConnection = peerConnection;

    this.intervalId = setInterval(() => {
      this.pollVolume();
    }, this.intervalMs);

    this.logger.info('Volume monitoring started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.peerConnection = null;
  }

  private async pollVolume(): Promise<void> {
    if (!this.peerConnection) return;

    try {
      const stats = await this.peerConnection.getStats();
      let audioLevel = 0;

      stats.forEach((report: any) => {
        // Look for outbound audio stats (user's mic)
        if (report.type === 'media-source' && report.kind === 'audio') {
          audioLevel = report.audioLevel ?? 0;
        }
        // Fallback: inbound audio (assistant's voice)
        if (report.type === 'inbound-rtp' && report.kind === 'audio' && audioLevel === 0) {
          audioLevel = report.audioLevel ?? 0;
        }
      });

      this.onVolume(audioLevel);
    } catch {
      // Stats may fail during connection transitions — ignore silently
    }
  }
}
