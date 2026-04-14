import { NextResponse } from 'next/server';
import { resend } from '@/lib/resend';

export async function POST(req: Request) {
  try {
    const { email, studentName, sessionName, timestamp } = await req.json();

    if (!email || !studentName || !sessionName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: 'Lab Intel <no-reply@coolie.me>',
      to: [email],
      subject: `Attendance Recorded: ${sessionName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
          <h1 style="color: #0052a5; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">Laboratory Attendance Confirmed</h1>
          <p>Hello <strong>${studentName}</strong>,</p>
          <p>This is a formal confirmation that your attendance has been successfully recorded for your session.</p>
          
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 25px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 14px; text-transform: uppercase; font-weight: bold; color: #64748b; letter-spacing: 0.05em;">Session Name</p>
            <p style="margin: 5px 0 15px 0; font-size: 18px; font-weight: 800; color: #0052a5;">${sessionName}</p>
            
            <p style="margin: 0; font-size: 14px; text-transform: uppercase; font-weight: bold; color: #64748b; letter-spacing: 0.05em;">Timestamp</p>
            <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: 600;">${new Date(timestamp).toLocaleString()}</p>
          </div>

          <p style="font-size: 14px; color: #64748b;">
            This was validated using cryptographical device fingerprinting and proximity verification. 
            If you did not attend this lab, please contact the faculty lead immediately.
          </p>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            © 2026 Lab Intel Precision Command Center
          </div>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id });

  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
