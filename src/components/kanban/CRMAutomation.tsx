"use client";

import React, { useState } from "react";
import { Bot, Save, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import useSWR from "swr";
import { useToast } from "@/components/shared/Toast";

type Stage = {
    id: string;
    name: string;
};

type Automation = {
    id: string;
    stage_id: string;
    restaurant_id: string;
    trigger: string | null;
    enabled: boolean;
};

interface CRMAutomationProps {
    stages: Stage[];
    restaurantId: string;
}

export default function CRMAutomation({ stages, restaurantId }: CRMAutomationProps) {
    const { showToast } = useToast();
    const supabase = createSupabaseBrowserClient();

    const [localAutomations, setLocalAutomations] = useState<Record<string, Automation>>({});
    const [savingAutomations, setSavingAutomations] = useState<Record<string, boolean>>({});

    // Fetch automations only when this component is mounted
    const { mutate: mutateAutomations } = useSWR(["kanban_automations", restaurantId], async () => {
        const { data, error } = await supabase
            .from("automations")
            .select("*")
            .eq("restaurant_id", restaurantId);

        if (error) throw error;

        const authMap: Record<string, Automation> = {};
        (data as Automation[]).forEach((auth) => {
            authMap[auth.stage_id] = auth;
        });

        return authMap;
    }, {
        revalidateOnFocus: false,
        onSuccess: (data) => {
            setLocalAutomations(data);
        }
    });

    const handleAutomationChange = (stageId: string, field: keyof Automation, value: string | boolean) => {
        setLocalAutomations((prev) => ({
            ...prev,
            [stageId]: {
                ...prev[stageId],
                stage_id: stageId,
                [field]: value,
            },
        }));
    };

    const saveAutomation = async (stageId: string) => {
        const auto = localAutomations[stageId];
        if (!auto) return;

        setSavingAutomations((prev) => ({ ...prev, [stageId]: true }));
        try {
            const { error } = await supabase
                .from("automations")
                .upsert({
                    stage_id: stageId,
                    restaurant_id: restaurantId,
                    trigger: auto.trigger,
                    enabled: auto.enabled || false,
                }, { onConflict: "restaurant_id,stage_id" });

            if (error) throw error;
            mutateAutomations();
            showToast("Automação salva com sucesso!", "success");
        } catch (err) {
            console.error("Erro ao salvar automação:", err);
            showToast("Erro ao salvar automação.", "error");
        } finally {
            setSavingAutomations((prev) => ({ ...prev, [stageId]: false }));
        }
    };

    return (
        <div className="relative flex-1 min-h-0 mx-2 flex flex-col">
            <div className="flex gap-6 overflow-x-auto h-full px-8 pb-4 pt-2 no-scrollbar scroll-smooth flex-1">
                {stages.map((stage) => {
                    const autoObj = localAutomations[stage.id] || { trigger: "", enabled: false };
                    const isSaving = savingAutomations[stage.id] || false;

                    return (
                        <div key={`auto-${stage.id}`} className="w-80 shrink-0 flex flex-col h-[calc(100vh-250px)]">
                            {/* Cabeçalho da coluna */}
                            <div className="flex shrink-0 items-center justify-between rounded-[2rem] border border-[#07a0c3]/30 bg-white/55 px-6 py-5 shadow-lg shadow-[#07a0c3]/10 backdrop-blur-xl mb-4 group transition-colors">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="h-2 w-2 rounded-full bg-[#07a0c3] shadow-[0_0_8px_#07a0c3] shrink-0" />
                                    <h2 className="text-[12px] font-[900] uppercase tracking-[0.15em] text-[#086788] truncate mr-2 flex-1">
                                        {stage.name}
                                    </h2>
                                </div>
                            </div>

                            {/* Configuração de Automação */}
                            <div className="flex-1 flex flex-col p-6 rounded-[2.5rem] border border-white/60 bg-white/40 shadow-sm backdrop-blur-xl">
                                <div className="flex items-center justify-between border-b border-white/50 pb-4 mb-4">
                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-[#086788] flex items-center gap-2">
                                        <Bot size={16} className="text-[#07a0c3]" /> Gatilho Fiqon
                                    </h3>

                                    {/* Toggle Switch */}
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={autoObj.enabled || false}
                                            onChange={(e) => handleAutomationChange(stage.id, "enabled", e.target.checked)}
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#07a0c3]"></div>
                                    </label>
                                </div>

                                <div className="flex-1 flex flex-col gap-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Tag do Fiqon</label>
                                        <input
                                            type="text"
                                            value={autoObj.trigger || ""}
                                            onChange={(e) => handleAutomationChange(stage.id, "trigger", e.target.value)}
                                            className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-[#086788] shadow-inner focus:outline-none focus:border-[#07a0c3]/50 focus:ring-2 focus:ring-[#07a0c3]/20"
                                            placeholder="ex: gatilho_pedido_pronto"
                                        />
                                        <p className="text-[9px] text-slate-400 font-semibold italic mt-1 leading-relaxed">
                                            Digite a tag exata que o Fiqon está aguardando para disparar o bloco de desconto correspondente.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => saveAutomation(stage.id)}
                                    disabled={isSaving}
                                    className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#086788] hover:bg-[#065370] transition-colors text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50 shadow-md shadow-[#086788]/20"
                                >
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isSaving ? "Salvando..." : "Salvar Automação"}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
