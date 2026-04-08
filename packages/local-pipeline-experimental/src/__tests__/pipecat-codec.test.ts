import { describe, expect, it } from 'vitest';
import { decodePipecatMessage, extractPipecatAudioPayload } from '../protocol/pipecat-codec';

describe('pipecat codec', () => {
  it('maps transcription and bot output signals', () => {
    expect(decodePipecatMessage({
      type: 'user-transcription',
      data: { text: 'hello', final: true },
    })).toEqual({ type: 'user_transcript_final', text: 'hello' });

    expect(decodePipecatMessage({
      type: 'bot-output',
      data: { text: 'hi there' },
    })).toEqual({ type: 'assistant_done', text: 'hi there' });
  });

  it('extracts audio payloads from supported message shapes', () => {
    expect(extractPipecatAudioPayload({ audio: 'raw-audio' })).toBe('raw-audio');
    expect(extractPipecatAudioPayload({ data: { audio: 'nested-audio' } })).toBe('nested-audio');
    expect(extractPipecatAudioPayload({ type: 'bot-tts-audio', data: { payload: 'tts-audio' } }))
      .toBe('tts-audio');
  });
});
