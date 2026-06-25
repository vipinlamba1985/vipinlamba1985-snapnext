import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function looksLikeSupabaseKey(key) {
  return typeof key === 'string' && key.length > 20;
}

const isUrlValid = validateUrl(supabaseUrl);
const isAnonKeyValid = looksLikeSupabaseKey(supabaseAnonKey);
const isServiceKeyValid = looksLikeSupabaseKey(supabaseServiceKey);

export const isSupabaseConfigured = isUrlValid && isAnonKeyValid;
export const isSupabaseAdminConfigured = isUrlValid && isServiceKeyValid;

if (!isSupabaseConfigured && typeof window === 'undefined') {
  console.warn('[Supabase Warning] Supabase is not fully configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : null;

export const supabaseAdmin = (typeof window === 'undefined' && isSupabaseAdminConfigured)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null;
