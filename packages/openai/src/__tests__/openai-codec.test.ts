import { describe, expect, it } from 'vitest';
import { buildOpenAISessionInit, decodeOpenAIMessage, encodeOpenAICommand } from '../protocol/openai-codec';

describe('openai codec', () => {
  it('builds session init payload with tools', () => {
    const messages = buildOpenAISessionInit({
      tokenUrl: 'https://example.com',
      session: { maxResponseTokens: 512 },
    }, [{
      name: 'save',
      description: 'Saves',
      handler: async () => ({}),
    }]);

    expect((messages[0] as any).session.tools).toHaveLength(1);
    expect((messages[0] as any).session.max_response_output_tokens).toBe(512);
  });

  it('encodes generic commands into OpenAI messages', () => {
    expect(encodeOpenAICommand({ type: 'cancel_response' })).toEqual([{ type: 'response.cancel' }]);
    expect(encodeOpenAICommand({ type: 'send_text', text: 'hello' })).toHaveLength(2);
  });

  it('decodes assistant, transcript, and tool call messages', () => {
    expect(decodeOpenAIMessage({ type: 'response.audio_transcript.delta', delta: 'Hi' }))
      .toEqual({ type: 'assistant_delta', text: 'Hi' });

    expect(decodeOpenAIMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'done',
    })).toEqual({ type: 'user_transcript_final', text: 'done' });

    expect(decodeOpenAIMessage({
      type: 'response.function_call_arguments.done',
      name: 'lookup',
      arguments: '{"q":"x"}',
      call_id: 'call-1',
    })).toEqual({
      type: 'tool_call',
      name: 'lookup',
      args: { q: 'x' },
      callId: 'call-1',
    });
  });
});
