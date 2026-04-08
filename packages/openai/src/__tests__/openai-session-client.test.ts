import { describe, expect, it } from 'vitest';
import { defaultTokenExtractor } from '../auth/openai-session-client';

describe('defaultTokenExtractor', () => {
  it('extracts tokens from supported response shapes', () => {
    expect(defaultTokenExtractor({ data: { client_secret: { value: 'a' } } })).toBe('a');
    expect(defaultTokenExtractor({ token: 'b' })).toBe('b');
    expect(defaultTokenExtractor({ client_secret: { value: 'c' } })).toBe('c');
  });
});
