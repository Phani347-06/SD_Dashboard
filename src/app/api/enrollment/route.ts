import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';

/**
 * 🛰️ Institutional Enrollment API
 * Securely retrieves lab nodes the student is officially enrolled in.
 */
export async function GET(req: Request) {
  try {
    // 1. Authenticate Requesting Identity (Server Client with Cookies)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.warn("🔐 Enrollment Auth Failure:", authError);
      return NextResponse.json({ error: 'Identity validation failed' }, { status: 401 });
    }

    // 2. Fetch Enrollment Data via Server Proxy
    const { data: enrollmentData, error: enrollError } = await supabase
      .from('lab_students')
      .select('lab_id, labs(id, name, description)')
      .eq('student_id', user.id);

    if (enrollError) {
      console.error("❌ API Enrollment Error:", enrollError);
      return NextResponse.json({ error: 'Enrollment retrieval failure' }, { status: 500 });
    }

    // 3. Transform and Return Payload
    const labs = enrollmentData?.map((e: any) => e.labs) || [];

    return NextResponse.json({ 
      success: true, 
      labs,
      telemetry: {
        timestamp: new Date().toISOString(),
        node: "enrollment_fetch"
      }
    });

  } catch (err: any) {
    console.error('Enrollment API Protocol Failure:', err);
    return NextResponse.json({ error: 'System integrity compromised.' }, { status: 500 });
  }
}
