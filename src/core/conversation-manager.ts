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

/**
 * Manages conversation messages and ephemeral user message tracking.
 * No storage — consumers persist via `conversation.updated` events.
 */
export class ConversationManager {
  private messages: ConversationMessage[] = [];
  private ephemeralUserMessageId: string | null = null;

  getMessages(): ConversationMessage[] {
    return this.messages;
  }

  setMessages(messages: ConversationMessage[]): void {
    this.messages = messages;
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
    return msg;
  }

  /**
   * Append text to the last assistant message, or create a new one.
   * Returns the message ID.
   */
  appendAssistantDelta(delta: string): string {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === 'assistant' && !last.isFinal) {
      last.text += delta;
      this.messages = [...this.messages]; // trigger new reference
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
      last.isFinal = true;
      this.messages = [...this.messages]; // trigger new reference
      return last.id;
    }
    return null;
  }
}
