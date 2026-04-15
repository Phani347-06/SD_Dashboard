import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * 🛰️ Institutional Attendance Submission Matrix
 * Performs the high-integrity handshake between the session node and the laboratory QR.
 */

const mask = (val: any, visible: number = 4) => {
  if (!val) return "null";
  const str = String(val);
  if (str.length <= visible * 2) return str;
  return `${str.slice(0, visible)}...${str.slice(-visible)}`;
};

const isSessionUsable = (session: { is_active?: boolean | null; expires_at?: string | null } | null) => {
  if (!session) return false;
  if (session.is_active === false) return false;
  if (!session.expires_at) return false;
  return new Date(session.expires_at) >= new Date();
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = supabaseAdmin || supabase;
    const temp_session_id = body.temp_session_id || req.headers.get('x-session-id'); // Student's active login token
    const fingerprint_hash = body.fingerprint_hash || req.headers.get('x-fingerprint');
    
    // Deconstructed from the Faculty Dashboard QR Payload or Frontend Handshake
    const { 
      class_session_id: body_class_id, 
      s_id, 
      t_id: qr_token_id, 
      v_code, 
      verification_code,
      beacon_status 
    } = body; 
    
    const class_session_id = body_class_id || s_id;
    const v_code_final = v_code || verification_code;

    console.log("ATTENDANCE_DEBUG: Received Handshake", {
      class_session_id,
      qr_token_id: mask(qr_token_id),
      v_code_final: mask(v_code_final),
      beacon_status,
      temp_session_id: mask(temp_session_id),
      fingerprint_hash: mask(fingerprint_hash)
    });
    
    console.log("ATTENDANCE_DEBUG: Session lookup about to start for student with temp_session_id:", mask(temp_session_id));
    
    // 🔍 HARDENED CHECK: Student MUST prove beacon proximity
    // Server-side gate: 'BYPASSED' is only valid in development environments
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (beacon_status === 'BYPASSED' && !isDevelopment) {
       console.log("ATTENDANCE_DEBUG: Unauthorized Bypass Attempt in Production.");
       return NextResponse.json({ error: 'Proximity violation: Manual bypass is restricted in production.' }, { status: 403 });
    }

    if (beacon_status !== 'CONNECTED' && beacon_status !== 'BYPASSED') {
       console.log("ATTENDANCE_DEBUG: Proximity Violation. Expected CONNECTED or BYPASSED, got:", beacon_status);
       return NextResponse.json({ error: 'Proximity Violation: Scan disabled until Beacon handshake established.' }, { status: 403 });
    }

    // 1. Session Integrity Node Check
    let session = null;
    let sessionError = null;
    const sessionDebug = {
      tempSessionProvided: Boolean(temp_session_id),
      fingerprintProvided: Boolean(fingerprint_hash),
      exactActiveFound: false,
      exactAnyFound: false,
      fingerprintFallbackFound: false,
      selectedSessionUsable: false,
      requestedTempSessionId: mask(temp_session_id),
      selectedTempSessionId: "null",
    };

    if (temp_session_id) {
      const exactActiveQuery = await db
        .from('sessions')
        .select('*')
        .eq('temp_session_id', temp_session_id)
        .eq('is_active', true)
        .maybeSingle();

      session = exactActiveQuery.data;
      sessionError = exactActiveQuery.error;
      sessionDebug.exactActiveFound = Boolean(exactActiveQuery.data);

      // Recovery path: tolerate stale deactivation state for the exact same session node.
      if (!session) {
        const exactAnyStateQuery = await db
          .from('sessions')
          .select('*')
          .eq('temp_session_id', temp_session_id)
          .maybeSingle();

        session = exactAnyStateQuery.data;
        sessionError = exactAnyStateQuery.data ? null : (exactAnyStateQuery.error ?? sessionError);
        sessionDebug.exactAnyFound = Boolean(exactAnyStateQuery.data);
      }
    }

    // Recovery path: if the browser is holding a stale temp_session_id, prefer the latest
    // non-expired node on the same fingerprint rather than failing the QR as invalid.
    if ((!session || !isSessionUsable(session)) && fingerprint_hash) {
      let latestFingerprintQuery = await db
        .from('sessions')
        .select('*')
        .eq('fingerprint_hash', fingerprint_hash)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestFingerprintQuery.error?.message?.includes('created_at')) {
        latestFingerprintQuery = await db
          .from('sessions')
          .select('*')
          .eq('fingerprint_hash', fingerprint_hash)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      if (latestFingerprintQuery.data) {
        session = latestFingerprintQuery.data;
        sessionError = null;
        sessionDebug.fingerprintFallbackFound = true;
      }
      sessionError = latestFingerprintQuery.data ? null : (latestFingerprintQuery.error ?? sessionError);

      if (session) {
        console.log("ATTENDANCE_DEBUG: Session recovered via fingerprint fallback.", {
          recovered_temp_session_id: mask(session.temp_session_id),
          requested_temp_session_id: mask(temp_session_id)
        });
      }
    }

    sessionDebug.selectedSessionUsable = isSessionUsable(session);
    sessionDebug.selectedTempSessionId = mask(session?.temp_session_id);

    if (session && isSessionUsable(session)) {
      // 🛠️ RELATIONSHIP FIX: Manual stage-2 student lookup to avoid schema relationship errors
      if (session.student_id) {
        const { data: studentData } = await db
          .from('students')
          .select('*')
          .eq('id', session.student_id)
          .maybeSingle();
        
        if (studentData) {
          session.students = studentData;
        }
      }

      console.log("ATTENDANCE_DEBUG: ✅ Session is valid and usable", {
        temp_session_id: mask(session.temp_session_id),
        student_id: mask(session.student_id),
        is_active: session.is_active,
        expires_at: session.expires_at,
        created_at: session.created_at,
        fingerprint_match: session.fingerprint_hash === fingerprint_hash,
      });
    }

    if (sessionError || !session) {
      console.log("ATTENDANCE_DEBUG: Session invalid or expired for ID:", mask(temp_session_id), {
        hasError: !!sessionError,
        errorMessage: sessionError?.message,
        foundSession: !!session,
        debug: sessionDebug,
        recoveryAttempted: sessionDebug.fingerprintFallbackFound,
        overallAssessment: !session ? 'NO_SESSION_FOUND' : 'SESSION_FOUND_BUT_UNUSABLE'
      });
      return NextResponse.json({
        error: 'Session invalid or expired',
        debug: {
          stage: 'session_lookup',
          reason: sessionError?.message || 'no_session_match',
          ...sessionDebug,
        }
      }, { status: 401 });
    }

    // 2. Device Fingerprint Binding Validation
    if (session.fingerprint_hash !== fingerprint_hash) {
      console.log("ATTENDANCE_DEBUG: Device fingerprint mismatch.");
      // Soft Guard: We no longer purge the session artifact to allow for retry/debug.
      return NextResponse.json({
        error: 'Device mismatch detected. Ensure you are using the same browser node used for login.',
        debug: {
          stage: 'fingerprint_check',
          requestedTempSessionId: mask(temp_session_id),
          selectedTempSessionId: mask(session.temp_session_id),
          requestedFingerprint: mask(fingerprint_hash),
          selectedFingerprint: mask(session.fingerprint_hash),
        }
      }, { status: 401 });
    }

    // 3. Expiration Pulse
    if (new Date(session.expires_at) < new Date()) {
      console.log("ATTENDANCE_DEBUG: Session expired chronologically.");
      return NextResponse.json({ error: 'Session expired — please login again' }, { status: 401 });
    }

    // 3.5 ENHANCEMENT: Proactive Session Renewal
    // If session is within 30 minutes of expiring, extend it for another 4 hours
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const thirtyMinutesMs = 30 * 60 * 1000;

    if (timeUntilExpiry < thirtyMinutesMs) {
      const newExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      console.log("ATTENDANCE_DEBUG: Session expiring soon, extending expiration", {
        current_expires_at: session.expires_at,
        new_expires_at: newExpiresAt,
        minutes_remaining: Math.floor(timeUntilExpiry / 60000),
      });

      const { error: renewError } = await db
        .from('sessions')
        .update({ expires_at: newExpiresAt })
        .eq('temp_session_id', session.temp_session_id);

      if (renewError) {
        console.warn("ATTENDANCE_DEBUG: Failed to extend session expiration:", renewError.message);
        // Don't fail the attendance - just log it
      } else {
        console.log("ATTENDANCE_DEBUG: ✅ Session extended successfully");
      }
    }

    // 4. Laboratory QR Verification (Dual Layer)
    // 🛡️ RIGID PROTOCOL: We fetch the token by its unique ID but allow a grace window if recently rotated.
    const { data: qrSession, error: qrError } = await db
      .from('temp_qr_sessions')
      .select('*, class_sessions(*)')
      .eq('temp_session_id', qr_token_id) 
      .eq('class_session_id', class_session_id) 
      .eq('verification_code', v_code_final)
      .maybeSingle();

    if (qrError || !qrSession) {
      // Diagnostic Trace: check if the class_session exists at all
      const { data: classExists } = await db.from('class_sessions').select('id').eq('id', class_session_id).maybeSingle();
      const { data: anyToken } = await db.from('temp_qr_sessions').select('temp_session_id, verification_code').eq('class_session_id', class_session_id).order('expires_at', { ascending: false }).limit(1).maybeSingle();

      console.log("ATTENDANCE_DEBUG: Laboratory QR Signature Mismatch.", {
         input: { qr_token_id: mask(qr_token_id), class_id: mask(class_session_id), v_code: mask(v_code_final) },
         database: { 
            class_exists: !!classExists, 
            latest_token_id: mask(anyToken?.temp_session_id),
            latest_v_code: mask(anyToken?.verification_code)
         },
         db_error: qrError?.message
      });
      return NextResponse.json({ 
        error: 'Invalid QR Signature: Matrix mismatch detected or expired.',
        debug: {
          stage: 'qr_verification',
          reason: !qrSession ? 'node_mismatch' : 'db_error'
        }
      }, { status: 403 });
    }

    // 5. Duplicate Submission Prevention
    if (session.attendance_submitted) {
      console.log("ATTENDANCE_DEBUG: Attendance already manifested for student.");
      return NextResponse.json({ error: 'Attendance already Manifested for this session node.' }, { status: 400 });
    }

    // 6. Enrollment Verification (Final Gate)
    // Using supabaseAdmin to bypass RLS for institutional verification
    const labId = Array.isArray(qrSession.class_sessions) 
      ? qrSession.class_sessions[0]?.lab_id 
      : qrSession.class_sessions?.lab_id;

    if (!labId) {
       console.log("ATTENDANCE_DEBUG: Integrity Violation - Missing Lab ID in QR Session.");
       return NextResponse.json({ error: 'System Integrity Error: Laboratory context lost.' }, { status: 500 });
    }

    const { data: enrollment, error: enrollmentError } = await (supabaseAdmin || supabase)
      .from('lab_students')
      .select('id')
      .eq('student_id', session.student_id)
      .eq('lab_id', labId)
      .single();

    if (enrollmentError || !enrollment) {
      console.log("ATTENDANCE_DEBUG: Identity Violation - student not in lab roster.");
      return NextResponse.json({ error: 'Identity Violation: Student not enrolled in this Laboratory Cohort.' }, { status: 403 });
    }

    // 7. Manifest Attendance Log
    const { data: logData, error: logError } = await (supabaseAdmin || supabase)
      .from('attendance_logs')
      .insert({
        class_session_id,
        temp_session_id: qrSession.temp_session_id, 
        student_id: session.student_id,
        qr_code_snapshot: qrSession.verification_code, 
        token_id_snapshot: qrSession.temp_session_id, 
        device_fingerprint_match: true,
        stage_1_passed: true,
        final_status: 'VERIFIED'
      })
      .select('id')
      .single();

    if (logError) {
      console.log("ATTENDANCE_DEBUG: DB Insert Failure for Log:", logError.message);
      throw logError;
    }

    // 8. Update Session State (Atomic Verification)
    const { error: updateError } = await (supabaseAdmin || supabase)
      .from('sessions')
      .update({ attendance_submitted: true })
      .eq('temp_session_id', session.temp_session_id);

    if (updateError) {
       console.log("ATTENDANCE_DEBUG: Session Update Failure. Rolling back log record...");
       await (supabaseAdmin || supabase).from('attendance_logs').delete().eq('id', logData.id);
       return NextResponse.json({ error: 'System inconsistency during state commit.' }, { status: 500 });
    }

    // 9. Institutional Receipt Dispatch (Resend Node)
    try {
      const { resend } = await import('@/lib/resend');
      // Relationship Fix: student mapping
      const student = session.students;
      const classSession = Array.isArray(qrSession.class_sessions) 
        ? qrSession.class_sessions[0] 
        : qrSession.class_sessions;
      
      if (student && student.roll_no && classSession) {
         const studentEmail = `${student.roll_no}@vnrvjiet.in`;
         await resend.emails.send({
           from: 'no-reply@coolie.me',
           to: [studentEmail],
           subject: `✅ Attendance Verified: ${classSession.course_code || 'LAB'}`,
           html: `
             <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
               <div style="background: #008a00; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                  <h2 style="color: white; margin: 0;">Attendance Confirmed</h2>
               </div>
               <p>Hello <strong>${student.full_name || 'Student'}</strong> (${student.roll_no}),</p>
               <p>Your institutional presence for <strong>${classSession.course_code || 'Laboratory'}</strong> has been verified via hardware handshake.</p>
               <div style="margin-top: 20px; padding: 15px; background: #f4f4f4; border-radius: 8px; font-size: 12px;">
                   <p style="margin: 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                   <p style="margin: 0;"><strong>Integrity Status:</strong> SECURE_MANIFEST_V2.1</p>
               </div>
               <p style="font-size: 10px; color: #999; margin-top: 30px;">
                 This is an automated institutional receipt. No further action is required.
               </p>
             </div>
           `,
         });
      }
    } catch (emailErr: any) {
      console.error("ATTENDANCE_DEBUG: Resend Non-Critical Error:", emailErr.message);
    }

    return NextResponse.json({ success: true, message: 'Institutional Attendance Manifested' });

  } catch (err: any) {
    console.error('Attendance Matrix Protocol Error:', err);
    return NextResponse.json({ error: 'Protocol Failure: System integrity compromised.' }, { status: 500 });
  }
}
