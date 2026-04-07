import type {
  RealtimeProvider,
  RealtimeSessionConfig,
  NormalizedMessage,
  LoggerInterface,
  Transport,
} from '../../core/types';
import { WebSocketTransport, type WebSocketTransportConfig } from '../../transports/websocket-transport';
import { mapPipecatMessage } from './pipecat-message-map';

export type ServerFramework = 'pipecat' | 'custom';

export interface LocalPipelineProviderConfig {
  /** WebSocket URL of the local pipeline server (e.g., ws://localhost:8080/ws) */
  serverUrl: string;
  /** Server framework for message format mapping. Default: 'pipecat' */
  serverFramework?: ServerFramework;
  /** Custom message mapper. Required when serverFramework is 'custom'. */
  customMessageMapper?: (raw: unknown) => NormalizedMessage | null;
  /** Audio capture config */
  audio?: {
    /** Sample rate for microphone capture. Default: 16000 */
    sampleRate?: number;
    /** Buffer size in bytes. Default: 4096 */
    bufferSize?: number;
  };
  /** Audio playback config */
  playback?: {
    /** Sample rate of server TTS audio. Default: 24000 */
    sampleRate?: number;
  };
  /** Whether to send audio as JSON (true) or binary (false). Default: true */
  sendAudioAsJson?: boolean;
  /** Connection timeout in ms. Default: 10000 */
  timeout?: number;
}

/**
 * Creates a local pipeline provider for STT → LLM → TTS servers.
 *
 * Designed for use with Pipecat, RealtimeVoiceChat, or any custom
 * WebSocket-based voice pipeline server.
 *
 * @example
 * ```ts
 * // With Pipecat server
 * const provider = localPipelineProvider({
 *   serverUrl: 'ws://localhost:8080/ws',
 * });
 *
 * // With custom server
 * const provider = localPipelineProvider({
 *   serverUrl: 'ws://my-server:3000/voice',
 *   serverFramework: 'custom',
 *   customMessageMapper: (raw) => {
 *     // Map your server's message format to NormalizedMessage
 *     return null;
 *   },
 * });
 * ```
 */
export function localPipelineProvider(
  config: LocalPipelineProviderConfig,
): RealtimeProvider {
  const framework = config.serverFramework ?? 'pipecat';

  const messageMapper = framework === 'custom'
    ? config.customMessageMapper
    : mapPipecatMessage;

  if (!messageMapper) {
    throw new Error(
      "localPipelineProvider: customMessageMapper is required when serverFramework is 'custom'"
    );
  }

  return {
    transportType: 'websocket',

    createTransport(logger?: LoggerInterface): Transport {
      const wsConfig: WebSocketTransportConfig = {
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
      };

      return new WebSocketTransport(wsConfig, logger);
    },

    mapMessage(raw: unknown): NormalizedMessage | null {
      if (typeof raw !== 'object' || raw === null) return null;
      return messageMapper(raw as Record<string, unknown>);
    },

    buildSessionUpdate(sessionConfig: RealtimeSessionConfig): unknown {
      // Send RTVI client-ready message
      const msg: Record<string, unknown> = {
        type: 'client-ready',
        data: {
          version: '0.2.0',
          about: {
            library: 'react-native-rt-voice-agent',
            platform: 'react-native',
          },
        },
      };

      return msg;
    },

    buildUserTextMessages(text: string): unknown[] {
      // RTVI send-text format
      return [
        {
          type: 'send-text',
          data: {
            content: text,
            options: {
              run_immediately: true,
              audio_response: true,
            },
          },
        },
      ];
    },

    buildCancelMessage(): unknown {
      // RTVI doesn't have a standard cancel — use client-message
      return {
        type: 'client-message',
        data: {
          t: 'cancel-response',
        },
      };
    },
  };
}
