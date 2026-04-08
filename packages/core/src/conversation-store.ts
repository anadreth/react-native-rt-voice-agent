import type { ConversationMessage } from './types';
import { generateId } from './utils';

const DEFAULT_MAX_MESSAGES = 200;

export class ConversationStore {
  private messages: ConversationMessage[] = [];
  private ephemeralUserMessageId: string | null = null;

  constructor(private readonly maxMessages = DEFAULT_MAX_MESSAGES) {}

  getMessages(): ConversationMessage[] {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
    this.ephemeralUserMessageId = null;
  }

  getOrCreateEphemeralUserId(): { id: string; message: ConversationMessage | null } {
    if (this.ephemeralUserMessageId) {
      return { id: this.ephemeralUserMessageId, message: null };
    }

    const message: ConversationMessage = {
      id: generateId(),
      role: 'user',
      text: '',
      timestamp: new Date().toISOString(),
      isFinal: false,
      status: 'speaking',
    };

    this.ephemeralUserMessageId = message.id;
    this.messages = [...this.messages, message];
    this.pruneIfNeeded();
    return { id: message.id, message };
  }

  getEphemeralUserId(): string | null {
    return this.ephemeralUserMessageId;
  }

  clearEphemeralUserMessage(): void {
    this.ephemeralUserMessageId = null;
  }

  updateEphemeralMessage(partial: Partial<ConversationMessage>): void {
    const id = this.ephemeralUserMessageId;
    if (!id) return;

    this.messages = this.messages.map((message) =>
      message.id === id ? { ...message, ...partial } : message,
    );
  }

  createUserMessage(text: string): ConversationMessage {
    const message: ConversationMessage = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      isFinal: true,
      status: 'final',
    };

    this.messages = [...this.messages, message];
    this.pruneIfNeeded();
    return message;
  }

  appendAssistantDelta(delta: string): string {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant' && !last.isFinal) {
      const updated = { ...last, text: last.text + delta };
      this.messages = [...this.messages.slice(0, -1), updated];
      return updated.id;
    }

    const message: ConversationMessage = {
      id: generateId(),
      role: 'assistant',
      text: delta,
      timestamp: new Date().toISOString(),
      isFinal: false,
    };
    this.messages = [...this.messages, message];
    this.pruneIfNeeded();
    return message.id;
  }

  finalizeAssistantMessage(finalText?: string): { id: string; text: string } | null {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant' && !last.isFinal) {
      const updated = {
        ...last,
        text: finalText ?? last.text,
        isFinal: true,
        status: 'final' as const,
      };
      this.messages = [...this.messages.slice(0, -1), updated];
      return { id: updated.id, text: updated.text };
    }

    if (finalText) {
      const message: ConversationMessage = {
        id: generateId(),
        role: 'assistant',
        text: finalText,
        timestamp: new Date().toISOString(),
        isFinal: true,
        status: 'final',
      };
      this.messages = [...this.messages, message];
      this.pruneIfNeeded();
      return { id: message.id, text: message.text };
    }

    return null;
  }

  private pruneIfNeeded(): void {
    if (this.messages.length <= this.maxMessages) return;

    const excess = this.messages.length - this.maxMessages;
    this.messages = this.messages.slice(excess);
  }
}
