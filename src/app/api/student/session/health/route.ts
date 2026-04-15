import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * 🏥 SESSION HEALTH DIAGNOSTIC ENDPOINT
 * Returns detailed diagnostic info about the current student session state
 * Helps debug 401 errors and session lifecycle issues
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const temp_session_id = body.temp_session_id || req.headers.get('x-session-id');
    const fingerprint_hash = body.fingerprint_hash || req.headers.get('x-fingerprint');

    const db = supabaseAdmin || supabase;

    const mask = (val: any, visible: number = 4) => {
      if (!val) return "null";
      const str = String(val);
      if (str.length <= visible * 2) return str;
      return `${str.slice(0, visible)}...${str.slice(-visible)}`;
    };

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      provided: {
        temp_session_id: mask(temp_session_id),
        fingerprint_hash: mask(fingerprint_hash),
      },
      checks: {},
      issues: [],
    };

    if (!temp_session_id || !fingerprint_hash) {
      diagnostics.checks.missing_credentials = {
        passed: false,
        reason: 'Missing temp_session_id or fingerprint_hash',
      };
      return NextResponse.json(diagnostics, { status: 400 });
    }

    // Check 1: Does session exist with exact temp_session_id?
    const { data: exactSession, error: exactError } = await db
      .from('sessions')
      .select('*')
      .eq('temp_session_id', temp_session_id)
      .maybeSingle();

    diagnostics.checks.exact_session_found = {
      passed: !!exactSession,
      record: exactSession ? {
        temp_session_id: mask(exactSession.temp_session_id),
        student_id: mask(exactSession.student_id),
        is_active: exactSession.is_active,
        fingerprint_match: exactSession.fingerprint_hash === fingerprint_hash,
        created_at: exactSession.created_at,
        expires_at: exactSession.expires_at,
        expired: new Date(exactSession.expires_at) < new Date(),
      } : null,
      error: exactError?.message,
    };

    // Check 2: Is the session still valid (not expired, is_active)?
    if (exactSession) {
      const now = new Date();
      const expiresAt = new Date(exactSession.expires_at);
      const isNotExpired = expiresAt >= now;
      const isActive = exactSession.is_active === true;

      diagnostics.checks.session_validity = {
        passed: isActive && isNotExpired,
        is_active: isActive,
        not_expired: isNotExpired,
        expires_at: exactSession.expires_at,
        time_remaining_ms: expiresAt.getTime() - now.getTime(),
      };
    }

    // Check 3: Does the fingerprint match?
    if (exactSession) {
      diagnostics.checks.fingerprint_validation = {
        passed: exactSession.fingerprint_hash === fingerprint_hash,
        stored_fingerprint: mask(exactSession.fingerprint_hash),
        provided_fingerprint: mask(fingerprint_hash),
      };

      if (exactSession.fingerprint_hash !== fingerprint_hash) {
        diagnostics.issues.push(
          'FINGERPRINT_MISMATCH: Device fingerprint changed since login'
        );
      }
    }

    // Check 4: Can we find sessions by fingerprint (recovery fallback)?
    const { data: fingerprintSessions, error: fpError } = await db
      .from('sessions')
      .select('*')
      .eq('fingerprint_hash', fingerprint_hash)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    diagnostics.checks.fingerprint_recovery_candidates = {
      passed: (fingerprintSessions?.length ?? 0) > 0,
      count: fingerprintSessions?.length ?? 0,
      candidates: fingerprintSessions?.map((s) => ({
        temp_session_id: mask(s.temp_session_id),
        is_active: s.is_active,
        expires_at: s.expires_at,
        age_ms: Date.now() - new Date(s.created_at).getTime(),
      })) ?? [],
      error: fpError?.message,
    };

    // Check 5: Overall assessment
    if (exactSession && 
        exactSession.is_active && 
        new Date(exactSession.expires_at) >= new Date() &&
        exactSession.fingerprint_hash === fingerprint_hash) {
      diagnostics.overall_health = 'HEALTHY';
    } else if (
      (fingerprintSessions?.length ?? 0) > 0 &&
      !exactSession
    ) {
      diagnostics.overall_health = 'DEGRADED_BUT_RECOVERABLE';
      diagnostics.issues.push('Session ID mismatch, but recovery candidates available');
    } else {
      diagnostics.overall_health = 'UNHEALTHY';
      diagnostics.issues.push('No valid session found with given credentials');
    }

    return NextResponse.json(diagnostics, {
      status: diagnostics.overall_health === 'HEALTHY' ? 200 : 401,
    });
  } catch (err: any) {
    console.error('Session health check error:', err);
    return NextResponse.json(
      { error: 'Health check failed', debug: err.message },
      { status: 500 }
    );
  }
}
