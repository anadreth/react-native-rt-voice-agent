import { ConversationStore } from './conversation-store';
import { createLogger } from './logger';
import { getReconnectDelay, resolveReconnectPolicy } from './retry-policy';
import { transition } from './session-state';
import { ToolRegistry } from './tool-registry';
import { ConnectionError, RealtimeVoiceError, SessionError, ToolExecutionError } from './errors';
import type {
  BackendConnection,
  BackendSignal,
  ConversationMessage,
  LifecycleCallbacks,
  LoggerInterface,
  RealtimeEvent,
  RealtimeSessionConfig,
  SessionState,
} from './types';

type EventHandler = (event: RealtimeEvent) => void;
type ConnectMode = 'start' | 'reconnect' | 'resume';

export class RealtimeSession {
  private readonly logger: LoggerInterface;
  private readonly conversation = new ConversationStore(this.config.maxMessages);
  private readonly tools: ToolRegistry;
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();

  private state: SessionState = 'idle';
  private connection: BackendConnection | null = null;
  private currentVolume = 0;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectAbortController: AbortController | null = null;
  private connectAttempt = 0;
  private startPromise: Promise<void> | null = null;
  private lifecycleStarted = false;
  private wasConnectedBeforeBackground = false;

  constructor(private readonly config: RealtimeSessionConfig) {
    if (!config.backend) {
      throw new SessionError('RealtimeSessionConfig.backend is required');
    }

    this.logger = createLogger(config.logger);
    this.tools = new ToolRegistry(config.tools ?? []);
  }

  async start(): Promise<void> {
    if (this.destroyed) {
      throw new SessionError('Session has been destroyed');
    }

    if (this.state === 'connected') {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.state !== 'idle' && this.state !== 'stopped' && this.state !== 'error') {
      throw new SessionError(`Cannot start session from state: ${this.state}`);
    }

    this.ensureLifecycleStarted();
    const shouldResetConversation = this.state === 'idle' || this.state === 'stopped' || this.state === 'error';

    this.startPromise = this.connect({ mode: 'start', resetConversation: shouldResetConversation })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  stop(): void {
    this.wasConnectedBeforeBackground = false;
    this.lifecycleStarted = false;
    this.config.lifecycle?.stop();
    this.stopInternal('stopped');
  }

  destroy(): void {
    this.stop();
    this.eventHandlers.clear();
    this.destroyed = true;
  }

  sendText(text: string): void {
    if (!this.connection?.isReady()) {
      this.emitError(new SessionError('Cannot send message: no active session'), false);
      return;
    }

    this.conversation.createUserMessage(text);
    this.emitConversationUpdate();
    this.connection.send({ type: 'send_text', text });
  }

  cancelResponse(): void {
    if (!this.connection?.isReady()) return;
    this.connection.send({ type: 'cancel_response' });
  }

  getState(): SessionState {
    return this.state;
  }

  getMessages(): ConversationMessage[] {
    return this.conversation.getMessages();
  }

  getCurrentVolume(): number {
    return this.currentVolume;
  }

  on(type: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }

    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  private async connect(options: { mode: ConnectMode; resetConversation: boolean }): Promise<void> {
    if (options.resetConversation) {
      this.conversation.reset();
      this.currentVolume = 0;
      this.emitConversationUpdate();
      this.emit({ type: 'volume.changed', level: 0 });
    }

    this.clearReconnectTimer();
    this.connectAbortController?.abort();
    this.connectAbortController = new AbortController();
    const attempt = ++this.connectAttempt;

    this.transitionTo(options.mode === 'reconnect' ? 'reconnecting' : 'connecting');

    try {
      const connection = await this.config.backend.connect({
        signal: this.connectAbortController.signal,
        emit: (signal) => this.handleBackendSignal(signal, attempt),
        logger: this.logger,
        tools: this.tools.getDefinitions(),
      });

      if (this.connectAbortController.signal.aborted || attempt !== this.connectAttempt) {
        await Promise.resolve(connection.close());
        return;
      }

      this.connection = connection;
      this.reconnectAttempts = 0;
      if (this.state !== 'connected') {
        this.transitionTo('connected');
      }

      if (options.mode === 'start' && this.config.initialUserText) {
        this.sendText(this.config.initialUserText);
      }
    } catch (error) {
      if (this.connectAbortController.signal.aborted) {
        return;
      }

      await this.closeConnection();

      if (options.mode === 'start') {
        this.transitionTo('error');
        this.emitError(error, true);
        throw error;
      }

      this.handleConnectionLost(error);
    }
  }

  private async handleBackendSignal(signal: BackendSignal, attempt: number): Promise<void> {
    if (attempt !== this.connectAttempt) return;

    switch (signal.type) {
      case 'connected':
        if (this.state !== 'connected') {
          this.transitionTo('connected');
        }
        return;

      case 'connection_lost':
        this.handleConnectionLost(new ConnectionError('Connection lost'));
        return;

      case 'error':
        this.emitError(signal.error, signal.fatal);
        return;

      case 'user_speech_started':
        this.handleUserSpeechStarted();
        return;

      case 'user_speech_stopped':
        this.conversation.updateEphemeralMessage({ status: 'speaking' });
        this.emit({ type: 'user.speech.stopped' });
        this.emitConversationUpdate();
        return;

      case 'user_transcript_partial': {
        const ephemeral = this.conversation.getOrCreateEphemeralUserId();
        const text = signal.text || 'User is speaking...';
        this.conversation.updateEphemeralMessage({
          text,
          status: 'speaking',
          isFinal: false,
        });
        this.emit({ type: 'user.transcript.partial', text, messageId: ephemeral.id });
        this.emitConversationUpdate();
        return;
      }

      case 'user_transcript_final': {
        const ephemeralId = this.conversation.getEphemeralUserId() ?? this.conversation.getOrCreateEphemeralUserId().id;
        this.conversation.updateEphemeralMessage({
          text: signal.text,
          isFinal: true,
          status: 'final',
        });
        this.conversation.clearEphemeralUserMessage();
        this.emit({ type: 'user.transcript.final', text: signal.text, messageId: ephemeralId });
        this.emitConversationUpdate();
        return;
      }

      case 'assistant_delta': {
        const messageId = this.conversation.appendAssistantDelta(signal.text);
        this.emit({ type: 'assistant.delta', text: signal.text, messageId });
        this.emitConversationUpdate();
        return;
      }

      case 'assistant_done': {
        const finalized = this.conversation.finalizeAssistantMessage(signal.text);
        this.emit({
          type: 'assistant.done',
          text: finalized?.text ?? '',
          messageId: finalized?.id ?? '',
        });
        this.emitConversationUpdate();
        return;
      }

      case 'tool_call':
        await this.handleToolCall(signal.name, signal.args, signal.callId);
        return;

      case 'volume_changed':
        this.currentVolume = signal.level;
        this.emit({ type: 'volume.changed', level: signal.level });
        return;
    }
  }

  private handleUserSpeechStarted(): void {
    this.conversation.finalizeAssistantMessage();
    this.conversation.getOrCreateEphemeralUserId();
    this.emit({ type: 'user.speech.started' });

    if (this.connection?.isReady() && this.config.backend.capabilities.interruptions) {
      this.connection.send({ type: 'cancel_response' });
    }

    this.emitConversationUpdate();
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>,
    callId: string,
  ): Promise<void> {
    this.emit({ type: 'tool.called', name, args, callId });

    let result: unknown;
    try {
      result = await this.tools.execute(name, args);
    } catch (error) {
      const toolError = error instanceof ToolExecutionError ? error : new ToolExecutionError(String(error));
      result = { error: toolError.message };
      this.emitError(toolError, false);
    }

    this.emit({ type: 'tool.result', name, result, callId });

    if (this.connection?.isReady()) {
      this.connection.send({ type: 'tool_result', callId, name, result });
    }
  }

  private handleConnectionLost(error: unknown): void {
    void this.closeConnection();

    const policy = resolveReconnectPolicy(this.config.reconnectPolicy);
    const reconnectSupported = this.config.backend.capabilities.autoReconnect && policy.enabled;
    if (!reconnectSupported || this.reconnectAttempts >= policy.maxAttempts) {
      this.transitionTo('error');
      this.emitError(error, true);
      return;
    }

    this.reconnectAttempts += 1;
    const delay = getReconnectDelay(this.reconnectAttempts, this.config.reconnectPolicy);
    this.transitionTo('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect({ mode: 'reconnect', resetConversation: false });
    }, delay);
  }

