import { describe, it, expect } from 'vitest';
import { mapOpenAIMessage } from '../providers/openai/openai-message-map';

describe('OpenAI message normalization', () => {
  describe('normalizes user speech events', () => {
    it('detects when user starts speaking', () => {
      expect(mapOpenAIMessage({ type: 'input_audio_buffer.speech_started' }))
        .toEqual({ kind: 'user_speech_started' });
    });

    it('detects when user stops speaking', () => {
      expect(mapOpenAIMessage({ type: 'input_audio_buffer.speech_stopped' }))
        .toEqual({ kind: 'user_speech_stopped' });
    });

    it('detects when audio buffer is committed', () => {
      expect(mapOpenAIMessage({ type: 'input_audio_buffer.committed' }))
        .toEqual({ kind: 'audio_committed' });
    });

    it('provides partial transcription as user speaks', () => {
      expect(mapOpenAIMessage({
        type: 'conversation.item.input_audio_transcription',
        transcript: 'hello',
      })).toEqual({ kind: 'user_transcript_partial', text: 'hello' });
    });

    it('falls back to text field when transcript is missing', () => {
      expect(mapOpenAIMessage({
        type: 'conversation.item.input_audio_transcription',
        text: 'fallback',
      })).toEqual({ kind: 'user_transcript_partial', text: 'fallback' });
    });

    it('provides final transcription when processing completes', () => {
      expect(mapOpenAIMessage({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello world',
      })).toEqual({ kind: 'user_transcript_final', text: 'hello world' });
    });
  });

  describe('normalizes assistant streaming', () => {
    it('streams audio transcript deltas', () => {
      expect(mapOpenAIMessage({
        type: 'response.audio_transcript.delta',
        delta: 'Hi there',
      })).toEqual({ kind: 'assistant_delta', text: 'Hi there' });
    });

    it('signals audio transcript completion', () => {
      expect(mapOpenAIMessage({ type: 'response.audio_transcript.done' }))
        .toEqual({ kind: 'assistant_done' });
    });

    it('streams text deltas in text-only mode', () => {
      expect(mapOpenAIMessage({
        type: 'response.text.delta',
        delta: 'text mode',
      })).toEqual({ kind: 'assistant_delta', text: 'text mode' });
    });

    it('signals text completion in text-only mode', () => {
      expect(mapOpenAIMessage({ type: 'response.text.done' }))
        .toEqual({ kind: 'assistant_done' });
    });

    it('handles forward-compatible output_text.delta', () => {
      expect(mapOpenAIMessage({
        type: 'response.output_text.delta',
        delta: 'future format',
      })).toEqual({ kind: 'assistant_delta', text: 'future format' });
    });

    it('handles forward-compatible output_text.done', () => {
      expect(mapOpenAIMessage({ type: 'response.output_text.done' }))
        .toEqual({ kind: 'assistant_done' });
    });
  });

  describe('normalizes tool calls', () => {
    it('parses a complete function call', () => {
      expect(mapOpenAIMessage({
        type: 'response.function_call_arguments.done',
        name: 'saveNote',
        arguments: '{"text":"hello"}',
        call_id: 'call_123',
      })).toEqual({
        kind: 'tool_call',
        name: 'saveNote',
        args: { text: 'hello' },
        callId: 'call_123',
      });
    });

    it('recovers from malformed JSON in arguments', () => {
      expect(mapOpenAIMessage({
        type: 'response.function_call_arguments.done',
        name: 'test',
        arguments: '{invalid json',
        call_id: 'call_123',
      })).toEqual({
        kind: 'tool_call',
        name: 'test',
        args: {},
        callId: 'call_123',
      });
    });

    it('rejects call with missing function name', () => {
      expect(mapOpenAIMessage({
        type: 'response.function_call_arguments.done',
        arguments: '{}',
        call_id: 'call_123',
      })).toBeNull();
    });

    it('rejects call with missing call ID', () => {
      expect(mapOpenAIMessage({
        type: 'response.function_call_arguments.done',
        name: 'test',
        arguments: '{}',
      })).toBeNull();
    });
  });

  describe('surfaces provider errors and session events', () => {
    it('normalizes error events with message and code', () => {
      expect(mapOpenAIMessage({
        type: 'error',
        error: { message: 'rate limit', code: 'rate_limit_exceeded' },
      })).toEqual({
        kind: 'provider_error',
        errorMessage: 'rate limit',
        errorCode: 'rate_limit_exceeded',
      });
    });

    it('signals session created', () => {
      expect(mapOpenAIMessage({ type: 'session.created' }))
        .toEqual({ kind: 'session_created' });
    });

    it('signals session updated', () => {
      expect(mapOpenAIMessage({ type: 'session.updated' }))
        .toEqual({ kind: 'session_created' });
    });
  });

  describe('ignores unknown message types', () => {
    it('returns null for unrecognized events', () => {
      expect(mapOpenAIMessage({ type: 'response.created' })).toBeNull();
      expect(mapOpenAIMessage({ type: 'response.output_item.added' })).toBeNull();
      expect(mapOpenAIMessage({ type: 'rate_limits.updated' })).toBeNull();
    });
  });
});
