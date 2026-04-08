import type { BackendSignal, SessionCommand, ToolDefinition } from '@rtva/core';
import type { OpenAIBackendConfig } from '../types';

function safeParseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

export function buildOpenAISessionInit(
  config: OpenAIBackendConfig,
  tools: ReadonlyArray<ToolDefinition>,
): unknown[] {
  return [{
    type: 'session.update',
    session: {
      modalities: config.session?.modalities ?? ['text', 'audio'],
      input_audio_transcription: {
        model: config.session?.transcriptionModel ?? 'gpt-4o-transcribe',
      },
      ...(config.session?.maxResponseTokens != null && {
        max_response_output_tokens: config.session.maxResponseTokens,
      }),
      ...(tools.length > 0 && {
        tools: tools.map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ?? { type: 'object', properties: {} },
        })),
      }),
    },
  }];
}

export function encodeOpenAICommand(command: SessionCommand): unknown[] {
  switch (command.type) {
    case 'send_text':
      return [
        {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: command.text }],
          },
        },
        { type: 'response.create' },
      ];

    case 'cancel_response':
      return [{ type: 'response.cancel' }];

    case 'tool_result':
      return [
        {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: command.callId,
            output: JSON.stringify(command.result),
          },
        },
        { type: 'response.create' },
      ];
  }

  return [];
}

export function decodeOpenAIMessage(raw: Record<string, unknown>): BackendSignal | null {
  const type = raw.type as string;

  switch (type) {
    case 'input_audio_buffer.speech_started':
      return { type: 'user_speech_started' };

    case 'input_audio_buffer.speech_stopped':
      return { type: 'user_speech_stopped' };

    case 'conversation.item.input_audio_transcription':
      return {
        type: 'user_transcript_partial',
        text: (raw.transcript ?? raw.text ?? '') as string,
      };

    case 'conversation.item.input_audio_transcription.completed':
      return {
        type: 'user_transcript_final',
        text: (raw.transcript ?? '') as string,
      };

    case 'response.audio_transcript.delta':
    case 'response.text.delta':
    case 'response.output_text.delta':
      return {
        type: 'assistant_delta',
        text: (raw.delta ?? '') as string,
      };

    case 'response.audio_transcript.done':
    case 'response.text.done':
    case 'response.output_text.done':
      return { type: 'assistant_done' };

    case 'response.function_call_arguments.done': {
      const name = raw.name as string | undefined;
      const callId = raw.call_id as string | undefined;
      if (!name || !callId) {
        return null;
      }

      return {
        type: 'tool_call',
        name,
        callId,
        args: safeParseJson((raw.arguments as string) || '{}'),
      };
    }

    case 'error': {
      const error = raw.error as Record<string, unknown> | undefined;
      const message = (error?.message ?? 'Unknown OpenAI error') as string;
      return {
        type: 'error',
        error: new Error(message),
        fatal: false,
      };
    }

    default:
      return null;
  }
}
