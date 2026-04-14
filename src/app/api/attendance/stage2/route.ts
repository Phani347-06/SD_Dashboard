import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/attendance/stage2
// Endpoint for: Student taps submit -> App sends (temp_session_id, verification_code, device_fingerprint)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      scan_record_id, 
      student_id, 
      temp_session_id, 
      verification_code_entered, 
      device_fingerprint,
      ble_detected 
    } = body;

    // 1. Double check BLE Requirement from the App
    if (!ble_detected) {
      return NextResponse.json({ error: 'BLE Beacon not detected. Must be in the classroom.' }, { status: 403 });
    }

    // 2. Fetch the student to verify Fingerprint matches Login Device
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('registered_device_fingerprint')
      .eq('id', student_id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (student.registered_device_fingerprint !== device_fingerprint) {
      return NextResponse.json({ error: 'Unrecognized Device. Proxy attempt blocked.' }, { status: 403 });
    }

    // 3. Fetch the QR Session to verify the 6-digit visual code
    const { data: qrSession, error: qrError } = await supabase
      .from('temp_qr_sessions')
      .select('verification_code')
      .eq('temp_session_id', temp_session_id)
      .single();

    if (qrError || !qrSession) {
      return NextResponse.json({ error: 'Invalid Session.' }, { status: 400 });
    }

    if (qrSession.verification_code !== verification_code_entered) {
      return NextResponse.json({ error: 'Incorrect visual verification code.' }, { status: 401 });
    }

    // 4. Update the Scan Record (Stage 2 validation complete -> PRESENT)
    const { data: authData, error: authError } = await supabase
      .from('attendance_logs')
      .update({
        stage_2_passed: true,
        device_fingerprint_match: true,
        qr_code_snapshot: qrSession.verification_code, // Audit Persistence
        token_id_snapshot: temp_session_id, // Forensics Traceability
        final_status: 'VERIFIED'
      })
      .eq('id', scan_record_id)
      .eq('student_id', student_id)
      .eq('final_status', 'PENDING') // Ensure it hasn't already been submitted
      .select()
      .single();

    if (authError || !authData) {
      return NextResponse.json({ error: 'Session already submitted or scan record invalid.' }, { status: 400 });
    }

    // 5. Success! Attendance is marked securely.
    return NextResponse.json({ 
      success: true, 
      message: 'Attendance successfully locked in.',
      record: authData
    }, { status: 200 });

  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
