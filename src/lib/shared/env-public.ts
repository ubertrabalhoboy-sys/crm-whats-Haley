function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(
            `[env-public] Missing required public environment variable: ${name}.`
        );
    }
    return value.trim();
}

export const PUBLIC_SUPABASE_URL = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
export const PUBLIC_SUPABASE_ANON_KEY = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
