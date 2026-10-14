import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@isachess/engine';

const MAX_LENGTH = 200;

export function Chat({ messages, me, onSend }: { messages: ChatMessage[]; me: string | null; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <section className="chat" aria-label="Chat">
      <ol className="chat-list" ref={list} data-testid="chat-list">
        {messages.length === 0 && <li className="chat-empty">Say hello to your opponent.</li>}
        {messages.map((m, i) => (
          <li key={i} className={m.playerId === me ? 'mine' : ''}>
            <strong>{m.from}</strong> {m.text}
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          aria-label="Chat message"
          autoComplete="off"
          data-testid="chat-input"
        />
        <button type="submit" data-testid="chat-send">Send</button>
      </form>
    </section>
  );
}
