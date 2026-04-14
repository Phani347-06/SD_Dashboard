import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 1. GET /inventory/:id (Fetch Single Item)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('inventory')
      .select('*, students(full_name, roll_no), inventory_checkouts(*)')
      .eq('id', id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Asset not found in matrix' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /inventory/:id API Error:", err);
    return NextResponse.json({ error: 'Internal Matrix Sync Failure' }, { status: 500 });
  }
}

// 2. PUT /inventory/:id (Update Item Details)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('inventory')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (err) {
    console.error("PUT /inventory/:id API Error:", err);
    return NextResponse.json({ error: 'Failed to synchronize unit metadata' }, { status: 500 });
  }
}

// 3. DELETE /inventory/:id (Remove Item)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Institutional Asset Decommissioned' });
  } catch (err) {
    console.error("DELETE /inventory/:id API Error:", err);
    return NextResponse.json({ error: 'Decommissioning Cluster Failure' }, { status: 500 });
  }
}
