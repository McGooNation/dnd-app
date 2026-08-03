"use client";

import { useState } from "react";
import { ChatMessage } from "shared";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, onSend }: Props) {
  const [text, setText] = useState("");

  return (
    <section className="chat">
      <p className="eyebrow">Table talk</p>
      <div className="scroll">
        {messages.length === 0 && <p className="empty">No messages yet. Say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className="msg">
            <span className="who" style={{ color: m.user.color }}>{m.user.name}</span>
            <span className="text">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the table…"
          maxLength={2000}
        />
        <button type="submit">Send</button>
      </form>

      <style jsx>{`
        .chat {
          background: var(--panel);
          padding: 24px;
          display: flex;
          flex-direction: column;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 12px;
        }
        .scroll {
          flex: 1;
          min-height: 300px;
          max-height: 60vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .empty { color: var(--parchment-dim); font-size: 14px; }
        .msg { display: flex; gap: 8px; font-size: 14px; line-height: 1.5; }
        .who { font-family: var(--font-mono); font-weight: 700; flex-shrink: 0; }
        .text { color: var(--parchment); }
        form { display: flex; gap: 10px; }
        input {
          flex: 1;
          background: var(--ink);
          border: 1px solid var(--rule);
          color: var(--parchment);
          padding: 12px 14px;
          border-radius: 3px;
          font-family: var(--font-body);
          font-size: 14px;
        }
        button {
          background: var(--panel-raised);
          border: 1px solid var(--gold);
          color: var(--gold);
          padding: 0 20px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        button:hover { background: var(--gold); color: var(--ink); }
      `}</style>
    </section>
  );
}
