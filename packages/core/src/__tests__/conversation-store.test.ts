import { describe, expect, it } from 'vitest';
import { ConversationStore } from '../conversation-store';

describe('ConversationStore', () => {
  it('records user and assistant messages', () => {
    const store = new ConversationStore();
    store.createUserMessage('hello');
    store.appendAssistantDelta('hi');
    store.finalizeAssistantMessage();

    const messages = store.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].isFinal).toBe(true);
  });

  it('reuses the same ephemeral user message while speaking', () => {
    const store = new ConversationStore();
    const first = store.getOrCreateEphemeralUserId();
    const second = store.getOrCreateEphemeralUserId();

    expect(first.id).toBe(second.id);
    expect(second.message).toBeNull();
  });

  it('creates a final assistant message when only final text arrives', () => {
    const store = new ConversationStore();
    const final = store.finalizeAssistantMessage('done');

    expect(final?.text).toBe('done');
    expect(store.getMessages()[0].isFinal).toBe(true);
  });
});
