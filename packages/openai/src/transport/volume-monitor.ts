import type { LoggerInterface } from '@rtva/core';

export class VolumeMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onVolume: (level: number) => void,
    private readonly logger: LoggerInterface,
    private readonly intervalMs = 100,
  ) {}

  start(peerConnection: { getStats(): Promise<Map<unknown, unknown>> }): void {
    this.stop();
    this.intervalId = setInterval(() => {
      void this.poll(peerConnection);
    }, this.intervalMs);
    this.logger.info('Volume monitoring started');
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private async poll(peerConnection: { getStats(): Promise<Map<unknown, unknown>> }): Promise<void> {
    try {
      const stats = await peerConnection.getStats();
      let audioLevel = 0;

      stats.forEach((report: any) => {
        if (report.type === 'media-source' && report.kind === 'audio') {
          audioLevel = report.audioLevel ?? 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio' && audioLevel === 0) {
          audioLevel = report.audioLevel ?? 0;
        }
      });

      this.onVolume(audioLevel);
    } catch {
      this.logger.warn('Failed to poll WebRTC stats for volume');
    }
  }
}
