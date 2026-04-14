import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET the current active lab session QR string for the ESP32 to display on OLED/E-Ink
export async function GET(request: Request) {
  try {
    const { data: session, error } = await supabase
      .from('temp_qr_sessions')
      .select('temp_session_id, class_session_id, verification_code, expires_at')
      .order('expires_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !session) {
      return NextResponse.json(
        { error: 'No active lab session running' },
        { status: 404 }
      );
    }

    return NextResponse.json({
        success: true,
        session_id: session.class_session_id,
        temp_session_id: session.temp_session_id,
        verification_code: session.verification_code,
        expires_at: session.expires_at
    });

  } catch (error) {
    console.error("API Error fetching active sesssion for ESP32:", error);
    return NextResponse.json({ error: 'Internal Server Error fetching active session' }, { status: 500 });
  }
}
