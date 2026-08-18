// ============================================================
// Client Supabase côté navigateur (Realtime)
// Utilise la clé publishable publique (sûr côté client)
// ============================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Nouveau format Supabase : PUBLISHABLE_KEY (remplace l'ancien ANON_KEY)
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabasePublishableKey);
