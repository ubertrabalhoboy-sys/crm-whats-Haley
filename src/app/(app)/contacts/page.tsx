"use client";

import { useState, useMemo } from "react";
import { Users, Phone, Target, Gift, Ticket, Download, Search, FilterX } from "lucide-react";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ChatContact = {
    id: string;
    wa_chat_id: string;
    origem_lead: string | null;
    cupom_ganho: string | null;
    contacts: {
        name: string | null;
        phone: string | null;
    } | null;
};

export default function ContactsPage() {
    const supabase = createSupabaseBrowserClient();

    const fetchContacts = async () => {
        const { data, error } = await supabase
            .from("chats")
            .select(`
                id,
                wa_chat_id,
                origem_lead,
                cupom_ganho,
                contacts (
                    name,
                    phone
                )
            `)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return data as unknown as ChatContact[];
    };

    const { data: contacts, error, isLoading } = useSWR<ChatContact[]>("crm_contacts", fetchContacts);

    // Filters state
    const [searchQuery, setSearchQuery] = useState("");
    const [filterOrigin, setFilterOrigin] = useState<"all" | "roleta" | "direto">("all");
    const [filterCupom, setFilterCupom] = useState<"all" | "with_cupom" | "no_cupom">("all");

    // Compute filtered contacts
    const filteredContacts = useMemo(() => {
        if (!contacts) return [];
        return contacts.filter((c) => {
            const rawName = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "";
            const finalName = rawName.includes("@") ? rawName.split("@")[0] : rawName;
            const phone = c.contacts?.phone || c.wa_chat_id || "";

            // 1. Search Query (Name or Phone)
            const matchesSearch = searchQuery === "" ||
                finalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                phone.includes(searchQuery);

            // 2. Filter by Origin
            const isRoleta = c.origem_lead?.toLowerCase() === "roleta";
            const matchesOrigin = filterOrigin === "all" ||
                (filterOrigin === "roleta" && isRoleta) ||
                (filterOrigin === "direto" && !isRoleta);

            // 3. Filter by Cupom
            const hasCupom = !!c.cupom_ganho;
            const matchesCupom = filterCupom === "all" ||
                (filterCupom === "with_cupom" && hasCupom) ||
                (filterCupom === "no_cupom" && !hasCupom);

            return matchesSearch && matchesOrigin && matchesCupom;
        });
    }, [contacts, searchQuery, filterOrigin, filterCupom]);

    const clearFilters = () => {
        setSearchQuery("");
        setFilterOrigin("all");
        setFilterCupom("all");
    };

    const handleExportCSV = () => {
        if (!contacts || contacts.length === 0) return;

        const header = ["Nome", "Telefone", "Desconto", "Origem do Lead"];
        const rows = contacts.map((c) => {
            const rawName = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";
            const name = rawName.includes("@") ? rawName.split("@")[0] : rawName;
            const phone = c.contacts?.phone || c.wa_chat_id || "";
            const cleanPhone = phone.includes("@") ? phone.split("@")[0] : phone;
            const cupom = c.cupom_ganho || "";
            const origem = c.origem_lead || "Direto";
            return [name, cleanPhone, cupom, origem].map(v => `"${v.replace(/"/g, '""')}"`);
        });

        const csvContent = "\uFEFF" + [header.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `contatos_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

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
                <button
                    onClick={handleExportCSV}
                    disabled={!contacts || contacts.length === 0}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[#086788] text-white hover:bg-[#07a0c3] shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Download size={14} />
                    Exportar CSV
                </button>
            </div>

            {/* Contacts Table Section */}
            <div className="flex-1 min-h-0 mx-2 flex flex-col p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg shadow-[#086788]/5 rounded-[2.5rem] relative z-10 overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-black uppercase tracking-widest text-[#086788] flex items-center gap-3 shrink-0">
                        <Users size={20} className="text-[#07a0c3]" />
                        Lista de Contatos
                    </h2>

                    {/* Filter Bar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar nome ou fone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 text-xs font-semibold bg-white/60 border border-white uppercase placeholder:normal-case placeholder:font-normal rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all w-full md:w-48"
                            />
                        </div>

                        <select
                            value={filterOrigin}
                            onChange={(e) => setFilterOrigin(e.target.value as any)}
                            className="px-3 py-2 text-xs font-bold uppercase text-slate-600 bg-white/60 border border-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all"
                        >
                            <option value="all">Todas Origens</option>
                            <option value="roleta">Roleta Fiqon</option>
                            <option value="direto">Diretamente</option>
                        </select>

                        <select
                            value={filterCupom}
                            onChange={(e) => setFilterCupom(e.target.value as any)}
                            className="px-3 py-2 text-xs font-bold uppercase text-slate-600 bg-white/60 border border-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#086788]/20 transition-all"
                        >
                            <option value="all">Todos Cupons</option>
                            <option value="with_cupom">Com Cupom</option>
                            <option value="no_cupom">Sem Cupom</option>
                        </select>

                        {(searchQuery || filterOrigin !== 'all' || filterCupom !== 'all') && (
                            <button
                                onClick={clearFilters}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                title="Limpar Filtros"
                            >
                                <FilterX size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="w-full overflow-hidden overflow-x-auto custom-scroll pb-2">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Telefone</th>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400">Desconto</th>
                                <th className="pb-4 pt-2 px-4 border-b border-white/60 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Origem do Lead</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-sm font-bold text-slate-400">Carregando contatos...</td>
                                </tr>
                            )}
                            {error && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-sm font-bold text-red-400">Erro ao buscar contatos.</td>
                                </tr>
                            )}
                            {contacts && filteredContacts.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-sm font-bold text-slate-400">
                                        Nenhum contato encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            )}
                            {filteredContacts.map((c) => {
                                const rawName = c.contacts?.name || c.contacts?.phone || c.wa_chat_id || "Sem nome";
                                const finalName = rawName.includes("@") ? rawName.split("@")[0] : rawName;
                                const phone = c.contacts?.phone || c.wa_chat_id || "S/ Número";
                                const isRoleta = c.origem_lead?.toLowerCase() === "roleta";

                                return (
                                    <tr key={c.id} className="group hover:bg-white/50 transition-colors border-b border-white/30 last:border-0">
                                        <td className="py-4 px-4">
                                            <div className="font-bold text-sm text-[#086788] group-hover:text-[#07a0c3] transition-colors">{finalName}</div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} className="text-slate-400" />
                                                <span className="text-sm font-semibold text-slate-600">{phone}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            {c.cupom_ganho ? (
                                                <span className="flex items-center gap-1.5 w-fit text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100" title={c.cupom_ganho}>
                                                    <Ticket size={12} /> {c.cupom_ganho}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] italic text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {isRoleta ? (
                                                    <span className="flex items-center gap-1.5 text-[11px] font-black uppercase text-purple-600 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200 shadow-sm shadow-purple-500/10">
                                                        <Gift size={12} /> Roleta FiQon
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold uppercase text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">
                                                        {c.origem_lead || 'Direto'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
