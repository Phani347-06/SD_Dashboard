import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * 📊 Institutional Attendance Ledger API
 * Hub for retrieving presence logs with differentiated access for faculty and students.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');
    const limit = parseInt(searchParams.get('limit') || '10');

    // 1. Authenticate Requesting Identity (Server Client with Cookies)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.warn("🔐 Ledger Auth Failure:", authError);
      return NextResponse.json({ error: 'Identity validation failed' }, { status: 401 });
    }

    // 2. Fetch User Profile from specialized roles matrices
    const { data: facultyProf } = await supabase.from('faculty').select('id').eq('id', user.id).maybeSingle();
    const { data: studentProf } = !facultyProf ? await supabase.from('students').select('id').eq('id', user.id).maybeSingle() : { data: null };
    
    const isFaculty = !!facultyProf;
    const role = isFaculty ? 'FACULTY' : 'STUDENT';

    let selectString = `
      id,
      scanned_at,
      final_status,
      class_sessions (
        course_code,
        date
      )
    `;

    if (isFaculty) {
      selectString += `, students:students!attendance_logs_student_id_fkey (full_name, roll_no)`;
    }

    let query = supabase
      .from('attendance_logs')
      .select(selectString)
      .order('scanned_at', { ascending: false })
      .limit(limit);

    // 3. Apply Context-Specific Filters
    if (isFaculty && sessionId) {
      // Faculty view: All logs for a specific session
      query = query.eq('class_session_id', sessionId);
    } else {
      // Student view: Only personal logs
      query = query.eq('student_id', user.id);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error("❌ API Ledger Error:", logsError);
      return NextResponse.json({ error: 'Ledger retrieval failure' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      logs,
      telemetry: {
        role: role,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: any) {
    console.error('Ledger API Protocol Failure:', err);
    return NextResponse.json({ error: 'System integrity compromised during handshake.' }, { status: 500 });
  }
}
