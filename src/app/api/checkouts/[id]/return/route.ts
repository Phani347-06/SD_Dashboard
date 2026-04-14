import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// PUT /checkouts/:id/return (Manually Mark Item as Returned)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: checkoutId } = await params;

    // 1. Fetch Checkout record
    const { data: checkout, error: checkoutError } = await supabase
      .from('inventory_checkouts')
      .select('item_id, status')
      .eq('id', checkoutId)
      .single();

    if (checkoutError || !checkout) return NextResponse.json({ error: 'Checkout record not found' }, { status: 404 });
    if (checkout.status === 'CLOSED') return NextResponse.json({ error: 'Checkout already closed' }, { status: 400 });

    // 2. Close Checkout record
    await supabase.from('inventory_checkouts')
      .update({
        status: 'CLOSED',
        returned_at: new Date().toISOString()
      })
      .eq('id', checkoutId);

    // 3. Update Inventory Status
    await supabase.from('inventory')
      .update({
        status: 'IN LAB',
        student_id: null,
        last_seen: new Date().toISOString()
      })
      .eq('id', checkout.item_id);

    // 4. Log RFID/Audit Event
    await supabase.from('rfid_events').insert({
      item_id: checkout.item_id,
      type: 'return',
      details: 'Manual return via Faculty Command Terminal.'
    });

    return NextResponse.json({ success: true, message: 'Institutional Unit De-anchored' });

  } catch (err) {
    console.error("PUT /checkouts/:id/return API Error:", err);
    return NextResponse.json({ error: 'Internal Return Synchronization Failure' }, { status: 500 });
  }
}
