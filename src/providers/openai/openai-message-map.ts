import type { NormalizedMessage } from '../../core/types';

/**
 * Maps raw OpenAI Realtime data channel messages to normalized library events.
 * Returns null for unhandled message types.
 */
export function mapOpenAIMessage(raw: Record<string, unknown>): NormalizedMessage | null {
  const type = raw.type as string;

  switch (type) {
    case 'input_audio_buffer.speech_started':
      return { kind: 'user_speech_started' };

    case 'input_audio_buffer.speech_stopped':
      return { kind: 'user_speech_stopped' };

    case 'input_audio_buffer.committed':
      return { kind: 'audio_committed' };

    case 'conversation.item.input_audio_transcription':
      return {
        kind: 'user_transcript_partial',
        text: (raw.transcript ?? raw.text ?? '') as string,
      };

    case 'conversation.item.input_audio_transcription.completed':
      return {
        kind: 'user_transcript_final',
        text: (raw.transcript ?? '') as string,
      };

    case 'response.audio_transcript.delta':
      return {
        kind: 'assistant_delta',
        text: (raw.delta ?? '') as string,
      };

    case 'response.audio_transcript.done':
      return { kind: 'assistant_done' };

    case 'response.function_call_arguments.done':
      return {
        kind: 'tool_call',
        name: raw.name as string,
        args: JSON.parse((raw.arguments as string) || '{}'),
        callId: raw.call_id as string,
      };

    default:
      return null;
  }
}
