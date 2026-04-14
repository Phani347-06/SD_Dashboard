import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * 🛰️ Institutional Attendance Submission Matrix
 * Performs the high-integrity handshake between the session node and the laboratory QR.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const temp_session_id = body.temp_session_id || req.headers.get('x-session-id'); // Student's active login token
    const fingerprint_hash = body.fingerprint_hash || req.headers.get('x-fingerprint');
    
    // Deconstructed from the Faculty Dashboard QR Payload
    const { class_session_id, t_id: qr_token_id, v_code, beacon_status } = body; 
    
    // 🔍 HARDENED CHECK: Student MUST prove beacon proximity
    if (beacon_status !== 'CONNECTED') {
       return NextResponse.json({ error: 'Proximity Violation: Scan disabled until Beacon handshake established.' }, { status: 403 });
    }

    // 1. Session Integrity Node Check
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, students(*)')
      .eq('temp_session_id', temp_session_id)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session invalid or expired' }, { status: 401 });
    }

    // 2. Device Fingerprint Binding Validation
    if (session.fingerprint_hash !== fingerprint_hash) {
      // Security Breach: Invalidate session immediately
      await supabase.from('sessions').update({ is_active: false }).eq('temp_session_id', temp_session_id);
      return NextResponse.json({ error: 'Device mismatch — session terminated' }, { status: 401 });
    }

    // 3. Expiration Pulse
    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('sessions').update({ is_active: false }).eq('temp_session_id', temp_session_id);
      return NextResponse.json({ error: 'Session expired — please login again' }, { status: 401 });
    }

    // 4. Laboratory QR Verification (Dual Layer)
    const { data: qrSession, error: qrError } = await supabase
      .from('temp_qr_sessions')
      .select('*, class_sessions(*)')
      .eq('temp_session_id', qr_token_id) // Strict match on the exact token window
      .eq('class_session_id', class_session_id) // Strict match on the session node
      .eq('verification_code', v_code)
      .eq('is_active', true)
      .single();

    if (qrError || !qrSession) {
      return NextResponse.json({ error: 'Laboratory QR Signature Mismatch or Session has Expired.' }, { status: 400 });
    }

    // 5. Duplicate Submission Prevention
    if (session.attendance_submitted) {
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
      return NextResponse.json({ error: 'Identity Violation: Student not enrolled in this Laboratory Cohort.' }, { status: 403 });
    }

    // 7. Manifest Attendance Log
    const { error: logError } = await supabase
      .from('attendance_logs')
      .insert({
        class_session_id,
        temp_session_id: qrSession.temp_session_id, // Link to the specific QR window
        student_id: session.student_id,
        device_fingerprint_match: true,
        stage_1_passed: true,
        final_status: 'VERIFIED',
        telemetry: {
          handshake_v: "2.0.0",
          ua: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || "unknown",
          ts: new Date().toISOString()
        }
      });

    if (logError) throw logError;

    // 8. Update Session State
    await supabase.from('sessions').update({ attendance_submitted: true }).eq('temp_session_id', temp_session_id);

    // 9. Institutional Receipt Dispatch (Resend Node)
    try {
      const { resend } = await import('@/lib/resend');
      const student = session.students;
      console.log("ATTENDANCE_DEBUG: Attempting to send email via Resend to", student.roll_no);
      
      const { data, error: resendErr } = await resend.emails.send({
        from: 'no-reply@coolie.me',
        to: [`${student.roll_no}@vnrvjiet.in`],
        subject: `✅ Attendance Verified: ${qrSession.class_sessions.course_code}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <div style="background: #008a00; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
               <h2 style="color: white; margin: 0;">Attendance Confirmed</h2>
            </div>
            <p>Hello <strong>${student.full_name}</strong>,</p>
            <p>Your proximity verification for <strong>${qrSession.class_sessions.course_code}</strong> has been completed.</p>
          </div>
        `,
      });

      if (resendErr) {
        console.log("ATTENDANCE_DEBUG: Resend API Rejected the email. Reason:", JSON.stringify(resendErr));
      } else {
        console.log("ATTENDANCE_DEBUG: Resend Accepted - Message ID:", data?.id);
      }
    } catch (emailErr: any) {
      console.log("ATTENDANCE_DEBUG: Resend SDK Runtime Error:", emailErr.message);
    }

    return NextResponse.json({ success: true, message: 'Institutional Attendance Manifested' });

  } catch (err: any) {
    console.error('Attendance Matrix Protocol Error:', err);
    return NextResponse.json({ error: 'Protocol Failure: System integrity compromised.' }, { status: 500 });
  }
}
