import { describe, it, expect } from 'vitest';
import { openAIProvider } from '../providers/openai/openai-provider';
import type { RealtimeSessionConfig } from '../core/types';

describe('OpenAI provider', () => {
  const provider = openAIProvider({ tokenUrl: 'https://example.com/token' });

  describe('buildSessionUpdate serialization', () => {
    it('places maxResponseTokens at session level, not nested under conversation', () => {
      const config: RealtimeSessionConfig = {
        provider,
        sessionConfig: {
          maxResponseTokens: 4096,
        },
      };

      const result = provider.buildSessionUpdate(config) as any;

      // Should be at session root
      expect(result.session.max_response_output_tokens).toBe(4096);
      // Should NOT be nested under conversation
      expect(result.session.conversation).toBeUndefined();
    });

    it('omits maxResponseTokens when not set', () => {
      const config: RealtimeSessionConfig = { provider };
      const result = provider.buildSessionUpdate(config) as any;

      expect(result.session.max_response_output_tokens).toBeUndefined();
    });

    it('includes tools when provided', () => {
      const config: RealtimeSessionConfig = {
        provider,
        tools: [{
          name: 'greet',
          description: 'Says hello',
          handler: async () => ({}),
        }],
      };

      const result = provider.buildSessionUpdate(config) as any;
      expect(result.session.tools).toHaveLength(1);
      expect(result.session.tools[0].name).toBe('greet');
      expect(result.session.tools[0].type).toBe('function');
    });

    it('defaults to text and audio modalities', () => {
      const config: RealtimeSessionConfig = { provider };
      const result = provider.buildSessionUpdate(config) as any;
      expect(result.session.modalities).toEqual(['text', 'audio']);
    });
  });
});
