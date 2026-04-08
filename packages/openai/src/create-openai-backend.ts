import type { BackendConnectParams, RealtimeBackend } from '@rtva/core';
import { createOpenAISessionClient } from './auth/openai-session-client';
import { buildOpenAISessionInit, decodeOpenAIMessage, encodeOpenAICommand } from './protocol/openai-codec';
import { ReactNativeWebRTCTransport } from './transport/react-native-webrtc-transport';
import type { OpenAIBackendConfig } from './types';

export function createOpenAIBackend(config: OpenAIBackendConfig): RealtimeBackend {
  return {
    id: 'openai',
    capabilities: {
      audioInput: true,
      audioOutput: true,
      textInput: true,
      toolCalls: true,
      interruptions: true,
      autoReconnect: true,
    },

    async connect(params: BackendConnectParams) {
      const client = createOpenAISessionClient(config);
      const transport = new ReactNativeWebRTCTransport(params.logger);

      try {
        const [token, iceServers] = await Promise.all([
          client.getToken(params.signal),
          client.getIceServers(params.signal),
        ]);

        await transport.connect({
          endpoint: client.getRealtimeEndpoint(),
          token,
          iceServers,
          signal: params.signal,
          sessionMessages: buildOpenAISessionInit(config, params.tools),
          onMessage: (raw) => {
            const signal = decodeOpenAIMessage(raw as Record<string, unknown>);
            if (signal) {
              params.emit(signal);
            }
          },
          onConnectionLost: () => params.emit({ type: 'connection_lost' }),
          onVolume: (level) => params.emit({ type: 'volume_changed', level }),
        });

        params.emit({ type: 'connected' });

        return {
          isReady: () => transport.isReady(),
          send: (command: Parameters<typeof encodeOpenAICommand>[0]) => {
            for (const message of encodeOpenAICommand(command)) {
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
