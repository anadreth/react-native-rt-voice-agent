import type { BackendSignal, SessionCommand, ToolDefinition } from '@rtva/core';

export function buildPipecatInitMessages(_tools: ReadonlyArray<ToolDefinition>): unknown[] {
  return [{
    type: 'client-ready',
    data: {
      version: '0.2.0',
      about: {
        library: '@rtva/local-pipeline-experimental',
        platform: 'react-native',
      },
    },
  }];
}

export function encodePipecatCommand(command: SessionCommand): unknown[] {
  switch (command.type) {
    case 'send_text':
      return [{
        type: 'send-text',
        data: {
          content: command.text,
          options: {
            run_immediately: true,
            audio_response: true,
          },
        },
      }];

    case 'cancel_response':
      return [{
        type: 'client-message',
        data: {
          t: 'cancel-response',
        },
      }];

    case 'tool_result':
      return [{
        type: 'tool-result',
        data: {
          tool_call_id: command.callId,
          function_name: command.name,
          result: command.result,
        },
      }];
  }

  return [];
}

export function decodePipecatMessage(raw: Record<string, unknown>): BackendSignal | null {
  const type = raw.type as string;
  const data = (raw.data ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'user-started-speaking':
      return { type: 'user_speech_started' };

    case 'user-stopped-speaking':
      return { type: 'user_speech_stopped' };

    case 'user-transcription':
      return {
        type: data.final === true ? 'user_transcript_final' : 'user_transcript_partial',
        text: (data.text as string) ?? '',
      };

    case 'bot-llm-text':
    case 'bot-tts-text':
      return {
        type: 'assistant_delta',
        text: (data.text as string) ?? '',
      };

    case 'bot-output':
      return {
        type: 'assistant_done',
        text: (data.text as string) ?? '',
      };

    case 'bot-stopped-speaking':
      return { type: 'assistant_done' };

    case 'llm-function-call-in-progress':
    case 'llm-function-call':
      return {
        type: 'tool_call',
        name: ((data.function_name ?? data.name) as string) ?? '',
        callId: ((data.tool_call_id ?? data.call_id) as string) ?? '',
        args: ((data.arguments ?? data.args) as Record<string, unknown>) ?? {},
      };

    case 'error':
      return {
        type: 'error',
        error: new Error((data.message as string) ?? 'Unknown local pipeline error'),
        fatal: false,
      };

    default:
      return null;
  }
}

export function extractPipecatAudioPayload(raw: Record<string, unknown>): string | null {
  const data = (raw.data ?? {}) as Record<string, unknown>;

  if (typeof raw.audio === 'string') {
    return raw.audio;
  }

  if (typeof data.audio === 'string') {
    return data.audio;
  }

  if (typeof data.base64Audio === 'string') {
    return data.base64Audio;
  }

  if (raw.type === 'bot-tts-audio' && typeof data.payload === 'string') {
    return data.payload;
  }

  return null;
}
