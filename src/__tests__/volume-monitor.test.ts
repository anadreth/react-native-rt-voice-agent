import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VolumeMonitor } from '../core/volume-monitor';

describe('Volume monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits volume levels from the peer connection', async () => {
    const onVolume = vi.fn();
    const monitor = new VolumeMonitor(onVolume, 100);

    const mockPc = {
      getStats: vi.fn(async () => {
        const stats = new Map();
        stats.set('audio-source', {
          type: 'media-source',
          kind: 'audio',
          audioLevel: 0.6,
        });
        return stats;
      }),
    };

    monitor.start(mockPc);

    // Advance past one interval tick and let async pollVolume resolve
    await vi.advanceTimersByTimeAsync(100);

    expect(onVolume).toHaveBeenCalledWith(0.6);

    monitor.stop();
  });

  it('stops emitting after stop() is called', async () => {
    const onVolume = vi.fn();
    const monitor = new VolumeMonitor(onVolume, 100);

    const mockPc = {
      getStats: vi.fn(async () => {
        const stats = new Map();
        stats.set('audio-source', {
          type: 'media-source',
          kind: 'audio',
          audioLevel: 0.5,
        });
        return stats;
      }),
    };

    monitor.start(mockPc);
    await vi.advanceTimersByTimeAsync(100);
    expect(onVolume).toHaveBeenCalled();

    onVolume.mockClear();
    monitor.stop();

    await vi.advanceTimersByTimeAsync(500);
    expect(onVolume).not.toHaveBeenCalled();
  });

  it('does not self-destruct on start (regression: peerConnection was nulled)', async () => {
    const onVolume = vi.fn();
    const monitor = new VolumeMonitor(onVolume, 50);

    const mockPc = {
      getStats: vi.fn(async () => {
        const stats = new Map();
        stats.set('src', { type: 'media-source', kind: 'audio', audioLevel: 0.9 });
        return stats;
      }),
    };

    monitor.start(mockPc);

    // The old bug: start() called stop() which nulled peerConnection,
    // so pollVolume() would exit immediately
    await vi.advanceTimersByTimeAsync(50);

    expect(onVolume).toHaveBeenCalledWith(0.9);
    monitor.stop();
  });
});
