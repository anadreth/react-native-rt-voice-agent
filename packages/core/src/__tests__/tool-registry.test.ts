import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../tool-registry';

describe('ToolRegistry', () => {
  it('executes a registered tool', async () => {
    const registry = new ToolRegistry([
      {
        name: 'greet',
        description: 'Greets',
        handler: async (args) => ({ greeting: `Hello ${args.name}` }),
      },
    ]);

    await expect(registry.execute('greet', { name: 'World' }))
      .resolves.toEqual({ greeting: 'Hello World' });
  });

  it('times out long-running tools', async () => {
    const registry = new ToolRegistry([
      {
        name: 'slow',
        description: 'Slow',
        timeoutMs: 1,
        handler: async () => new Promise((resolve) => setTimeout(resolve, 10)),
      },
    ]);

    await expect(registry.execute('slow', {}))
      .rejects.toThrow('timed out');
  });
});