  private ensureLifecycleStarted(): void {
    if (!this.config.lifecycle || this.lifecycleStarted) return;

    const callbacks: LifecycleCallbacks = {
      onBackground: () => {
        if (this.state === 'connected') {
          this.wasConnectedBeforeBackground = true;
          void this.closeConnection();
          this.transitionTo('stopped');
        }
      },
      onForeground: () => {
        if (!this.wasConnectedBeforeBackground) return;
        this.wasConnectedBeforeBackground = false;
        void this.connect({ mode: 'resume', resetConversation: false });
      },
    };

    this.config.lifecycle.start(callbacks);
    this.lifecycleStarted = true;
  }

  private stopInternal(nextState: 'stopped' | 'error'): void {
    const previousState = this.state;
    this.clearReconnectTimer();
    this.connectAbortController?.abort();
    this.connectAbortController = null;
    void this.closeConnection();

    if (this.state !== nextState) {
      try {
        this.transitionTo(nextState);
      } catch {
        this.state = nextState;
        this.emit({ type: 'state.changed', state: nextState, previousState });
      }
    }
  }

  private async closeConnection(): Promise<void> {
    if (!this.connection) return;

    const connection = this.connection;
    this.connection = null;
    await Promise.resolve(connection.close());
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private transitionTo(next: SessionState): void {
    if (this.state === next) return;
    const previousState = this.state;
    this.state = transition(previousState, next);
    this.emit({ type: 'state.changed', state: this.state, previousState });
  }

  private emitConversationUpdate(): void {
    this.emit({
      type: 'conversation.updated',
      messages: [...this.conversation.getMessages()],
    });
  }

  private emitError(error: unknown, fatal: boolean): void {
    const normalized = error instanceof Error
      ? error
      : new RealtimeVoiceError(String(error), 'internal_error');

    const code = normalized instanceof RealtimeVoiceError ? normalized.code : undefined;
    this.emit({ type: 'error', error: normalized, fatal, code });
  }

  private emit(event: RealtimeEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }

    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(event);
      }
    }
  }
}
