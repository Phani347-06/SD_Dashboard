import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resend } from '@/lib/resend';

export async function POST(req: Request) {
  try {
    const { sessionId, tempSessionId, deviceFingerprint, studentId, verificationCode } = await req.json();

    // 1. Verify Session & OTP (Existence proves activity)
    const { data: qrSession, error: qrError } = await supabase
      .from('temp_qr_sessions')
      .select('*, class_sessions(*)')
      .eq('temp_session_id', tempSessionId)
      .eq('verification_code', verificationCode)
      .single();

    if (qrError || !qrSession) {
      return NextResponse.json({ success: false, message: 'Invalid or Expired QR Session Signature' }, { status: 400 });
    }

    // 2. Verify Identity Handshake (Fingerprint + Session Token)
    const { data: student, error: stError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (stError || !student) {
      return NextResponse.json({ success: false, message: 'Identity Node Mismatch: Student record not found.' }, { status: 400 });
    }

    // a. Single Session Check (Is this the latest login?)
    if (student.current_session_token && student.current_session_token !== tempSessionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Security Alert: You have been signed in on another device. This session is invalid.' 
      }, { status: 403 });
    }

    // b. Hardware Anchor Check (Firs time? Bind it. Repeat? Verify it.)
    if (student.registered_device_fingerprint) {
       if (student.registered_device_fingerprint !== deviceFingerprint) {
          return NextResponse.json({ 
            success: false, 
            message: 'Hardware Signature Mismatch: This account is locked to your primary device.' 
          }, { status: 403 });
       }
    } else {
       // First time login - bind the hardware anchor
       await supabase
        .from('students')
        .update({ registered_device_fingerprint: deviceFingerprint })
        .eq('id', studentId);
    }

    // 3. Record Attendance
    const { error: logError } = await supabase
      .from('attendance_logs')
      .insert({
        class_session_id: sessionId,
        temp_session_id: tempSessionId,
        student_id: studentId,
        qr_code_snapshot: verificationCode,
        token_id_snapshot: tempSessionId,
        device_fingerprint_match: true,
        stage_1_passed: true,
        final_status: 'VERIFIED'
      });

    if (logError) throw logError;

    // 4. Send Professional Receipt via Resend
    let emailSent = false;
    try {
      console.log("ATTENDANCE_DEBUG: Attempting to send email via Resend to", student.roll_no);
      const { data, error: resendErr } = await resend.emails.send({
        from: 'no-reply@coolie.me',
        to: [`${student.roll_no}@vnrvjiet.in`],
        subject: `✅ Attendance Verified: ${qrSession.class_sessions.course_code}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <div style="background: #0052a5; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
               <h2 style="color: white; margin: 0;">Attendance Confirmed</h2>
            </div>
            <p>Hello <strong>${student.full_name}</strong>,</p>
            <p>Your lab presence for <strong>${qrSession.class_sessions.course_code}</strong> has been successfully verified.</p>
          </div>
        `,
      });

      if (resendErr) {
        console.log("ATTENDANCE_DEBUG: Resend API Rejected the email. Reason:", JSON.stringify(resendErr));
      } else {
        emailSent = true;
        console.log("ATTENDANCE_DEBUG: Resend Accepted - Message ID:", data?.id);
      }
    } catch (emailErr: any) {
      console.log("ATTENDANCE_DEBUG: Resend SDK Runtime Error:", emailErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: emailSent ? 'Attendance Verified & Receipt Sent' : 'Attendance Verified (Receipt Dispatch Delayed)',
      emailStatus: emailSent ? 'DELIVERED' : 'FAILED'
    }, { status: 200 });

  } catch (err: any) {
    console.error('Unified Attendance Protocol Failure:', err);
    return NextResponse.json({ success: false, message: 'Protocol Breakdown: System integrity compromised.' }, { status: 500 });
  }
}
