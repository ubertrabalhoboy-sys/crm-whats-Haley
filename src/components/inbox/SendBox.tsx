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
        className={`flex-1 rounded-[2rem] border px-3.5 py-3 text-sm outline-none placeholder:text-slate-500 transition-colors ${disabled
            ? "border-white/50 bg-white/50 text-slate-500"
            : "border-white bg-white/80 text-slate-900 focus:border-[#07a0c3]/50 focus:bg-white"
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
        className={`min-w-[110px] rounded-[2rem] border border-transparent px-3.5 py-3 text-sm font-semibold transition-colors ${disabled || sending || !text.trim()
            ? "cursor-not-allowed bg-white/50 text-slate-500"
            : "cursor-pointer text-white bg-[#086788] hover:bg-[#07a0c3]"
          }`}
      >
        {sending ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}
