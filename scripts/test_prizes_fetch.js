const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const restaurantId = '714a713b-697f-42eb-bfcb-b3099854fd6b';

async function testFetchPrizes() {
    console.log(`Testando busca de prêmios para o restaurante: ${restaurantId}`);

    const { data: prizes, error } = await supabase
        .from('roulette_prizes')
        .select('id, label, trigger_tag, chance_percentage, color')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Erro na busca:', error.message);
        return;
    }

    console.log(`Prêmios encontrados: ${prizes.length}`);
    console.log(JSON.stringify(prizes, null, 2));

    const { data: restaurant, error: resError } = await supabase
        .from('restaurants')
        .select('name, logo_url, roulette_headline')
        .eq('id', restaurantId)
        .maybeSingle();

    if (resError) {
        console.error('Erro ao buscar restaurante:', resError.message);
    } else {
        console.log('Dados do Restaurante:', JSON.stringify(restaurant, null, 2));
    }
}

testFetchPrizes();
