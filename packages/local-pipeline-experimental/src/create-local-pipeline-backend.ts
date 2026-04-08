import type { BackendConnectParams, RealtimeBackend } from '@rtva/core';
import { buildPipecatInitMessages, decodePipecatMessage, encodePipecatCommand, extractPipecatAudioPayload } from './protocol/pipecat-codec';
import { LocalWebSocketTransport } from './transport/websocket-transport';
import type { LocalPipelineBackendConfig } from './types';

export function createLocalPipelineBackend(
  config: LocalPipelineBackendConfig,
): RealtimeBackend {
  const decoder = config.serverFramework === 'custom'
    ? config.customDecoder
    : decodePipecatMessage;

  const audioExtractor = config.serverFramework === 'custom'
    ? config.customAudioExtractor
    : extractPipecatAudioPayload;

  if (!decoder) {
    throw new Error('customDecoder is required when serverFramework is "custom"');
  }

  return {
    id: 'local-pipeline-experimental',
    capabilities: {
      audioInput: true,
      audioOutput: true,
      textInput: true,
      toolCalls: true,
      interruptions: true,
      autoReconnect: true,
    },

    async connect(params: BackendConnectParams) {
      const transport = new LocalWebSocketTransport({
        serverUrl: config.serverUrl,
        audioCaptureConfig: {
          sampleRate: config.audio?.sampleRate ?? 16000,
          bufferSize: config.audio?.bufferSize ?? 4096,
          channels: 1,
          bitsPerSample: 16,
        },
        audioPlayerConfig: {
          sampleRate: config.playback?.sampleRate ?? 24000,
          channels: 1,
          bitsPerSample: 16,
        },
        sendAudioAsJson: config.sendAudioAsJson ?? true,
        timeout: config.timeout ?? 10_000,
      }, params.logger);

      try {
        await transport.connect({
          signal: params.signal,
          initMessages: buildPipecatInitMessages(params.tools),
          onMessage: (raw) => {
            if (!raw || typeof raw !== 'object') return;
            const signal = decoder(raw as Record<string, unknown>);
            if (signal) {
              params.emit(signal);
            }
          },
          onConnectionLost: () => params.emit({ type: 'connection_lost' }),
          onVolume: (level) => params.emit({ type: 'volume_changed', level }),
          extractAudioPayload: (raw) => audioExtractor?.(raw) ?? null,
        });

        params.emit({ type: 'connected' });

        return {
          isReady: () => transport.isReady(),
          send: (command: Parameters<typeof encodePipecatCommand>[0]) => {
            for (const message of encodePipecatCommand(command)) {
              transport.sendRaw(message);
            }
          },
          close: () => transport.close(),
        };
      } catch (error) {
        await transport.close();
        throw error;
      }
    },
  };
}
