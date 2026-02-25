"use client";

import { Users, Phone, Target } from "lucide-react";

export default function ContactsPage() {
    const dummyContacts = [
        { id: 1, name: "Maria Oliveira", phone: "11999887766", origin: "Roleta Gamificada" },
        { id: 2, name: "João Pedro", phone: "11977665544", origin: "Link da Bio (Insta)" },
        { id: 3, name: "Ana Beatriz", phone: "11955443322", origin: "Campanha Ifood" },
        { id: 4, name: "Carlos Souza", phone: "11933221100", origin: "Orgânico" },
    ];

    return (
        <div className="relative h-full flex flex-col overflow-y-auto custom-scroll w-full px-2 pb-6">
            {/* Pattern de fundo */}
            <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            {/* Header */}
            <div className="mb-8 mt-2 flex items-center justify-between rounded-[2.5rem] border border-white/60 bg-white/40 px-8 py-6 shadow-lg shadow-[#086788]/5 backdrop-blur-xl relative z-10 shrink-0 mx-2">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#086788] to-[#07a0c3] text-white shadow-lg shadow-[#086788]/20">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-[#086788] leading-none">
                            Contatos
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#07a0c3]">
                            Gestão da Base de Clientes do WhatsApp
                        </p>
                    </div>
                </div>
            </div>

            {/* Contacts Table Section */}
            <div className="flex-1 min-h-0 mx-2 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] relative z-10 overflow-hidden">
                <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] mb-6 flex items-center gap-3">
                    <Users size={20} className="text-[#07a0c3]" />
                    Lista de Contatos
                </h2>

                <div className="w-full overflow-hidden overflow-x-auto custom-scroll pb-2">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Telefone</th>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Origem do Lead</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dummyContacts.map((c) => (
                                <tr key={c.id} className="group hover:bg-white/50 transition-colors border-b border-white/30 last:border-0">
                                    <td className="py-4 px-4">
                                        <div className="font-bold text-sm text-[#086788] group-hover:text-[#07a0c3] transition-colors">{c.name}</div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-2">
                                            <Phone size={14} className="text-slate-400" />
                                            <span className="text-sm font-semibold text-slate-600">{c.phone}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-[11px] font-black uppercase text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">{c.origin}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
