import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim().replace(/\/+$/, '');
  return trimmed.replace(/\/rest\/v1$/i, '');
}

function envUrl() {
  return normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
}

function envAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

function envServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co') && !parsed.pathname.includes('/rest/v1');
  } catch {
    return false;
  }
}

function validateKey(key) {
  return typeof key === 'string' && key.length > 20;
}

export const supabaseUrl = envUrl();
export const supabaseAnonKey = envAnonKey();
const supabaseServiceKey = envServiceKey();

const isUrlValid = validateUrl(supabaseUrl);
const isAnonKeyValid = validateKey(supabaseAnonKey);
const isServiceKeyValid = validateKey(supabaseServiceKey);

export const isSupabaseConfigured = isUrlValid && isAnonKeyValid;
export const hasSupabaseServiceRole = isSupabaseConfigured && isServiceKeyValid;

export function getSupabaseConfigStatus() {
  return {
    supabaseUrl: isUrlValid,
    supabaseAnonKey: isAnonKeyValid,
    supabaseServiceRoleKey: isServiceKeyValid,
    configured: isSupabaseConfigured,
    adminConfigured: hasSupabaseServiceRole,
    urlUsesProjectRoot: !!supabaseUrl && !supabaseUrl.includes('/rest/v1'),
    acceptedNames: {
      url: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
      anonKey: ['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
      serviceRoleKey: ['SUPABASE_SERVICE_ROLE_KEY'],
    },
  };
}

function clientOptions({ persistSession }) {
  return {
    auth: {
      persistSession,
      autoRefreshToken: persistSession,
      detectSessionInUrl: persistSession,
    },
  };
}

export function createSupabaseAnonClient({ persistSession = false } = {}) {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseAnonKey, clientOptions({ persistSession }));
}

export function createSupabaseAdminClient() {
  if (!hasSupabaseServiceRole || typeof window !== 'undefined') return null;
  return createClient(supabaseUrl, supabaseServiceKey, clientOptions({ persistSession: false }));
}

export const supabase = createSupabaseAnonClient({ persistSession: typeof window !== 'undefined' });
export const supabaseServer = createSupabaseAnonClient({ persistSession: false });
export const supabaseAdmin = createSupabaseAdminClient();
