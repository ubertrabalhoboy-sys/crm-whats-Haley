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
    <div className="sticky bottom-0 z-[2] flex shrink-0 gap-2.5 border-t wa-divider bg-white/35 p-3 backdrop-blur-xl">
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
        className={`flex-1 rounded-xl border px-3.5 py-3 text-sm outline-none placeholder:text-slate-500 ${
          disabled
            ? "border-slate-900/10 bg-white/35 text-slate-500"
            : "border-slate-900/10 bg-white/55 text-slate-900 focus:border-[#128C7E]/30 focus:bg-white/70"
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
        className={`min-w-[110px] rounded-xl border px-3.5 py-3 text-sm font-semibold ${
          disabled || sending || !text.trim()
            ? "cursor-not-allowed border-slate-900/10 bg-white/35 text-slate-500"
            : "wa-btn wa-btn-primary cursor-pointer text-white"
        }`}
      >
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}
