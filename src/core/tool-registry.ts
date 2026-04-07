import type { ToolDefinition, LoggerInterface } from './types';
import { createLogger } from './logger';

/**
 * Registry for user-provided tool functions.
 * Tools are executed locally — if you need backend proxy, wrap it in the handler.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private logger: LoggerInterface;

  constructor(logger?: LoggerInterface) {
    this.logger = createLogger(logger);
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      this.logger.error(`Tool not found: ${name}`);
      return { error: `Unknown tool: ${name}` };
    }

    try {
      return await tool.handler(args);
    } catch (err) {
      this.logger.error(`Tool "${name}" execution failed`, err);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Get tool definitions for sending to the provider (e.g., in session.update).
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
