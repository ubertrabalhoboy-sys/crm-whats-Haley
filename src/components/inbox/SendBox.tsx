"use client";

import { useState } from "react";

export default function SendBox({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div className="flex gap-2.5 border-t border-slate-900/10 bg-white p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const msg = text.trim();
            if (!msg || disabled || sending) return;

            setText("");
            setSending(true);
            onSend(msg).finally(() => setSending(false));
          }
        }}
        placeholder={disabled ? "Selecione uma conversa..." : "Digite sua mensagem"}
        disabled={disabled || sending}
        className={`flex-1 rounded-xl border px-3.5 py-3 outline-none ${
          disabled ? "border-slate-900/10 bg-slate-50" : "border-slate-900/10 bg-white"
        }`}
      />
      <button
        disabled={disabled || sending || !text.trim()}
        onClick={() => {
          const msg = text.trim();
          if (!msg) return;

          setText("");
          setSending(true);
          onSend(msg).finally(() => setSending(false));
        }}
        className={`min-w-[110px] rounded-xl border px-3.5 py-3 font-bold ${
          disabled || sending || !text.trim()
            ? "cursor-not-allowed border-slate-900/10 bg-gray-200 text-gray-500"
            : "cursor-pointer border-slate-900/10 bg-gray-900 text-white"
        }`}
      >
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}
