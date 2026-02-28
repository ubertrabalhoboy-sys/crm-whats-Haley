const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://agebmwnaiytcjtxewsxm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZWJtd25haXl0Y2p0eGV3c3htIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxOTM2MCwiZXhwIjoyMDg2NDk1MzYwfQ.v50Xfg-fP1hMAjv1n4JtugAkYfWtFGu7e1vluEBO61I';

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
    const { data: restaurants, error: restError } = await supabase.from('restaurants').select('id, name');
    if (restError) return console.error("Erro restaurantes:", restError);

    console.log("Restaurantes encontrados:", restaurants.length);

    for (const r of restaurants) {
        console.log(`\n--- RESTAURANTE: ${r.name} (${r.id}) ---`);
        const { count: stageCount } = await supabase
            .from('kanban_stages')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', r.id);

        console.log("Estágios Kanban:", stageCount || 0);

        const { count: autoCount } = await supabase
            .from('automations')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', r.id);

        console.log("Automações:", autoCount || 0);

        if (stageCount > 0) {
            const { data: stages } = await supabase.from('kanban_stages').select('name, position').eq('restaurant_id', r.id).order('position');
            console.log("Stages:", JSON.stringify(stages));
        }
    }
}

main();
