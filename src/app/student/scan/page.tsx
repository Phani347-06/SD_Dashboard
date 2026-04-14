"use client";
import { useEffect, useState, useRef } from 'react';
import { ShieldCheck, ArrowLeft, Loader2, CircleCheckBig, CircleX, Bluetooth, BluetoothSearching, Upload, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Html5Qrcode } from 'html5-qrcode';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSecurity } from '@/context/SecurityContext';
import '@/lib/bluetooth-types';

export default function StudentScanPage() {
  const [status, setStatus] = useState<'IDLE' | 'BEACON_SEARCH' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [beaconFound, setBeaconFound] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localTxState, setLocalTxState] = useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'ERROR' | 'INVALID_QR'>('IDLE');
  const [isScannerStarting, setIsScannerStarting] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { tempSessionId, fingerprintHash, clearSession } = useSecurity();

  // 1. Auth & Security Check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      }
    };
    checkAuth();
    
    if (!tempSessionId || !fingerprintHash) {
       setStatus('ERROR');
       setErrorMessage("No active security handshake detected. Please login again to re-manifest your identity.");
       return;
    }

    if (typeof window !== 'undefined') {
       if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          setErrorMessage("HTTPS REQUIRED: Camera and Bluetooth are disabled by the browser over insecure connections.");
          setStatus('ERROR');
       }
    }
  }, [router, tempSessionId, fingerprintHash]);

  // 2. Scanner Lifecycle — Low-level Html5Qrcode (UPI Model)
  useEffect(() => {
    let qrEngine: Html5Qrcode | null = null;
    let isStopped = false;
    
    if (beaconFound && status === 'SCANNING') {
      const mountTimer = setTimeout(async () => {
        if (isStopped) return;
        
        const container = document.getElementById("reader");
        if (!container) return;

        try {
          setIsScannerStarting(true);
          
          // Cleanup orphaned instance
          if (scannerRef.current) {
            try {
              if (scannerRef.current.isScanning) await scannerRef.current.stop();
              await scannerRef.current.clear();
            } catch { /* noop */ }
          }

          qrEngine = new Html5Qrcode("reader", { verbose: false });
          scannerRef.current = qrEngine;

          await qrEngine.start(
            { facingMode: "environment" },
            { fps: 25, disableFlip: false },
            onScanSuccess,
            () => {} // Suppress frame errors
          );
          
          if (!isStopped) setIsScannerStarting(false);
        } catch (err: unknown) {
          if (!isStopped) {
            setIsScannerStarting(false);
            const errorMsg = String(err);
            if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
              setErrorMessage("Camera access blocked. Enable permissions in browser settings.");
            } else if (errorMsg.includes("NotFoundError")) {
              setErrorMessage("No camera detected on this device.");
            } else {
              setErrorMessage("Scanner initialization failed. Please refresh.");
            }
          }
        }
      }, 500);

      return () => {
        isStopped = true;
        clearTimeout(mountTimer);
        if (qrEngine && qrEngine.isScanning) {
          qrEngine.stop().catch(() => {});
        }
        scannerRef.current = null;
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beaconFound, status]);

  // 3. Beacon Proximity Search
  const connectToBeacon = async () => {
    setStatus('BEACON_SEARCH');
    setErrorMessage(null);
    setIsBypassed(false);
    try {
      if (!navigator.bluetooth) {
         if (typeof window !== 'undefined' && !window.isSecureContext) {
            throw new Error("Bluetooth Restricted: Access via HTTPS or Localhost required.");
         }
         throw new Error("Web Bluetooth API is not supported on this browser.");
      }
      
      const available = await navigator.bluetooth.getAvailability();
      if (!available) {
         throw new Error("Bluetooth is disabled. Please turn it on and try again.");
      }

      const BEACON_SERVICE_UUID = 'b5c879b2-3be9-450f-90e7-ecad1d7d242c';
      const device = await navigator.bluetooth.requestDevice({
         acceptAllDevices: true,
         optionalServices: [BEACON_SERVICE_UUID]
      });
      if (device) {
         setBeaconFound(true);
         setStatus('SCANNING');
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setStatus('ERROR');
      if (errMsg.includes('User cancelled')) {
         setErrorMessage("Bluetooth scan cancelled. Please try again.");
      } else {
         setErrorMessage(errMsg || "Beacon not detected. Move closer and retry.");
      }
    }
  };

  // 4. UPI Scan Success Handler
  async function onScanSuccess(decodedText: string) {
    try {
      // Haptic pulse
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(100);
      }

      // Pause live sensor (keep hardware warm)
      if (scannerRef.current) await scannerRef.current.pause(true);
      
      setLocalTxState('VERIFYING');
      const qrData = JSON.parse(decodedText);
      const { s_id, t_id, v_code } = qrData; 

      if (!s_id || !t_id || !v_code) {
        throw new Error("Detected Invalid Laboratory QR Signature.");
      }

      // Submit attendance
      const attendanceRequest = await fetch('/api/attendance/submit', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            temp_session_id: tempSessionId,
            class_session_id: s_id,
            t_id,
            v_code,
            beacon_status: isBypassed ? 'BYPASSED' : 'CONNECTED',
            fingerprint_hash: fingerprintHash
         })
      });

      const response = await attendanceRequest.json();

      if (!attendanceRequest.ok) {
         if (response.error?.includes("Device mismatch")) {
            clearSession();
            await supabase.auth.signOut();
            setErrorMessage("SECURITY ALERT: This session was accessed from an unrecognized device.");
            setLocalTxState('ERROR');
            return;
         }
         throw new Error(response.error || "Attendance validation failed.");
      }

      setLocalTxState('SUCCESS');
      setTimeout(() => {
        setStatus('SUCCESS');
        setTimeout(() => router.push('/student'), 2000);
      }, 1200);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setErrorMessage(errMsg || "Institutional Proxy Failure: Signature Rejected.");
      setLocalTxState('INVALID_QR');
      
      // Silent auto-recovery after 3s
      if (!errMsg.includes("SECURITY ALERT")) {
        setTimeout(() => {
          setLocalTxState('IDLE');
          setErrorMessage(null);
          if (scannerRef.current) {
            try { scannerRef.current.resume(); } catch { /* noop */ }
          }
        }, 3000);
      }
    }
  }

  // 5. File Upload Fallback (Isolated Buffer)
  const resizeImageForScan = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
          else { if (h > MAX) { w *= MAX / h; h = MAX; } }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingFile(true);
      setErrorMessage(null);
      if (scannerRef.current && scannerRef.current.isScanning) {
        try { await scannerRef.current.pause(true); } catch { /* noop */ }
      }
      await resizeImageForScan(file);
      const bgDecoder = new Html5Qrcode("file-qr-buffer", { verbose: false });
      try {
        const decoded = await bgDecoder.scanFile(file, false);
        try { await bgDecoder.clear(); } catch { /* noop */ }
        await onScanSuccess(decoded);
      } catch {
        try { await bgDecoder.clear(); } catch { /* noop */ }
        throw new Error("Could not decode QR from this image. Ensure the QR is clear and well-lit.");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setErrorMessage(errMsg);
    } finally {
      setIsProcessingFile(false);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch { /* noop */ }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative">
      {/* UPI Laser Sync Styles */}
      <style jsx global>{`
        @keyframes scanner-laser {
          0% { top: 10%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        #reader video {
          object-fit: cover !important;
          border-radius: 20px !important;
        }
        #reader { border: none !important; }
      `}</style>

      <Link href="/student" className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors duration-300">
         <ArrowLeft size={24} />
      </Link>
      
      <div className="w-full max-w-sm flex flex-col items-center">
        <h1 className="text-2xl font-extrabold text-white mb-2 tracking-tight">Clinical Gateway</h1>
        
        {status === 'SUCCESS' ? (
           <div className="flex flex-col items-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                 <CircleCheckBig size={48} className="text-green-500 animate-bounce" />
              </div>
              <p className="text-xl font-bold text-white mb-2">Authenticated!</p>
              <p className="text-sm text-slate-400 text-center">Your attendance has been cryptographically signed.</p>
           </div>
        ) : status === 'ERROR' && !beaconFound ? (
           <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                 <CircleX size={48} className="text-red-500" />
              </div>
              <p className="text-xl font-bold text-white mb-2 text-center">Connection Failed</p>
              <p className="text-sm text-red-500 text-center px-6 mb-6">{errorMessage}</p>
              <button onClick={connectToBeacon} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-semibold border border-slate-700 transition flex justify-center items-center gap-2">
                 <Bluetooth size={18} /> Try Again
              </button>
              {process.env.NODE_ENV === 'development' && (
                  <button onClick={() => { setBeaconFound(true); setStatus('SCANNING'); setIsBypassed(true); }} className="mt-8 text-[11px] text-slate-500 hover:text-blue-400 uppercase tracking-widest transition-colors font-bold flex items-center gap-2">
                     <ShieldCheck size={14} /> Bypass BLE (Test Mode)
                  </button>
              )}
           </div>
        ) : !beaconFound ? (
           <div className="w-full flex flex-col items-center bg-slate-800/50 p-8 rounded-[40px] border border-slate-700/50 shadow-2xl">
              <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center mb-8 relative">
                 {status === 'BEACON_SEARCH' && (
                     <div className="absolute inset-0 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin"></div>
                 )}
                 <Bluetooth size={40} className="text-blue-500" />
              </div>
              
              <p className="text-sm font-medium text-slate-400 mb-8 text-center px-4 leading-relaxed">
                Connect to the classroom Bluetooth Beacon to verify your physical presence and unlock the QR Reader. 
              </p>
              
              <button 
                 onClick={connectToBeacon} 
                 disabled={status === 'BEACON_SEARCH'}
                 className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-3"
              >
                  <BluetoothSearching size={18} />
                  {status === 'BEACON_SEARCH' ? 'Scanning Proximity...' : 'Connect to Beacon'}
              </button>

              {process.env.NODE_ENV === 'development' && (
                  <button onClick={() => { setBeaconFound(true); setStatus('SCANNING'); setIsBypassed(true); }} className="mt-8 text-[11px] text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors font-bold">
                     Bypass (Dev/Test Mode)
                  </button>
              )}
           </div>
        ) : (
           <>
              <p className="text-sm font-medium text-slate-400 mb-6 text-center px-4 opacity-70">
                Point at the Laboratory QR — auto-detect is active.
              </p>

              {/* UPI Scanner Interface */}
              <div className="w-full aspect-square border-2 border-slate-700 bg-slate-800 rounded-3xl relative overflow-hidden shadow-2xl mb-6">
                 <div id="reader" className="w-full h-full relative z-10"></div>

                 {/* Initializing Overlay */}
                 {isScannerStarting && (
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-40">
                     <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                     <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Initializing Optic Node...</p>
                   </div>
                 )}

                 {/* Laser Sync + Corner Brackets */}
                 {localTxState === 'IDLE' && !isScannerStarting && (
                   <>
                     <div className="absolute top-[10%] left-[10%] right-[10%] bottom-[10%] border-2 border-emerald-500/40 rounded-2xl z-20 pointer-events-none">
                       <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg" />
                       <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg" />
                       <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg" />
                       <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-lg" />
                     </div>
                     <div className="absolute left-[15%] right-[15%] h-[2px] bg-emerald-500 shadow-[0_0_15px_#10b981] z-20 pointer-events-none" style={{ animation: 'scanner-laser 2s infinite linear' }} />
                   </>
                 )}

                 {/* Verifying Overlay */}
                 {localTxState === 'VERIFYING' && (
                   <div className="absolute inset-0 bg-blue-600/60 backdrop-blur-md flex flex-col items-center justify-center text-white z-40 animate-in zoom-in duration-300">
                     <div className="relative mb-6">
                       <div className="w-20 h-20 bg-white/20 border-2 border-white/50 rounded-full flex items-center justify-center animate-pulse">
                         <ShieldCheck size={32} />
                       </div>
                       <div className="absolute inset-0 rounded-full border-2 border-white" style={{ animation: 'pulse-ring 1s infinite' }} />
                     </div>
                     <p className="text-[10px] font-black uppercase tracking-[0.3em] italic">Handshake Active</p>
                   </div>
                 )}

                 {/* Success Overlay */}
                 {localTxState === 'SUCCESS' && (
                   <div className="absolute inset-0 bg-emerald-500 flex flex-col items-center justify-center text-white z-[50] animate-in zoom-in duration-300">
                     <CircleCheckBig size={64} className="mb-4 animate-bounce" />
                     <p className="text-xs font-black uppercase tracking-[0.4em]">Presence Anchored</p>
                   </div>
                 )}

                 {/* Error Overlay (auto-recoverable) */}
                 {(localTxState === 'ERROR' || localTxState === 'INVALID_QR') && (
                   <div className="absolute inset-0 bg-rose-500 flex flex-col items-center justify-center p-8 text-center text-white z-[50] animate-in fade-in duration-300">
                     <TriangleAlert size={40} className="mb-4" />
                     <p className="text-[10px] font-black uppercase tracking-widest mb-2">Sync Interrupted</p>
                     <p className="text-[9px] font-bold text-white/80 leading-relaxed italic">{errorMessage || "Invalid QR Structure"}</p>
                     <p className="mt-8 text-[8px] font-black uppercase tracking-widest opacity-50 animate-pulse">Retrying Interface...</p>
                   </div>
                 )}
              </div>

              {/* Hidden file-scan buffer */}
              <div id="file-qr-buffer" style={{ display: 'none' }} aria-hidden="true" />

              {/* File Upload Fallback */}
              <div className="w-full p-4 bg-slate-800/50 rounded-2xl border border-slate-700/30 relative overflow-hidden">
                {isProcessingFile && (
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-blue-500 mb-2" />
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Optimizing...</p>
                  </div>
                )}
                <label>
                  <input type="file" accept="image/*" onChange={handleFileScan} className="hidden" />
                  <div className="flex items-center justify-center gap-2 py-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 hover:border-blue-500 text-slate-400 hover:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                    <Upload size={14} />
                    Analyze Signature File
                  </div>
                </label>
              </div>

              <div className="w-full mt-4 p-4 bg-emerald-900/20 rounded-2xl border border-emerald-800/30 flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <ShieldCheck size={20} />
                 </div>
                 <div className="flex-1">
                    <p className="text-[11px] font-black text-emerald-500/70 uppercase tracking-widest">UPI Matrix Mode</p>
                    <p className="text-[13px] font-bold text-emerald-400">Point & Detect Active</p>
                 </div>
              </div>
           </>
        )}

        <div className="mt-12 text-center opacity-40">
           <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">LabIntelligence™ Security</p>
        </div>
      </div>
    </div>
  );
}
