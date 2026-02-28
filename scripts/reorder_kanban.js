const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://agebmwnaiytcjtxewsxm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZWJtd25haXl0Y2p0eGV3c3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxOTM2MCwiZXhwIjoyMDg2NDk1MzYwfQ.v50Xfg-fP1hMAjv1n4JtugAkYfWtFGu7e1vluEBO61I';
const restaurantId = '714a713b-697f-42eb-bfcb-b3099854fd6b';

const supabase = createClient(supabaseUrl, serviceKey);

const NEW_STAGES = [
    { name: 'Novo Lead (Roleta)', tag: 'lead_roleta' },
    { name: 'Agendamento', tag: 'lead_agendado' },
    { name: 'Montando Pedido', tag: 'escolhendo_lanche' },
    { name: 'Aguardando Pagto', tag: 'aguardando_pix' },
    { name: 'Pedidos (Cozinha)', tag: 'na_cozinha' },
    { name: 'Saiu para Entrega', tag: 'saiu_entrega' },
    { name: 'Finalizado (Ganho)', tag: 'pedido_concluido' },
    { name: 'Arquivado (Perda)', tag: 'lead_perdido' },
    { name: 'Atendimento Humano', tag: 'ajuda_humana' }
];

async function main() {
    console.log("--- REESTRUTURANDO KANBAN ---");

    // 1. Delete old stages for this restaurant (to start fresh and avoid unique constraint issues if any)
    // Actually, it's safer to just UPDATE them to avoid breaking foreign keys in 'chats'.
    // We'll get current stages first.
    const { data: currentStages } = await supabase
        .from('kanban_stages')
        .select('id, name')
        .eq('restaurant_id', restaurantId)
        .order('position');

    console.log(`Encontrados ${currentStages.length} estágios atuais.`);

    for (let i = 0; i < NEW_STAGES.length; i++) {
        const target = NEW_STAGES[i];
        if (i < currentStages.length) {
            // Update existing
            console.log(`Atualizando estágio ${currentStages[i].name} -> ${target.name}`);
            const { error } = await supabase
                .from('kanban_stages')
                .update({ name: target.name, position: i })
                .eq('id', currentStages[i].id);
            if (error) console.error("Erro update stage:", error);

            // Update or Insert Automation
            const { data: existingAuto } = await supabase
                .from('automations')
                .select('id')
                .eq('stage_id', currentStages[i].id)
                .maybeSingle();

            if (existingAuto) {
                await supabase.from('automations').update({
                    enabled: true,
                    trigger: target.tag
                }).eq('id', existingAuto.id);
            } else {
                await supabase.from('automations').insert({
                    restaurant_id: restaurantId,
                    stage_id: currentStages[i].id,
                    enabled: true,
                    trigger: target.tag
                });
            }
        } else {
            // Insert new
            console.log(`Criando novo estágio: ${target.name}`);
            const { data: newStage, error } = await supabase
                .from('kanban_stages')
                .insert({
                    restaurant_id: restaurantId,
                    name: target.name,
                    position: i
                })
                .select('id')
                .single();

            if (error) {
                console.error("Erro insert stage:", error);
            } else {
                await supabase.from('automations').insert({
                    restaurant_id: restaurantId,
                    stage_id: newStage.id,
                    enabled: true,
                    trigger: target.tag
                });
            }
        }
    }

    console.log("\n--- REESTRUTURAÇÃO CONCLUÍDA ---");
}

main();
