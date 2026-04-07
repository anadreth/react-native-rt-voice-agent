import type {
  RealtimeSessionConfig,
  RealtimeEvent,
  SessionState,
  ConversationMessage,
  LoggerInterface,
  Transport,
} from './types';
import { transition } from './session-state';
import { MessageRouter } from './message-router';
import { ConversationManager } from './conversation-manager';
import { ToolRegistry } from './tool-registry';
import { SessionError } from './errors';
import { createLogger } from './logger';
import { AppLifecycleManager } from './app-lifecycle';

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
  private transport: Transport | null = null;
  private messageRouter: MessageRouter | null = null;
  private conversationManager: ConversationManager;
  private toolRegistry: ToolRegistry;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private startAborted = false;
  private lifecycleManager: AppLifecycleManager | null = null;
  private wasConnectedBeforeBackground = false;

  constructor(config: RealtimeSessionConfig) {
    // Validate required config
    if (!config.provider) {
      throw new SessionError('RealtimeSessionConfig.provider is required');
    }
    if (typeof config.provider.createTransport !== 'function') {
      throw new SessionError('Provider must implement createTransport()');
    }
    if (typeof config.provider.mapMessage !== 'function') {
      throw new SessionError('Provider must implement mapMessage()');
    }

    this.config = config;
    this.logger = createLogger(config.logger);
    this.conversationManager = new ConversationManager(config.maxMessages);
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
    this.startAborted = false;
    this.conversationManager.reset();

    try {
      // Create transport from provider
      this.transport = this.config.provider.createTransport(this.logger);

      // Create message router
      this.messageRouter = new MessageRouter(
        this.config.provider,
        this.conversationManager,
        this.toolRegistry,
        {
          emit: (event) => this.emit(event),
          sendMessage: (msg) => this.transport?.sendMessage(msg),
        },
        this.config.logger,
      );

      // Start the transport (walks through mic → auth → connect states)
      await this.transport.start({
        sessionConfig: this.config,
        callbacks: {
          onStateChange: (s) => this.transitionTo(s),
          onMessage: (data) => {
            this.messageRouter?.handleMessage(data).catch((err) => {
              this.logger.error('Unhandled message handler error', err);
              this.emit({
                type: 'error',
                error: err instanceof Error ? err : new Error(String(err)),
                fatal: false,
              });
            });
          },
          onReady: () => {
            this.logger.info('Transport ready, session connected');
          },
          onConnectionLost: () => {
            this.logger.error('Connection lost');
            this.handleConnectionLost();
          },
          onVolume: (level) => {
            this.emit({ type: 'volume.changed', level });
          },
          onError: (error, fatal) => {
            this.emit({ type: 'error', error, fatal });
          },
        },
      });

      // If stop() was called while start() was in-flight, bail out
      if (this.startAborted) {
        this.logger.info('Start aborted by stop()');
        return;
      }

      // Start app lifecycle monitoring
      this.startLifecycleMonitoring();
    } catch (err) {
      // If stop() was called during start(), don't treat as error
      if (this.startAborted) {
        this.logger.info('Start aborted by stop()');
        return;
      }
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

    // Cancel any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    // Signal any in-flight start() to bail out
    this.startAborted = true;

    // Stop lifecycle monitoring
    this.lifecycleManager?.stop();
    this.lifecycleManager = null;

    this.transport?.stop();
    this.transport = null;
    this.messageRouter = null;
    this.conversationManager.clearEphemeralUserMessage();

    if (this.state !== 'idle' && this.state !== 'stopped') {
      this.transitionTo('stopped');
    }
  }

  // ─── Communication ──────────────────────────────────────────────

  sendText(text: string): void {
    if (!this.transport?.isReady()) {
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

    // Send to provider using provider-specific message format
    const provider = this.config.provider;
    if (provider.buildUserTextMessages) {
      const messages = provider.buildUserTextMessages(text);
      for (const msg of messages) {
        this.transport.sendMessage(msg);
      }
    } else {
      // Fallback to OpenAI-compatible format
      this.transport.sendMessage({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      });
      this.transport.sendMessage({ type: 'response.create' });
    }
  }

  cancelResponse(): void {
    const provider = this.config.provider;
    const cancelMsg = provider.buildCancelMessage?.() ?? { type: 'response.cancel' };
    this.transport?.sendMessage(cancelMsg);
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

  // ─── App Lifecycle ──────────────────────────────────────────────

  private startLifecycleMonitoring(): void {
    this.lifecycleManager = new AppLifecycleManager(
      {
        onBackground: () => {
          if (this.state === 'connected') {
            this.wasConnectedBeforeBackground = true;
            this.logger.info('App backgrounded — stopping session');
            this.transport?.stop();
            this.transport = null;
            this.messageRouter = null;
            this.transitionTo('stopped');
            this.emit({
              type: 'error',
              error: new SessionError('Session paused: app moved to background'),
              fatal: false,
            });
          }
        },
        onForeground: () => {
          if (this.wasConnectedBeforeBackground) {
            this.wasConnectedBeforeBackground = false;
            this.logger.info('App foregrounded — restarting session');
            this.transitionTo('idle');
            this.start().catch((err) => {
              this.logger.error('Failed to restart after foreground', err);
            });
          }
        },
      },
      this.config.logger,
    );
    this.lifecycleManager.start();
  }

  // ─── Reconnection ────────────────────────────────────────────────

  private handleConnectionLost(): void {
    const autoReconnect = this.config.autoReconnect ?? true;
    const maxAttempts = this.config.maxReconnectAttempts ?? 3;

    if (!autoReconnect || this.reconnectAttempts >= maxAttempts) {
      this.logger.error(
        autoReconnect
          ? `Max reconnection attempts (${maxAttempts}) reached`
          : 'Auto-reconnect disabled'
      );
      this.transitionTo('error');
      this.emit({
        type: 'error',
        error: new SessionError('Connection lost permanently'),
        fatal: true,
      });
      return;
    }

    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10_000);

    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.transitionTo('reconnecting');

    // Clean up old connection
    this.transport?.stop();
    this.transport = null;
    this.messageRouter = null;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.destroyed || this.state !== 'reconnecting') return;

      try {
        // Transition through state machine properly
        this.transitionTo('idle');
        await this.start();
        this.reconnectAttempts = 0; // Reset on success
        this.logger.info('Reconnection successful');
      } catch (err) {
        this.logger.error('Reconnection failed', err);
        this.handleConnectionLost(); // Try again or give up
      }
    }, delay);
  }

  // ─── Internal ───────────────────────────────────────────────────

  private transitionTo(next: SessionState): void {
    const prev = this.state;
    try {
      this.state = transition(prev, next);
    } catch {
      // Only allow forcing into error/stopped (recovery paths)
      if (next === 'error' || next === 'stopped') {
        this.logger.warn(`Forced state transition: ${prev} -> ${next}`);
        this.state = next;
      } else {
        this.logger.error(`Invalid state transition blocked: ${prev} -> ${next}`);
        this.emit({
          type: 'error',
          error: new SessionError(`Invalid state transition: ${prev} -> ${next}`),
          fatal: false,
        });
        return; // Don't emit state.changed for blocked transitions
      }
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
