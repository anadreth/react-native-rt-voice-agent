import type {
  RealtimeProvider,
  RealtimeEvent,
  LoggerInterface,
  NormalizedMessage,
} from './types';
import type { ConversationManager } from './conversation-manager';
import type { ToolRegistry } from './tool-registry';
import { createLogger } from './logger';

export interface MessageRouterCallbacks {
  emit: (event: RealtimeEvent) => void;
  sendMessage: (message: unknown) => void;
}

/**
 * Routes incoming data channel messages to the appropriate handlers.
 * Normalizes provider-specific messages via `provider.mapMessage()`,
 * then dispatches typed events.
 */
export class MessageRouter {
  private provider: RealtimeProvider;
  private conversationManager: ConversationManager;
  private toolRegistry: ToolRegistry;
  private callbacks: MessageRouterCallbacks;
  private logger: LoggerInterface;

  constructor(
    provider: RealtimeProvider,
    conversationManager: ConversationManager,
    toolRegistry: ToolRegistry,
    callbacks: MessageRouterCallbacks,
    logger?: LoggerInterface,
  ) {
    this.provider = provider;
    this.conversationManager = conversationManager;
    this.toolRegistry = toolRegistry;
    this.callbacks = callbacks;
    this.logger = createLogger(logger);
  }

  /**
   * Handle a raw data channel message.
   */
  async handleMessage(raw: unknown): Promise<void> {
    // Always emit raw event
    this.callbacks.emit({ type: 'raw', data: raw });

    // Normalize through provider
    const normalized = this.provider.mapMessage(raw);
    if (!normalized) return;

    try {
      await this.dispatch(normalized);
    } catch (err) {
      this.logger.error('Error dispatching message', err);
      this.callbacks.emit({
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
        fatal: false,
      });
    }
  }

  private async dispatch(msg: NormalizedMessage): Promise<void> {
    switch (msg.kind) {
      case 'user_speech_started':
        this.handleSpeechStarted();
        break;

      case 'user_speech_stopped':
        this.handleSpeechStopped();
        break;

      case 'audio_committed':
        this.handleAudioCommitted();
        break;

      case 'user_transcript_partial':
        this.handlePartialTranscription(msg.text ?? '');
        break;

      case 'user_transcript_final':
        this.handleFinalTranscription(msg.text ?? '');
        break;

      case 'assistant_delta':
        this.handleAssistantDelta(msg.text ?? '');
        break;

      case 'assistant_done':
        this.handleAssistantDone();
        break;

      case 'tool_call': {
        if (!msg.name || !msg.callId) {
          this.logger.error('Malformed tool_call: missing name or callId', msg);
          return;
        }
        await this.handleToolCall(msg.name, msg.args ?? {}, msg.callId);
        break;
      }

      case 'provider_error':
        this.callbacks.emit({
          type: 'error',
          error: new Error(`Provider error [${msg.errorCode}]: ${msg.errorMessage}`),
          fatal: false,
        });
        break;

      case 'session_created':
        // Informational — emitted as raw event already
        break;
    }
  }

  private handleSpeechStarted(): void {
    // Finalize any in-progress assistant message (user is interrupting)
    const interruptedId = this.conversationManager.finalizeAssistantMessage();
    if (interruptedId) {
      this.logger.info('User interrupted assistant — finalizing message');
    }

    this.conversationManager.getOrCreateEphemeralUserId();

    this.callbacks.emit({ type: 'user.speech.started' });

    // Cancel any ongoing assistant response
    this.callbacks.sendMessage({ type: 'response.cancel' });

    this.emitConversationUpdate();
  }

  private handleSpeechStopped(): void {
    this.conversationManager.updateEphemeralMessage({ status: 'speaking' });
    this.callbacks.emit({ type: 'user.speech.stopped' });
    this.emitConversationUpdate();
  }

  private handleAudioCommitted(): void {
    this.conversationManager.updateEphemeralMessage({
      text: 'Processing speech...',
      status: 'processing',
    });
    this.emitConversationUpdate();
  }

  private handlePartialTranscription(text: string): void {
    const displayText = text || 'User is speaking...';
    const ephemeralId = this.conversationManager.getEphemeralUserId();

    this.conversationManager.updateEphemeralMessage({
      text: displayText,
      status: 'speaking',
      isFinal: false,
    });

    this.callbacks.emit({
      type: 'user.transcript.partial',
      text: displayText,
      messageId: ephemeralId ?? '',
    });
    this.emitConversationUpdate();
  }

  private handleFinalTranscription(text: string): void {
    const ephemeralId = this.conversationManager.getEphemeralUserId();

    this.conversationManager.updateEphemeralMessage({
      text,
      isFinal: true,
      status: 'final',
    });
    this.conversationManager.clearEphemeralUserMessage();

    this.callbacks.emit({
      type: 'user.transcript.final',
      text,
      messageId: ephemeralId ?? '',
    });
    this.emitConversationUpdate();
  }

  private handleAssistantDelta(delta: string): void {
    const messageId = this.conversationManager.appendAssistantDelta(delta);

    this.callbacks.emit({
      type: 'assistant.delta',
      text: delta,
      messageId,
    });
    this.emitConversationUpdate();
  }

  private handleAssistantDone(): void {
    const messageId = this.conversationManager.finalizeAssistantMessage();

    if (!messageId) {
      // No assistant message to finalize — don't leak user text
      this.logger.warn('assistant.done received but no assistant message to finalize');
      this.callbacks.emit({ type: 'assistant.done', text: '', messageId: '' });
      this.emitConversationUpdate();
      return;
    }

    const messages = this.conversationManager.getMessages();
    const last = messages[messages.length - 1];

    this.callbacks.emit({
      type: 'assistant.done',
      text: last?.role === 'assistant' ? last.text : '',
      messageId,
    });
    this.emitConversationUpdate();
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>,
    callId: string,
  ): Promise<void> {
    this.callbacks.emit({ type: 'tool.called', name, args, callId });

    // Execute the tool
    const result = await this.toolRegistry.execute(name, args);

    this.callbacks.emit({ type: 'tool.result', name, result, callId });

    // Send function output back to model
    this.callbacks.sendMessage({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });

    // Request follow-up response
    this.callbacks.sendMessage({ type: 'response.create' });
  }

  private emitConversationUpdate(): void {
    this.callbacks.emit({
      type: 'conversation.updated',
      messages: [...this.conversationManager.getMessages()],
    });
  }
}
