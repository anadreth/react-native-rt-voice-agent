import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../core/tool-registry';
import type { ToolDefinition } from '../core/types';

describe('Tool registry', () => {
  let registry: ToolRegistry;

  const greetTool: ToolDefinition = {
    name: 'greet',
    description: 'Says hello',
    parameters: { type: 'object', properties: { name: { type: 'string' } } },
    handler: async (args) => ({ greeting: `Hello ${args.name}` }),
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('executes registered tools', () => {
    it('runs a tool and returns its result', async () => {
      registry.register(greetTool);
      const result = await registry.execute('greet', { name: 'World' });
      expect(result).toEqual({ greeting: 'Hello World' });
    });

    it('supports batch registration', () => {
      const farewellTool: ToolDefinition = {
        name: 'farewell',
        description: 'Says goodbye',
        handler: async () => ({ message: 'bye' }),
      };
      registry.registerMany([greetTool, farewellTool]);
      expect(registry.has('greet')).toBe(true);
      expect(registry.has('farewell')).toBe(true);
    });

    it('exposes tool definitions for the provider', () => {
      registry.register(greetTool);
      const defs = registry.getDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe('greet');
      expect(defs[0].description).toBe('Says hello');
    });

    it('reports no definitions when empty', () => {
      expect(registry.getDefinitions()).toHaveLength(0);
    });
  });

  describe('returns error for unknown tools', () => {
    it('returns an error object instead of throwing', async () => {
      const result = await registry.execute('unknown', {});
      expect(result).toEqual({ error: 'Unknown tool: unknown' });
    });

    it('reports unregistered tools as missing', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('catches failing tool handlers', () => {
    it('wraps handler exceptions into an error result', async () => {
      const failingTool: ToolDefinition = {
        name: 'fail',
        description: 'Always fails',
        handler: async () => { throw new Error('boom'); },
      };
      registry.register(failingTool);
      const result = await registry.execute('fail', {});
      expect(result).toEqual({ error: 'boom' });
    });
  });
});
