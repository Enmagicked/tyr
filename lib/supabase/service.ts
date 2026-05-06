import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Use in API routes that need to bypass RLS (inserting parse results, llm responses, etc.)
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
