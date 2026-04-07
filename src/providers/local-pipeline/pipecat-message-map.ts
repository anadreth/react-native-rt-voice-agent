/**
 * Maps Pipecat RTVI protocol messages to NormalizedMessage format.
 *
 * RTVI (Real-Time Voice Interface) is the standard protocol used by Pipecat.
 * See: https://docs.pipecat.ai/client/rtvi-standard
 */
import type { NormalizedMessage } from '../../core/types';

/**
 * Map a Pipecat RTVI message to our normalized format.
 * Returns null for message types we don't handle.
 */
export function mapPipecatMessage(raw: Record<string, unknown>): NormalizedMessage | null {
  const type = raw.type as string;
  const data = (raw.data ?? {}) as Record<string, unknown>;

  switch (type) {
    // ─── Speech Detection ──────────────────────────────────────
    case 'user-started-speaking':
      return { kind: 'user_speech_started' };

    case 'user-stopped-speaking':
      return { kind: 'user_speech_stopped' };

    // ─── User Transcription ────────────────────────────────────
    case 'user-transcription': {
      const text = (data.text as string) ?? '';
      const isFinal = data.final === true;

      return {
        kind: isFinal ? 'user_transcript_final' : 'user_transcript_partial',
        text,
      };
    }

    // ─── Bot LLM Text (streaming deltas) ───────────────────────
    case 'bot-llm-text': {
      const text = (data.text as string) ?? '';
      return { kind: 'assistant_delta', text };
    }

    // ─── Bot TTS Text (spoken text chunks) ─────────────────────
    case 'bot-tts-text': {
      // TTS text is what the bot actually speaks — also useful as deltas
      const text = (data.text as string) ?? '';
      return { kind: 'assistant_delta', text };
    }

    // ─── Bot Output (aggregated final text) ────────────────────
    case 'bot-output': {
      const text = (data.text as string) ?? '';
      return { kind: 'assistant_done', text };
    }

    // ─── Bot stopped speaking = response complete ──────────────
    case 'bot-stopped-speaking':
      return { kind: 'assistant_done' };

    // ─── Bot LLM lifecycle ─────────────────────────────────────
    case 'bot-llm-started':
      // Could be used to show "thinking" state, but we emit as audio_committed
      return { kind: 'audio_committed' };

    case 'bot-llm-stopped':
      // LLM generation done — the TTS may still be speaking
      return null;

    // ─── Tool Calls ────────────────────────────────────────────
    case 'llm-function-call-in-progress': {
      const name = (data.function_name as string) ?? '';
      const callId = (data.tool_call_id as string) ?? '';
      const args = (data.arguments ?? {}) as Record<string, unknown>;
      return { kind: 'tool_call', name, callId, args };
    }

    // Legacy tool call format
    case 'llm-function-call': {
      const name = (data.function_name as string) ?? '';
      const callId = (data.tool_call_id as string) ?? '';
      const args = (data.args ?? {}) as Record<string, unknown>;
      return { kind: 'tool_call', name, callId, args };
    }

    // ─── Session ───────────────────────────────────────────────
    case 'bot-ready':
      return { kind: 'session_created' };

    // ─── Errors ────────────────────────────────────────────────
    case 'error': {
      const message = (data.message as string) ?? 'Unknown error';
      return {
        kind: 'provider_error',
        errorMessage: message,
        errorCode: data.fatal ? 'fatal' : 'non-fatal',
      };
    }

    // ─── Ignored message types ─────────────────────────────────
    case 'bot-started-speaking':
    case 'bot-tts-started':
    case 'bot-tts-stopped':
    case 'metrics':
    case 'server-message':
    case 'server-response':
    case 'error-response':
    case 'user-mute-started':
    case 'user-mute-stopped':
    case 'bot-transcription': // deprecated
    case 'llm-function-call-started':
    case 'llm-function-call-stopped':
    case 'bot-llm-search-response':
      return null;

    default:
      return null;
  }
}
