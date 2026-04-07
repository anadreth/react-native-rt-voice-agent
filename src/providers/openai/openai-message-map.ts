import type { NormalizedMessage } from '../../core/types';

/**
 * Safely parse JSON, returning empty object on failure.
 */
function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str || '{}');
  } catch {
    return {};
  }
}

/**
 * Maps raw OpenAI Realtime data channel messages to normalized library events.
 * Returns null for unhandled message types.
 */
export function mapOpenAIMessage(raw: Record<string, unknown>): NormalizedMessage | null {
  const type = raw.type as string;

  switch (type) {
    // ─── User speech events ─────────────────────────────────────
    case 'input_audio_buffer.speech_started':
      return { kind: 'user_speech_started' };

    case 'input_audio_buffer.speech_stopped':
      return { kind: 'user_speech_stopped' };

    case 'input_audio_buffer.committed':
      return { kind: 'audio_committed' };

    // ─── User transcription ─────────────────────────────────────
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

    // ─── Assistant response (audio mode) ────────────────────────
    case 'response.audio_transcript.delta':
      return {
        kind: 'assistant_delta',
        text: (raw.delta ?? '') as string,
      };

    case 'response.audio_transcript.done':
      return { kind: 'assistant_done' };

    // ─── Assistant response (text-only mode) ──────────────────
    case 'response.text.delta':
      return {
        kind: 'assistant_delta',
        text: (raw.delta ?? '') as string,
      };

    case 'response.text.done':
      return { kind: 'assistant_done' };

    // ─── Assistant response (forward-compat aliases) ────────────
    case 'response.output_text.delta':
      return {
        kind: 'assistant_delta',
        text: (raw.delta ?? '') as string,
      };

    case 'response.output_text.done':
      return { kind: 'assistant_done' };

    // ─── Tool calling ───────────────────────────────────────────
    case 'response.function_call_arguments.done': {
      const name = raw.name as string | undefined;
      const callId = raw.call_id as string | undefined;
      if (!name || !callId) return null; // malformed, skip

      return {
        kind: 'tool_call',
        name,
        args: safeJsonParse((raw.arguments as string) || '{}'),
        callId,
      };
    }

    // ─── Server errors (critical — must surface to consumers) ───
    case 'error': {
      const err = raw.error as Record<string, unknown> | undefined;
      return {
        kind: 'provider_error',
        errorMessage: (err?.message ?? 'Unknown server error') as string,
        errorCode: (err?.code ?? 'unknown') as string,
      };
    }

    // ─── Session lifecycle ──────────────────────────────────────
    case 'session.created':
    case 'session.updated':
      return { kind: 'session_created' };

    default:
      return null;
  }
}
