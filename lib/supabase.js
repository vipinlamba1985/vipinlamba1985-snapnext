import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validation helpers
function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

function validateAnonKey(key) {
  return typeof key === 'string' && key.startsWith('sb_publishable_');
}

function validateServiceKey(key) {
  return typeof key === 'string' && key.startsWith('sb_secret_');
}

const isUrlValid = validateUrl(supabaseUrl);
const isAnonKeyValid = validateAnonKey(supabaseAnonKey);
const isServiceKeyValid = validateServiceKey(supabaseServiceKey);

export const isSupabaseConfigured = isUrlValid && isAnonKeyValid;

// Log warnings safely but do not crash
if (!isSupabaseConfigured) {
  if (typeof window === 'undefined') {
    console.warn('[Supabase Warning] Supabase is not fully or correctly configured.');
    if (!supabaseUrl) console.warn(' - NEXT_PUBLIC_SUPABASE_URL is missing.');
    else if (!isUrlValid) console.warn(` - NEXT_PUBLIC_SUPABASE_URL ("${supabaseUrl}") is invalid. It must look like: https://[ref].supabase.co`);
    
    if (!supabaseAnonKey) console.warn(' - NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.');
    else if (!isAnonKeyValid) console.warn(' - NEXT_PUBLIC_SUPABASE_ANON_KEY is invalid. It must start with "sb_publishable_".');
  }
}

if (typeof window === 'undefined' && isSupabaseConfigured && !isServiceKeyValid) {
  console.warn('[Supabase Warning] SUPABASE_SERVICE_ROLE_KEY is missing or invalid. It must start with "sb_secret_".');
}

// Client-side / Anon Supabase instance
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : null;

// Server-side / Admin Supabase instance (only created if service key is valid and we are on the server)
export const supabaseAdmin = (typeof window === 'undefined' && isSupabaseConfigured && isServiceKeyValid)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null;
