const PUBLIC_SUPABASE_URL_RAW = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_ANON_KEY_RAW = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: string | undefined): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
        throw new Error(
            `[env-public] Missing required public environment variable: ${name}.`
        );
    }
    return normalized;
}

export const PUBLIC_SUPABASE_URL = requirePublicEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    PUBLIC_SUPABASE_URL_RAW
);
export const PUBLIC_SUPABASE_ANON_KEY = requirePublicEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    PUBLIC_SUPABASE_ANON_KEY_RAW
);
