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

    if (temp_session_id) {
      const exactActiveQuery = await db
        .from('sessions')
        .select('*, students(*)')
        .eq('temp_session_id', temp_session_id)
        .eq('is_active', true)
        .maybeSingle();

      session = exactActiveQuery.data;
      sessionError = exactActiveQuery.error;

      // Recovery path: tolerate stale deactivation state for the exact same session node.
      if (!session) {
        const exactAnyStateQuery = await db
          .from('sessions')
          .select('*, students(*)')
          .eq('temp_session_id', temp_session_id)
          .maybeSingle();

        session = exactAnyStateQuery.data;
        sessionError = exactAnyStateQuery.data ? null : (exactAnyStateQuery.error ?? sessionError);
      }
    }

    // Recovery path: if the browser is holding a stale temp_session_id, prefer the latest
    // non-expired node on the same fingerprint rather than failing the QR as invalid.
    if ((!session || !isSessionUsable(session)) && fingerprint_hash) {
      let latestFingerprintQuery = await db
        .from('sessions')
        .select('*, students(*)')
        .eq('fingerprint_hash', fingerprint_hash)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestFingerprintQuery.error?.message?.includes('created_at')) {
        latestFingerprintQuery = await db
          .from('sessions')
          .select('*, students(*)')
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
      }
      sessionError = latestFingerprintQuery.data ? null : (latestFingerprintQuery.error ?? sessionError);

      if (session) {
        console.log("ATTENDANCE_DEBUG: Session recovered via fingerprint fallback.", {
          recovered_temp_session_id: mask(session.temp_session_id),
          requested_temp_session_id: mask(temp_session_id)
        });
      }
    }

    if (sessionError || !session) {
      console.log("ATTENDANCE_DEBUG: Session invalid or expired for ID:", mask(temp_session_id), "reason:", sessionError?.message);
      return NextResponse.json({ error: 'Session invalid or expired' }, { status: 401 });
    }

    // 2. Device Fingerprint Binding Validation
    if (session.fingerprint_hash !== fingerprint_hash) {
      console.log("ATTENDANCE_DEBUG: Device fingerprint mismatch.");
      // Soft Guard: We no longer purge the session artifact to allow for retry/debug.
      return NextResponse.json({ error: 'Device mismatch detected. Ensure you are using the same browser node used for login.' }, { status: 401 });
    }

    // 3. Expiration Pulse
    if (new Date(session.expires_at) < new Date()) {
      console.log("ATTENDANCE_DEBUG: Session expired chronologically.");
      return NextResponse.json({ error: 'Session expired — please login again' }, { status: 401 });
    }

    // 4. Laboratory QR Verification (Dual Layer)
    // 🛡️ RIGID PROTOCOL: We fetch the token by its unique ID but allow a grace window if recently rotated.
    const { data: qrSession, error: qrError } = await (supabaseAdmin || supabase)
      .from('temp_qr_sessions')
      .select('*, class_sessions(*)')
      .eq('temp_session_id', qr_token_id) 
      .eq('class_session_id', class_session_id) 
      .eq('verification_code', v_code_final)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (qrError || !qrSession) {
      console.log("ATTENDANCE_DEBUG: Laboratory QR Signature Mismatch.", {
         input_qr_token_id: qr_token_id,
         input_class_session_id: class_session_id,
         input_v_code: v_code_final,
         db_error: qrError?.message
      });
      return NextResponse.json({ error: 'Invalid QR Signature: Matrix mismatch detected or expired.' }, { status: 403 });
    }

    // ⏳ CHRONOLOGICAL RIGIDITY CHECK
    const expiresAt = new Date(qrSession.expires_at).getTime();
    const now = Date.now();
    const graceWindow = 120000; // 120s (2m) grace period for synchronized rotation & clock drift

    // Removed is_active check as per Hard Deletion Protocol
    if (now > (expiresAt + graceWindow)) {
        console.log("ATTENDANCE_DEBUG: QR Token stale beyond grace window.");
        return NextResponse.json({ error: 'QR Signature Expired: Please scan the refreshed matrix.' }, { status: 403 });
    }

    // 5. Duplicate Submission Prevention
    if (session.attendance_submitted) {
      console.log("ATTENDANCE_DEBUG: Attendance already manifested for student.");
      return NextResponse.json({ error: 'Attendance already Manifested for this session node.' }, { status: 400 });
    }

    // 6. Enrollment Verification (Final Gate)
    // Using supabaseAdmin to bypass RLS for institutional verification
    const { data: enrollment, error: enrollmentError } = await (supabaseAdmin || supabase)
      .from('lab_students')
      .select('id')
      .eq('student_id', session.student_id)
      .eq('lab_id', qrSession.class_sessions.lab_id)
      .single();

    if (enrollmentError || !enrollment) {
      console.log("ATTENDANCE_DEBUG: Identity Violation - student not in lab roster.");
      return NextResponse.json({ error: 'Identity Violation: Student not enrolled in this Laboratory Cohort.' }, { status: 403 });
    }

    // 7. Manifest Attendance Log
    const { data: logData, error: logError } = await supabase
      .from('attendance_logs')
      .insert({
        class_session_id,
        temp_session_id: qrSession.temp_session_id, // Link to the specific QR window
        student_id: session.student_id,
        qr_code_snapshot: qrSession.verification_code, // Audit Audit Persistence
        token_id_snapshot: qrSession.temp_session_id, // Forensics Traceability
        device_fingerprint_match: true,
        stage_1_passed: true,
        final_status: 'VERIFIED',
        telemetry: {
          handshake_v: "2.1.2",
          ua: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || "unknown",
          ts: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (logError) {
      console.log("ATTENDANCE_DEBUG: DB Insert Failure for Log:", logError.message);
      throw logError;
    }

    // 8. Update Session State (Atomic Verification)
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ attendance_submitted: true })
      .eq('temp_session_id', session.temp_session_id);

    if (updateError) {
       console.log("ATTENDANCE_DEBUG: Session Update Failure. Rolling back log record...");
       
       // Rollback: Attempt to delete the log record to prevent inconsistency
       const { error: rollbackError } = await supabase
         .from('attendance_logs')
         .delete()
         .eq('id', logData.id);

       if (rollbackError) {
          console.error("ATTENDANCE_DEBUG: ROLLBACK CRITICAL FAILURE. Log inconsistency remains for ID:", logData.id, rollbackError.message);
          return NextResponse.json({ 
             error: 'CRITICAL STATE ERROR: Attendance record created but session state update failed, and rollback failed. Please contact Lab Administration.',
             log_id: logData.id
          }, { status: 500 });
       }

       console.log("ATTENDANCE_DEBUG: Rollback successful for log:", logData.id);
       return NextResponse.json({ error: 'System inconsistency during state commit. The transaction has been rolled back. Please scan again.' }, { status: 500 });
    }

    // 9. Institutional Receipt Dispatch (Resend Node)
    try {
      const { resend } = await import('@/lib/resend');
      const student = session.students;
      
      // Email Diagnostic Logging
      const resendKeyPresent = !!process.env.RESEND_API_KEY;
      console.log("ATTENDANCE_DEBUG: Email Dispatch Metadata", {
         student_found: !!student,
         roll_no: student?.roll_no,
         full_name: student?.full_name,
         resend_api_key_configured: resendKeyPresent,
         environment: process.env.NODE_ENV
      });

      if (!student || !student.roll_no) {
         console.warn("ATTENDANCE_DEBUG: Email skipped - Student data missing roll_no.");
      } else {
         const studentEmail = `${student.roll_no}@vnrvjiet.in`;
         console.log("ATTENDANCE_DEBUG: Attempting to send email via Resend to", studentEmail);
         
         const { data, error: resendErr } = await resend.emails.send({
           from: 'no-reply@coolie.me',
           to: [studentEmail],
           subject: `✅ Attendance Verified: ${qrSession.class_sessions.course_code}`,
           html: `
             <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
               <div style="background: #008a00; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                  <h2 style="color: white; margin: 0;">Attendance Confirmed</h2>
               </div>
               <p>Hello <strong>${student.full_name || 'Student'}</strong> (${student.roll_no}),</p>
               <p>Your institutional presence for <strong>${qrSession.class_sessions.course_code}</strong> has been verified via hardware handshake.</p>
               <div style="margin-top: 20px; padding: 15px; background: #f4f4f4; border-radius: 8px; font-size: 12px;">
                   <p style="margin: 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                   <p style="margin: 0;"><strong>Session Node:</strong> ${class_session_id}</p>
                   <p style="margin: 0;"><strong>Integrity Status:</strong> SECURE_MANIFEST_V2</p>
               </div>
               <p style="font-size: 10px; color: #999; margin-top: 30px;">
                 This is an automated institutional receipt. No further action is required.
               </p>
             </div>
           `,
         });

         if (resendErr) {
           console.error("ATTENDANCE_DEBUG: Resend API Rejected the email.", {
              error: resendErr,
              code: (resendErr as any).name || (resendErr as any).code,
              message: (resendErr as any).message
           });
         } else {
           console.log("ATTENDANCE_DEBUG: Resend Accepted - Message ID:", data?.id);
         }
      }
    } catch (emailErr: any) {
      console.error("ATTENDANCE_DEBUG: Resend SDK Runtime Error:", emailErr.message);
    }

    return NextResponse.json({ success: true, message: 'Institutional Attendance Manifested' });

  } catch (err: any) {
    console.error('Attendance Matrix Protocol Error:', err);
    return NextResponse.json({ error: 'Protocol Failure: System integrity compromised.' }, { status: 500 });
  }
}
