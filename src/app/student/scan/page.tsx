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
          if (scannerRef.current) {
            try {
              await scannerRef.current.stop();
              await scannerRef.current.clear();
            } catch {}
            scannerRef.current = null;
          }

          setIsScannerStarting(true);
          qrEngine = new Html5Qrcode("reader", { verbose: false });
          scannerRef.current = qrEngine;

          if (scannerRef.current && !scannerRef.current.isScanning) {
            await scannerRef.current.start(
              { facingMode: "environment" },
              { 
                fps: 10, // Optimized for high-density detection
                qrbox: { width: 320, height: 320 }, // Optimized for reliability
                disableFlip: false 
              },
              onScanSuccess,
              () => {} 
            );
            setIsScannerStarting(false);
          }
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
        (async () => {
          const engineToClean = scannerRef.current;
          if (engineToClean) {
            try {
              if (engineToClean.isScanning) {
                await engineToClean.stop();
              }
              await engineToClean.clear();
            } catch {}
            // Only clear the ref if it hasn't been reassigned by a new effector
            if (scannerRef.current === engineToClean) {
              scannerRef.current = null;
            }
          }
        })();
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
         filters: [{ 
            namePrefix: 'LabBeacon',
            services: [BEACON_SERVICE_UUID] 
         }],
         optionalServices: [BEACON_SERVICE_UUID]
      });

      // Step 2: PROXIMITY VERIFICATION (GATT Handshake)
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Hardware Handshake Failed: Could not connect to the LabBeacon GATT server.");

      try {
        const service = await server.getPrimaryService(BEACON_SERVICE_UUID);
        const characteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
        await characteristic.readValue();
      } finally {
        // BUG: Explicitly close GATT connection to free up hardware resources
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      }

      setBeaconFound(true);
      setStatus('SCANNING');
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
    // Prevent double-processing during existing transitions
    if (localTxState !== 'IDLE') return;

    console.log("QR DETECTED: [Handshake Signature]");
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

      // OPTIMISTIC UI: Mock local success for development bypass
      if (isBypassed) {
         console.log("Shadow Simulation: Anchoring presence locally...");
         setLocalTxState('SUCCESS');
         setTimeout(() => {
            setStatus('SUCCESS');
            setTimeout(() => router.push('/student'), 2000);
         }, 1000);
         return;
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
            beacon_status: 'CONNECTED',
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
      const resizedDataUrl = await resizeImageForScan(file);
      const backgroundBufferId = "file-qr-buffer";
      const bgDecoder = new Html5Qrcode(backgroundBufferId, { verbose: false });
      
      try {
        const blob = await (await fetch(resizedDataUrl)).blob();
        const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
        
        const decoded = await bgDecoder.scanFile(resizedFile, false);
        try { await bgDecoder.clear(); } catch { /* noop */ }
        await onScanSuccess(decoded);
      } catch (scanErr) {
        try { await bgDecoder.clear(); } catch { /* noop */ }
        throw new Error("UNREADABLE_SIGNATURE: The matrix could not decode this image. Ensure the QR is clear and well-lit.");
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative">
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
        #reader { 
          border: none !important;
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          border-radius: 24px !important;
          z-index: 10 !important;
        }
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          display: block !important;
          min-height: 100% !important;
        }
        /* Hide library generated elements that might interfere */
        #reader__status_span, 
        #reader__dashboard_section, 
        #reader__camera_selection,
        #reader img {
          display: none !important;
        }
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>

      <Link href="/student" className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors duration-300 z-50">
         <ArrowLeft size={24} />
      </Link>
      
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black text-white tracking-tight uppercase italic underline decoration-blue-500 underline-offset-8">Scan Signature</h1>
          <p className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Institutional Access Node</p>
        </div>
        
        {status === 'SUCCESS' ? (
           <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 pt-10">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                 <CircleCheckBig size={56} className="text-emerald-500 animate-bounce" />
              </div>
              <p className="text-xl font-black text-white mb-2 uppercase tracking-tight">Access Granted</p>
              <p className="text-xs text-slate-400 text-center font-medium max-w-[200px] leading-relaxed">Your attendance has been cryptographically signed.</p>
           </div>
        ) : status === 'ERROR' && !beaconFound ? (
           <div className="flex flex-col items-center">
              <div className="w-24 h-24 bg-rose-500/20 rounded-full flex items-center justify-center mb-8">
                 <CircleX size={56} className="text-rose-500" />
              </div>
              <p className="text-xl font-black text-white mb-2 uppercase tracking-tight">Sync Refused</p>
              <p className="text-xs text-rose-500 text-center px-10 mb-10 font-bold italic leading-relaxed">{errorMessage}</p>
              <button 
                onClick={connectToBeacon} 
                className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] border border-slate-800 transition-all flex justify-center items-center gap-2 active:scale-95 shadow-xl"
              >
                 <Bluetooth size={16} /> Re-scan Proximity
              </button>
              {process.env.NODE_ENV === 'development' && (
                  <button onClick={() => { setBeaconFound(true); setStatus('SCANNING'); setIsBypassed(true); }} className="mt-10 text-[9px] text-slate-700 hover:text-blue-500 uppercase tracking-widest transition-colors font-black flex items-center gap-2">
                     <ShieldCheck size={12} /> Bypass Peripheral Check
                  </button>
              )}
           </div>
        ) : !beaconFound ? (
           <div className="w-full flex flex-col items-center bg-slate-900/40 p-10 rounded-[48px] border border-white/5 shadow-2xl backdrop-blur-sm">
              <div className="w-28 h-28 rounded-full bg-blue-600/10 flex items-center justify-center mb-10 relative">
                 {status === 'BEACON_SEARCH' && (
                     <div className="absolute -inset-2 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                 )}
                 <Bluetooth size={48} className="text-blue-500" />
              </div>
              
              <p className="text-xs font-bold text-slate-400 mb-10 text-center px-6 leading-relaxed uppercase tracking-tighter opacity-80">
                Establish proximity link with the Classroom Beacon to unlock Optical Verification.
              </p>
              
              <button 
                 onClick={connectToBeacon} 
                 disabled={status === 'BEACON_SEARCH'}
                 className="w-full py-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-blue-900/40 active:scale-95 transition-all flex justify-center items-center gap-3"
              >
                  {status === 'BEACON_SEARCH' ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Syncing Hardware...
                    </>
                  ) : (
                    <>
                      <BluetoothSearching size={18} />
                      Link Beacon
                    </>
                  )}
              </button>

              {process.env.NODE_ENV === 'development' && (
                  <button onClick={() => { setBeaconFound(true); setStatus('SCANNING'); setIsBypassed(true); }} className="mt-10 text-[9px] text-slate-700 hover:text-slate-500 uppercase tracking-widest transition-colors font-black">
                     Secure Bypass (Dev)
                  </button>
              )}
           </div>
        ) : (
           <>
              <p className="text-[10px] font-black text-slate-500 mb-8 text-center px-4 uppercase tracking-[0.2em] italic">
                Scanning for Institutional Signatures...
              </p>

              {/* UPI Scanner Interface */}
              <div className="w-full aspect-square border border-white/10 bg-[#0a0a0a] rounded-[32px] relative overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] mb-8">
                 <div id="reader" className="w-full h-full"></div>

                 {/* Initializing Overlay */}
                 {isScannerStarting && (
                   <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-40">
                     <Loader2 size={40} className="animate-spin text-blue-500 mb-6" />
                     <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Awakening Optics...</p>
                   </div>
                 )}

                 {/* Laser Sync + Corner Brackets */}
                 {false && (
                   <>
                     <div className="absolute top-[12.5%] left-[12.5%] right-[12.5%] bottom-[12.5%] border border-emerald-500/20 rounded-3xl z-20 pointer-events-none">
                       <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-emerald-500 rounded-tl-2xl shadow-[-5px_-5px_15px_-5px_#10b981]" />
                       <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-emerald-500 rounded-tr-2xl shadow-[5px_-5px_15px_-5px_#10b981]" />
                       <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-emerald-500 rounded-bl-2xl shadow-[-5px_5px_15px_-5px_#10b981]" />
                       <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-emerald-500 rounded-br-2xl shadow-[5px_5px_15px_-5px_#10b981]" />
                     </div>
                     <div className="absolute left-[15%] right-[15%] h-[4px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_20px_#10b981] z-20 pointer-events-none" style={{ animation: 'scanner-laser 1.5s infinite linear' }} />
                   </>
                 )}

                 {/* Verifying Overlay */}
                 {localTxState === 'VERIFYING' && (
                   <div className="absolute inset-0 bg-blue-600/80 backdrop-blur-xl flex flex-col items-center justify-center text-white z-40 animate-in zoom-in duration-300">
                     <div className="relative mb-8">
                       <div className="w-24 h-24 bg-white/10 border border-white/20 rounded-full flex items-center justify-center animate-pulse">
                         <ShieldCheck size={40} />
                       </div>
                       <div className="absolute inset-x-[-10px] inset-y-[-10px] rounded-full border border-white/30" style={{ animation: 'pulse-ring 1s infinite' }} />
                     </div>
                     <p className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none">Securing Handshake</p>
                   </div>
                 )}

                 {/* Success Overlay */}
                 {localTxState === 'SUCCESS' && (
                   <div className="absolute inset-0 bg-emerald-500 flex flex-col items-center justify-center text-white z-[50] animate-in zoom-in duration-300">
                     <CircleCheckBig size={80} className="mb-6 animate-bounce" />
                     <p className="text-xs font-black uppercase tracking-[0.5em]">Identity Anchored</p>
                   </div>
                 )}

                 {/* Error Overlay (auto-recoverable) */}
                 {(localTxState === 'ERROR' || localTxState === 'INVALID_QR') && (
                   <div className="absolute inset-0 bg-rose-600 flex flex-col items-center justify-center p-10 text-center text-white z-[50] animate-in fade-in duration-300">
                     <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-6">
                        <TriangleAlert size={48} />
                     </div>
                     <p className="text-[11px] font-black uppercase tracking-widest mb-4">Verification Fault</p>
                     <p className="text-[10px] font-bold text-white/90 leading-relaxed italic mb-10">{errorMessage || "Invalid QR Protocol"}</p>
                     <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white animate-[progress_3s_linear]" style={{ width: '100%' }} />
                     </div>
                     <p className="mt-4 text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Re-initializing Live Feed...</p>
                   </div>
                 )}
              </div>

              {/* Hidden file-scan buffer */}
              <div id="file-qr-buffer" style={{ display: 'none' }} aria-hidden="true" />

              {/* File Upload Fallback */}
              <div className="w-full p-4 bg-slate-900/50 rounded-3xl border border-white/5 relative overflow-hidden group">
                {isProcessingFile && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-blue-500 mb-2" />
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Optimizing Node...</p>
                  </div>
                )}
                <label className="block w-full">
                  <input type="file" accept="image/*" onChange={handleFileScan} className="hidden" />
                  <div className="flex items-center justify-center gap-3 py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 group-hover:border-blue-500/50 text-slate-500 group-hover:text-blue-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all cursor-pointer select-none">
                    <Upload size={16} />
                    Import Static Signature
                  </div>
                </label>
              </div>

              <div className="w-full mt-6 p-5 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex items-center gap-5">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-inner">
                    <ShieldCheck size={24} />
                 </div>
                 <div className="flex-1">
                    <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em]">UPI Matrix Alpha</p>
                    <p className="text-sm font-black text-emerald-400 tracking-tight uppercase italic">Secure Handshake Active</p>
                 </div>
              </div>
           </>
        )}

        <div className="mt-16 text-center opacity-20">
           <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white">SD-DASHBOARD v3.0</p>
        </div>
      </div>

    </div>
  );
}
