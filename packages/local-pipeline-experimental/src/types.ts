import type { BackendSignal } from '@rtva/core';

export interface LocalPipelineBackendConfig {
  serverUrl: string;
  serverFramework?: 'pipecat' | 'custom';
  customDecoder?: (raw: Record<string, unknown>) => BackendSignal | null;
  customAudioExtractor?: (raw: Record<string, unknown>) => string | null;
  audio?: {
    sampleRate?: number;
    bufferSize?: number;
  };
  playback?: {
    sampleRate?: number;
  };
  sendAudioAsJson?: boolean;
  timeout?: number;
}
