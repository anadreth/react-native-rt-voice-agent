import type {
  RealtimeSessionConfig,
  RealtimeEvent,
  SessionState,
  ConversationMessage,
  LoggerInterface,
} from './types';
import { transition } from './session-state';
import { ConnectionManager } from './connection-manager';
import { MessageRouter } from './message-router';
import { ConversationManager } from './conversation-manager';
import { ToolRegistry } from './tool-registry';
import { SessionError } from './errors';
import { createLogger } from './logger';

type EventHandler = (event: RealtimeEvent) => void;

/**
 * Main orchestrator for a realtime voice session.
 * Framework-agnostic — no React dependency.
 *
 * @example
 * ```ts
 * const session = new RealtimeSession({
 *   voice: 'alloy',
 *   provider: openAIProvider({ tokenUrl: '...' }),
 *   onEvent: (e) => console.log(e.type),
 * });
 * await session.start();
 * session.sendText('Hello!');
 * session.stop();
 * ```
 */
export class RealtimeSession {
  private config: RealtimeSessionConfig;
  private state: SessionState = 'idle';
  private logger: LoggerInterface;
  private connectionManager: ConnectionManager | null = null;
  private messageRouter: MessageRouter | null = null;
  private conversationManager: ConversationManager;
  private toolRegistry: ToolRegistry;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private destroyed = false;

  constructor(config: RealtimeSessionConfig) {
    this.config = config;
    this.logger = createLogger(config.logger);
    this.conversationManager = new ConversationManager();
    this.toolRegistry = new ToolRegistry(config.logger);

    // Register tools if provided
    if (config.tools) {
      this.toolRegistry.registerMany(config.tools);
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.destroyed) {
      throw new SessionError('Session has been destroyed');
    }

    // Reset to idle if in terminal state
    if (this.state === 'stopped' || this.state === 'error') {
      this.transitionTo('idle');
    }

    if (this.state !== 'idle') {
      throw new SessionError(`Cannot start session from state: ${this.state}`);
    }

    this.logger.info('Starting realtime voice session');

    try {
      // Create connection manager
      this.connectionManager = new ConnectionManager(this.config, {
        onStateTransition: (s) => this.transitionTo(s),
        onDataChannelMessage: (data) => this.messageRouter?.handleMessage(data),
        onDataChannelOpen: () => {
          this.logger.info('Data channel open, session ready');
        },
        onConnectionLost: () => {
          this.logger.error('Connection lost');
          this.transitionTo('error');
        },
      });

      // Create message router
      this.messageRouter = new MessageRouter(
        this.config.provider,
        this.conversationManager,
        this.toolRegistry,
        {
          emit: (event) => this.emit(event),
          sendMessage: (msg) => this.connectionManager?.sendMessage(msg),
        },
        this.config.logger,
      );

      // Start the connection (walks through mic → token → connect states)
      await this.connectionManager.start();
    } catch (err) {
      this.logger.error('Session start failed', err);
      this.transitionTo('error');
      this.emit({
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
        fatal: true,
      });
      throw err;
    }
  }

  stop(): void {
    this.logger.info('Stopping session');

    this.connectionManager?.stop();
    this.connectionManager = null;
    this.messageRouter = null;
    this.conversationManager.clearEphemeralUserMessage();

    if (this.state !== 'idle' && this.state !== 'stopped') {
      this.transitionTo('stopped');
    }
  }

  // ─── Communication ──────────────────────────────────────────────

  sendText(text: string): void {
    if (!this.connectionManager?.isDataChannelOpen()) {
      this.logger.error('Cannot send text: no active connection');
      this.emit({
        type: 'error',
        error: new SessionError('Cannot send message: no active session'),
        fatal: false,
      });
      return;
    }

    // Add to conversation
    this.conversationManager.createUserMessage(text);
    this.emit({
      type: 'conversation.updated',
      messages: [...this.conversationManager.getMessages()],
    });

    // Send to provider
    this.connectionManager.sendMessage({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });

    // Request response
    this.connectionManager.sendMessage({ type: 'response.create' });
  }

  cancelResponse(): void {
    this.connectionManager?.sendMessage({ type: 'response.cancel' });
  }

  // ─── State ──────────────────────────────────────────────────────

  getState(): SessionState {
    return this.state;
  }

  getMessages(): ConversationMessage[] {
    return this.conversationManager.getMessages();
  }

  // ─── Events ─────────────────────────────────────────────────────

  /**
   * Subscribe to a specific event type. Returns an unsubscribe function.
   */
  on(type: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  // ─── Cleanup ────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this.eventHandlers.clear();
    this.destroyed = true;
  }

  // ─── Internal ───────────────────────────────────────────────────

  private transitionTo(next: SessionState): void {
    const prev = this.state;
    try {
      this.state = transition(prev, next);
    } catch {
      // If transition is invalid, force to the target state and log
      this.logger.warn(`Forced state transition: ${prev} -> ${next}`);
      this.state = next;
    }

    this.emit({ type: 'state.changed', state: this.state, previousState: prev });
  }

  private emit(event: RealtimeEvent): void {
    // Notify config callback
    this.config.onEvent?.(event);

    // Notify specific event subscribers
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          this.logger.error(`Event handler error for ${event.type}`, err);
        }
      }
    }

    // Notify wildcard subscribers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (err) {
          this.logger.error('Wildcard event handler error', err);
        }
      }
    }
  }
}
