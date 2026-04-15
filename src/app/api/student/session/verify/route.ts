import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * Session Verification & Refresh Endpoint
 * Verifies that a student's session is still valid and refreshes if needed.
 * Called by student app before critical operations.
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const temp_session_id = body.temp_session_id || req.headers.get('x-session-id');
    const fingerprint_hash = body.fingerprint_hash || req.headers.get('x-fingerprint');

    const db = supabaseAdmin || supabase;

    if (!temp_session_id || !fingerprint_hash) {
      return NextResponse.json(
        { error: 'Missing session credentials', valid: false },
        { status: 400 }
      );
    }

    // Check if session exists and is still valid
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .select('*')
      .eq('temp_session_id', temp_session_id)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        {
          error: 'Session not found or inactive',
          valid: false,
          debug: { error: sessionError?.message }
        },
        { status: 401 }
      );
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(session.expires_at);

    if (expiresAt < now) {
      return NextResponse.json(
        {
          error: 'Session expired',
          valid: false,
          expired_at: session.expires_at
        },
        { status: 401 }
      );
    }

    // Verify fingerprint matches
    if (session.fingerprint_hash !== fingerprint_hash) {
      return NextResponse.json(
        {
          error: 'Fingerprint mismatch',
          valid: false
        },
        { status: 401 }
      );
    }

    // Calculate remaining time
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    return NextResponse.json({
      valid: true,
      temp_session_id,
      expires_at: session.expires_at,
      remaining_minutes: remainingMinutes,
      is_active: session.is_active,
      created_at: session.created_at
    });
  } catch (err: any) {
    console.error('Session verification error:', err);
    return NextResponse.json(
      { error: 'Verification failed', debug: err.message },
      { status: 500 }
    );
  }
}
