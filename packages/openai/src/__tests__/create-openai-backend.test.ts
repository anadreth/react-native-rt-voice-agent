import { ConnectionError } from '@rtva/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaDevices } from 'react-native-webrtc';
import { createOpenAIBackend } from '../create-openai-backend';

describe('createOpenAIBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('/token')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ token: 'secret' }),
          text: async () => 'unused',
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => 'answer-sdp',
      };
    }));
  });

  it('maps transport failures to ConnectionError', async () => {
    vi.mocked(mediaDevices.getUserMedia).mockRejectedValueOnce(new Error('denied'));
    const backend = createOpenAIBackend({ tokenUrl: 'https://example.com/token' });

    await expect(backend.connect({
      signal: new AbortController().signal,
      emit: vi.fn(),
      logger: console,
      tools: [],
    })).rejects.toBeInstanceOf(ConnectionError);
  });
});
