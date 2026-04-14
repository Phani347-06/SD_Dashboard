import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT /alerts/:id/resolve (Faculty Action)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: alertId } = await params;

    const { data: alert, error: fetchError } = await supabase
      .from('inventory_alerts')
      .update({
        status: 'RESOLVED',
        created_at: new Date().toISOString() // Or use resolved_at if column added
      })
      .eq('id', alertId)
      .select()
      .single();

    if (fetchError || !alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

    // Automatically resolve related inventory items if needed (optional logic)
    // For now, just mark resolved.

    return NextResponse.json({ success: true, alert });

  } catch (err) {
    console.error("PUT /alerts/:id/resolve API Error:", err);
    return NextResponse.json({ error: 'Alert Resolution Core Failure' }, { status: 500 });
  }
}
