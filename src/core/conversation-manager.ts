import type { ConversationMessage } from './types';

function generateId(): string {
  // crypto.randomUUID() is available in Hermes (RN >= 0.72)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEFAULT_MAX_MESSAGES = 200;

/**
 * Manages conversation messages and ephemeral user message tracking.
 * No storage — consumers persist via `conversation.updated` events.
 */
export class ConversationManager {
  private messages: ConversationMessage[] = [];
  private ephemeralUserMessageId: string | null = null;
  private maxMessages: number;

  constructor(maxMessages?: number) {
    this.maxMessages = maxMessages ?? DEFAULT_MAX_MESSAGES;
  }

  getMessages(): ConversationMessage[] {
    return this.messages;
  }

  setMessages(messages: ConversationMessage[]): void {
    this.messages = messages;
  }

  reset(): void {
    this.messages = [];
    this.ephemeralUserMessageId = null;
  }

  /**
   * Get or create an ephemeral user message (shown while user is speaking).
   * Returns { id, message } where message is non-null only when newly created.
   */
  getOrCreateEphemeralUserId(): { id: string; message: ConversationMessage | null } {
    if (this.ephemeralUserMessageId) {
      return { id: this.ephemeralUserMessageId, message: null };
    }

    const id = generateId();
    this.ephemeralUserMessageId = id;

    const message: ConversationMessage = {
      id,
      role: 'user',
      text: '',
      timestamp: new Date().toISOString(),
      isFinal: false,
      status: 'speaking',
    };

    this.messages = [...this.messages, message];
    this.pruneIfNeeded();
    return { id, message };
  }

  getEphemeralUserId(): string | null {
    return this.ephemeralUserMessageId;
  }

  clearEphemeralUserMessage(): void {
    this.ephemeralUserMessageId = null;
  }

  /**
   * Update the ephemeral user message with partial data.
   */
  updateEphemeralMessage(partial: Partial<ConversationMessage>): void {
    const id = this.ephemeralUserMessageId;
    if (!id) return;

    this.messages = this.messages.map((m) =>
      m.id === id ? { ...m, ...partial } : m
    );
  }

  createUserMessage(text: string): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
      isFinal: true,
      status: 'final',
    };
    this.messages = [...this.messages, msg];
    this.pruneIfNeeded();
    return msg;
  }

  createAssistantMessage(text: string): ConversationMessage {
    const msg: ConversationMessage = {
      id: generateId(),
      role: 'assistant',
      text,
      timestamp: new Date().toISOString(),
      isFinal: false,
    };
    this.messages = [...this.messages, msg];
    this.pruneIfNeeded();
    return msg;
  }

  /**
   * Append text to the last assistant message, or create a new one.
   * Returns the message ID.
   */
  appendAssistantDelta(delta: string): string {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant' && !last.isFinal) {
      // Immutable update — never mutate the existing message object
      const updated = { ...last, text: last.text + delta };
      this.messages = [...this.messages.slice(0, -1), updated];
      return last.id;
    }
    const msg = this.createAssistantMessage(delta);
    return msg.id;
  }

  /**
   * Mark the last assistant message as final.
   */
  finalizeAssistantMessage(): string | null {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant' && !last.isFinal) {
      // Immutable update — never mutate the existing message object
      const updated = { ...last, isFinal: true };
      this.messages = [...this.messages.slice(0, -1), updated];
      return last.id;
    }
    return null;
  }

  /**
   * Prune oldest messages if over the limit.
   * Never prunes the ephemeral message currently being spoken.
   */
  private pruneIfNeeded(): void {
    if (this.messages.length <= this.maxMessages) return;

    const excess = this.messages.length - this.maxMessages;
    this.messages = this.messages.slice(excess);
  }
}
