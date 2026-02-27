const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data, error } = await supabase.from('restaurants').select('*').limit(1);
    if (error) {
        console.error("Error fetching restaurants:", error);
    } else if (data && data.length > 0) {
        console.log("Restaurant columns:", Object.keys(data[0]));
    } else {
        console.log("No restaurants found.");
    }
}
main();
