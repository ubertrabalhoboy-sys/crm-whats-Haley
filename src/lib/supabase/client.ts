"use client";

import { createBrowserClient } from "@supabase/ssr";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/shared/env-public";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY
  );
}
