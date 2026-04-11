import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface BeaconHeartbeat {
  beacon_id: string;
  major_id: number;
  minor_id: number;
  uuid: string;
  status: 'ACTIVE' | 'INACTIVE';
  uptime_seconds: number;
  wifi_rssi: number;
  ip_address: string;
  timestamp: string;
}

/**
 * POST /api/esp32/status
 * Receives heartbeat telemetry from ESP32 iBeacon devices
 * Stores beacon status in Supabase for dashboard display
 */
export async function POST(request: NextRequest) {
  try {
    const payload: BeaconHeartbeat = await request.json();

    // Validate required fields
    if (!payload.beacon_id || payload.major_id === undefined || payload.minor_id === undefined) {
      return NextResponse.json(
        { error: 'Missing required beacon identification fields' },
        { status: 400 }
      );
    }

    // Store beacon status in Supabase
    const { data, error } = await supabase
      .from('beacon_telemetry')
      .upsert(
        {
          beacon_id: payload.beacon_id,
          major_id: payload.major_id,
          minor_id: payload.minor_id,
          uuid: payload.uuid,
          status: payload.status,
          uptime_seconds: payload.uptime_seconds,
          wifi_rssi: payload.wifi_rssi,
          ip_address: payload.ip_address,
          last_heartbeat: new Date().toISOString(),
          raw_data: payload,
        },
        { onConflict: 'beacon_id' }
      );

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to store beacon telemetry', details: error.message },
        { status: 500 }
      );
    }

    // Log heartbeat for debugging
    console.log(`✓ Beacon Heartbeat Received: ${payload.beacon_id}`);
    console.log(`  Status: ${payload.status} | Uptime: ${payload.uptime_seconds}s | WiFi RSSI: ${payload.wifi_rssi}dBm`);

    return NextResponse.json(
      {
        success: true,
        message: 'Beacon heartbeat recorded',
        beacon_id: payload.beacon_id,
        server_timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Beacon heartbeat error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/esp32/status
 * Retrieve all active beacon statuses for dashboard display
 */
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('beacon_telemetry')
      .select('*')
      .order('last_heartbeat', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch beacon status', details: error.message },
        { status: 500 }
      );
    }

    // Add online/offline status based on last heartbeat freshness
    const enhancedData = data.map((beacon) => {
      const lastHeartbeatTime = new Date(beacon.last_heartbeat).getTime();
      const timeSinceHeartbeat = Date.now() - lastHeartbeatTime;
      const isOnline = timeSinceHeartbeat < 60000; // Online if heartbeat received within last 60 seconds

      return {
        ...beacon,
        is_online: isOnline,
        time_since_heartbeat_ms: timeSinceHeartbeat,
      };
    });

    return NextResponse.json(
      {
        success: true,
        beacons: enhancedData,
        online_count: enhancedData.filter((b) => b.is_online).length,
        total_count: enhancedData.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Query error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
