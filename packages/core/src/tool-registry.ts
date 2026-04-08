import type { ToolDefinition } from './types';
import { ToolExecutionError } from './errors';
import { withTimeout } from './utils';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[] = []) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }

    try {
      return await withTimeout(
        Promise.resolve(tool.handler(args)),
        tool.timeoutMs ?? 10_000,
        `Tool "${name}" timed out`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolExecutionError(message);
    }
  }
}
