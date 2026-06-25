import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
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
  console.warn('[Supabase Warning] Supabase is not fully configured.');
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
