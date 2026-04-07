import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from '../core/conversation-manager';

describe('Conversation manager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  describe('tracks a conversation between user and assistant', () => {
    it('records a user message with unique ID', () => {
      const msg = manager.createUserMessage('hello');
      expect(msg.role).toBe('user');
      expect(msg.text).toBe('hello');
      expect(msg.isFinal).toBe(true);
      expect(msg.id).toBeTruthy();
      expect(manager.getMessages()).toHaveLength(1);
    });

    it('records an assistant message', () => {
      const msg = manager.createAssistantMessage('hi');
      expect(msg.role).toBe('assistant');
      expect(msg.text).toBe('hi');
      expect(manager.getMessages()).toHaveLength(1);
    });

    it('assigns unique IDs to every message', () => {
      const m1 = manager.createUserMessage('a');
      const m2 = manager.createUserMessage('b');
      expect(m1.id).not.toBe(m2.id);
    });

    it('clears everything on reset', () => {
      manager.createUserMessage('a');
      manager.getOrCreateEphemeralUserId();
      manager.reset();
      expect(manager.getMessages()).toHaveLength(0);
      expect(manager.getEphemeralUserId()).toBeNull();
    });
  });

  describe('accumulates streaming assistant text', () => {
    it('starts a new assistant message on first delta', () => {
      manager.appendAssistantDelta('Hello');
      const msgs = manager.getMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('Hello');
      expect(msgs[0].role).toBe('assistant');
      expect(msgs[0].isFinal).toBe(false);
    });

    it('builds up text across multiple deltas', () => {
      manager.appendAssistantDelta('Hello');
      manager.appendAssistantDelta(' world');
      const msgs = manager.getMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('Hello world');
    });

    it('marks message as complete when finalized', () => {
      manager.appendAssistantDelta('test');
      manager.finalizeAssistantMessage();
      expect(manager.getMessages()[0].isFinal).toBe(true);
    });

    it('starts a new message after previous one is finalized', () => {
      manager.appendAssistantDelta('First');
      manager.finalizeAssistantMessage();
      manager.appendAssistantDelta('Second');
      const msgs = manager.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[0].text).toBe('First');
      expect(msgs[1].text).toBe('Second');
    });

    it('never mutates existing message objects', () => {
      manager.appendAssistantDelta('Hello');
      const before = manager.getMessages()[0];
      manager.appendAssistantDelta(' world');
      const after = manager.getMessages()[0];
      expect(before).not.toBe(after);
      expect(before.text).toBe('Hello');
      expect(after.text).toBe('Hello world');
    });

    it('does not mutate on finalization either', () => {
      manager.appendAssistantDelta('test');
      const before = manager.getMessages()[0];
      manager.finalizeAssistantMessage();
      const after = manager.getMessages()[0];
      expect(before).not.toBe(after);
      expect(before.isFinal).toBe(false);
      expect(after.isFinal).toBe(true);
    });

    it('returns null when nothing to finalize', () => {
      expect(manager.finalizeAssistantMessage()).toBeNull();
    });

    it('returns null when already finalized', () => {
      manager.appendAssistantDelta('test');
      manager.finalizeAssistantMessage();
      expect(manager.finalizeAssistantMessage()).toBeNull();
    });
  });

  describe('handles ephemeral messages while user is speaking', () => {
    it('shows a placeholder message while user speaks', () => {
      const { id, message } = manager.getOrCreateEphemeralUserId();
      expect(id).toBeTruthy();
      expect(message).not.toBeNull();
      expect(message!.role).toBe('user');
      expect(message!.status).toBe('speaking');
      expect(message!.isFinal).toBe(false);
    });

    it('reuses the same ephemeral message across calls', () => {
      const first = manager.getOrCreateEphemeralUserId();
      const second = manager.getOrCreateEphemeralUserId();
      expect(second.id).toBe(first.id);
      expect(second.message).toBeNull();
    });

    it('updates the ephemeral message text as speech arrives', () => {
      manager.getOrCreateEphemeralUserId();
      manager.updateEphemeralMessage({ text: 'typing...', status: 'speaking' });
      const msgs = manager.getMessages();
      expect(msgs[0].text).toBe('typing...');
    });

    it('can be cleared once speech processing is done', () => {
      manager.getOrCreateEphemeralUserId();
      manager.clearEphemeralUserMessage();
      expect(manager.getEphemeralUserId()).toBeNull();
      expect(manager.getMessages()).toHaveLength(1); // message stays in history
    });

    it('ignores updates when no ephemeral message exists', () => {
      manager.updateEphemeralMessage({ text: 'nope' });
      expect(manager.getMessages()).toHaveLength(0);
    });
  });

  describe('keeps message history within limits', () => {
    it('drops oldest messages when over the limit', () => {
      const small = new ConversationManager(3);
      small.createUserMessage('1');
      small.createUserMessage('2');
      small.createUserMessage('3');
      small.createUserMessage('4');
      const msgs = small.getMessages();
      expect(msgs).toHaveLength(3);
      expect(msgs[0].text).toBe('2');
      expect(msgs[2].text).toBe('4');
    });

    it('leaves messages alone when under the limit', () => {
      const small = new ConversationManager(5);
      small.createUserMessage('1');
      small.createUserMessage('2');
      expect(small.getMessages()).toHaveLength(2);
    });
  });
});
