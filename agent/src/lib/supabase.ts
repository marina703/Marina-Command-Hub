/* ============================================================
   MarinaAI — Browser-side Supabase Client

   Creates a singleton Supabase client for browser Auth flows.
   Uses ONLY the publishable anon key — never the service-role key.

   When VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing,
   isConfigured() returns false and the app shows a "staging
   configuration required" state instead of silently failing.
   ============================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

let client: SupabaseClient | null = null;

/** Whether the browser-side Supabase client has valid configuration. */
export function isConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseUrl.startsWith("https://") &&
      supabaseAnonKey !== "your-anon-key-here",
  );
}

/**
 * Get or create the singleton browser Supabase client.
 * Returns null when configuration is missing.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}