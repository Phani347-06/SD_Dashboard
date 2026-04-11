'use client';
import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Radio, AlertCircle, RefreshCw } from 'lucide-react';

interface BeaconStatus {
  id: string;
  beacon_id: string;
  major_id: number;
  minor_id: number;
  uuid: string;
  status: 'ACTIVE' | 'INACTIVE';
  uptime_seconds: number;
  wifi_rssi: number;
  ip_address: string;
  last_heartbeat: string;
  is_online: boolean;
  time_since_heartbeat_ms: number;
}

interface BeaconResponse {
  success: boolean;
  beacons: BeaconStatus[];
  online_count: number;
  total_count: number;
}

export default function BeaconMonitorWidget() {
  const [beacons, setBeacons] = useState<BeaconStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBeaconStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/esp32/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data: BeaconResponse = await response.json();
      setBeacons(data.beacons);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch beacon status');
      console.error('Beacon fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    fetchBeaconStatus();
    const interval = setInterval(fetchBeaconStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const getSignalQuality = (rssi: number): string => {
    if (rssi >= -50) return 'Excellent';
    if (rssi >= -60) return 'Good';
    if (rssi >= -70) return 'Fair';
    return 'Poor';
  };

  const getSignalColor = (rssi: number): string => {
    if (rssi >= -50) return 'text-green-600 bg-green-50';
    if (rssi >= -60) return 'text-blue-600 bg-blue-50';
    if (rssi >= -70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="pt-8 px-8 pb-6 border-b border-slate-100">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Beacon Network Status</h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Real-time iBeacon telemetry from ESP32 devices
            </p>
          </div>
          <button
            onClick={fetchBeaconStatus}
            disabled={loading}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh beacon status"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {lastUpdated && (
          <p className="text-[11px] text-slate-400 mt-3">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="px-8 py-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-600" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="overflow-x-auto">
        {beacons.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <Radio size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No beacons registered yet</p>
            <p className="text-xs text-slate-400 mt-1">
              ESP32 devices will appear here when they send heartbeats to the server
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-[10px] font-bold text-slate-600 uppercase tracking-widest border-b border-slate-100">
                <th className="px-8 py-5">Beacon ID</th>
                <th className="px-8 py-5">Lab Room</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">WiFi Signal</th>
                <th className="px-8 py-5">Uptime</th>
                <th className="px-8 py-5">IP Address</th>
                <th className="px-8 py-5">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {beacons.map((beacon) => (
                <tr
                  key={beacon.id}
                  className="hover:bg-slate-50/50 transition-colors text-[13px] font-medium text-slate-700"
                >
                  <td className="px-8 py-5">
                    <code className="text-[11px] bg-slate-100 px-2 py-1 rounded">
                      {beacon.beacon_id}
                    </code>
                  </td>
                  <td className="px-8 py-5">
                    Room {beacon.major_id} · Station {beacon.minor_id}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      {beacon.is_online ? (
                        <>
                          <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                          <span className="text-green-600 font-bold">ONLINE</span>
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 bg-red-600 rounded-full" />
                          <span className="text-red-600 font-bold">OFFLINE</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-semibold ${getSignalColor(
                        beacon.wifi_rssi
                      )}`}
                    >
                      <Wifi size={14} />
                      {beacon.wifi_rssi}dBm
                      <span className="text-[11px]">({getSignalQuality(beacon.wifi_rssi)})</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 font-mono text-[12px] text-slate-600">
                    {formatUptime(beacon.uptime_seconds)}
                  </td>
                  <td className="px-8 py-5 font-mono text-[12px] text-slate-600">
                    {beacon.ip_address || 'N/A'}
                  </td>
                  <td className="px-8 py-5 text-[12px] text-slate-500">
                    {new Date(beacon.last_heartbeat).toLocaleTimeString()}
                    <br />
                    <span className="text-[11px] text-slate-400">
                      {Math.floor(beacon.time_since_heartbeat_ms / 1000)}s ago
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Stats */}
      {beacons.length > 0 && (
        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-[12px] font-bold text-slate-600">
          <span>Total Beacons: {beacons.length}</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-600 rounded-full" />
              Online: {beacons.filter((b) => b.is_online).length}
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-600 rounded-full" />
              Offline: {beacons.filter((b) => !b.is_online).length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
