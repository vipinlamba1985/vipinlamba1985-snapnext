import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    if (supabase) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          return NextResponse.redirect(`${origin}${next}`);
        } else {
          console.error('Supabase auth code exchange error:', error.message);
        }
      } catch (err) {
        console.error('Supabase auth callback exception:', err.message);
      }
    } else {
      console.warn('Supabase not configured during code exchange.');
    }
  }

  // Fallback redirect if something went wrong
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
