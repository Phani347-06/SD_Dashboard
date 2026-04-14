"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Wifi,
    ShieldCheck,
    CircleCheckBig,
    ArrowRight,
    AlertCircle,
    Database,
    Clock,
    CircleUser,
    TriangleAlert,
    FlaskConical,
    Loader2,
    Activity,
    Upload
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from "@/lib/supabase";
import { useSecurity } from "@/context/SecurityContext";
import '@/lib/bluetooth-types';

// Types for the Attendance Flow
type AttendanceStatus = 'LAB_SELECT' | 'SEARCHING_BEACON' | 'BEACON_LOCKED' | 'SCANNING_QR' | 'VERIFYING' | 'CONFIRMED' | 'ERROR';

interface EnrolledLab {
    id: string;
    name: string;
    description: string;
}

interface ActiveSession {
    id: string;
    course_code: string;
    status?: 'ACTIVE' | 'COMPLETED';
}

interface AttendanceLog {
    id: string;
    scanned_at: string;
    final_status: string;
    class_sessions?: {
        course_code?: string | null;
    } | null;
}

interface AttendanceQrPayload {
    s_id?: string;
    t_id?: string;
    v_code?: string;
    [key: string]: unknown;
}

export default function AttendancePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { tempSessionId, fingerprintHash } = useSecurity();

    const [isTestMode, setIsTestMode] = useState(false);

    // Core Logic States
    const [status, setStatus] = useState<AttendanceStatus>('LAB_SELECT');
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [enrolledLabs, setEnrolledLabs] = useState<EnrolledLab[]>([]);
    const [selectedLab, setSelectedLab] = useState<EnrolledLab | null>(null);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);

    // UI States
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSecure, setIsSecure] = useState<boolean | null>(null);
    const [isIntegrityScanning, setIsIntegrityScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanState, setScanState] = useState("");
    const [isScannerStarting, setIsScannerStarting] = useState(false);
    const [localTxState, setLocalTxState] = useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'ERROR' | 'INVALID_QR'>('IDLE');
    const scannerRef = useRef<Html5Qrcode | null>(null);

    // 1. Initial Identity & Lab Roster Fetch
    useEffect(() => {
        const initHub = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            // Fetch Enrolled Labs
            console.log("🛰️ Hub Sync Initiated for Student:", user.id);
            try {
                const enrollRes = await fetch('/api/enrollment');
                const enrollData = await enrollRes.json();

                if (enrollData.success) {
                    const labs = enrollData.labs;
                    setEnrolledLabs(labs);

                    const labId = searchParams.get('lab');
                    if (labId) {
                        const lab = labs.find((l: EnrolledLab) => l.id === labId);
                        if (lab) setSelectedLab(lab);
                    }
                } else {
                    setErrorMessage(`Enrollment Sync Error: ${enrollData.error || "Unknown response protocol"}`);
                }
            } catch (err) {
                console.error("❌ Enrollment API Failure:", err);
                setErrorMessage("SYSTEM: Enrollment handoff failed. Check network or permissions.");
            }

            // Fetch Attendance Logs
            try {
                const logsRes = await fetch('/api/attendance/logs?limit=10');
                const logsData = await logsRes.json();
                if (logsData.success) {
                    setAttendanceLogs(logsData.logs);
                }
            } catch (err) {
                console.error("❌ Ledger API Failure:", err);
            }

            setLoading(false);

            // Diagnostic: Check for Secure Context & Bluetooth Availability
            if (typeof window !== 'undefined') {
                setIsSecure(window.isSecureContext);

                if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
                    await navigator.bluetooth.getAvailability();
                }

                if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    setErrorMessage("CRITICAL: HTTPS REQUIRED. Mobile browsers block Camera & Bluetooth on non-secure connections. Access via local HTTPS tunnel or check Institutional Dev Docs.");
                }
            }
        };
        initHub();
    }, [router, searchParams]);

    // 2. Beacon Manifestation - Searching for Active Laboratory Sessions
    const startBeaconSearch = async () => {
        if (!selectedLab) return;
        setStatus('SEARCHING_BEACON');
        setErrorMessage(null);

        if (isTestMode) {
            setActiveSession({
                id: 'test-session-manifest-001',
                course_code: 'VANGUARD-TEST-NODE'
            });
            setStatus('BEACON_LOCKED');
            return;
        }

        try {
            // Step 1: HARDWARE PROXIMITY VERIFICATION
            // This strictly locks attendance to physical ESP32 proximity. Proxies blocked.
            if (!navigator.bluetooth) {
                if (!isSecure) {
                    throw new Error("Bluetooth Restricted: This API requires a Secure Context (HTTPS). Connect via local node or secure tunnel.");
                }
                throw new Error("Web Bluetooth not supported on this browser.");
            }

            const isAvailable = await navigator.bluetooth.getAvailability();
            if (!isAvailable) {
                throw new Error("Bluetooth is disabled on this device. Please turn on Bluetooth and try again.");
            }

            const device = await navigator.bluetooth.requestDevice({
                filters: [{
                    namePrefix: 'LabBeacon',
                    services: ['b5c879b2-3be9-450f-90e7-ecad1d7d242c']
                }],
                optionalServices: ['b5c879b2-3be9-450f-90e7-ecad1d7d242c']
            });

            // Step 2: PROXIMITY VERIFICATION (GATT Handshake)
            // Real proximity proof: connect and read a characteristic
            const server = await device.gatt?.connect();
            if (!server) throw new Error("Hardware Handshake Failed: Could not connect to the LabBeacon GATT server.");

            try {
                const service = await server.getPrimaryService('b5c879b2-3be9-450f-90e7-ecad1d7d242c');
                const characteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
                await characteristic.readValue(); // Verifies physical proximity by reading a protected value
            } finally {
                // BUG: Ensure we disconnect even if handshake read fails
                if (device.gatt?.connected) {
                    device.gatt.disconnect();
                }
            }

            // Step 3: Faculty Matrix Validation (Database)
            console.log("🔍 Checking Sessions for Lab:", selectedLab.id, "Name:", selectedLab.name);
            const { data: sessionList, error } = await supabase
                .from('class_sessions')
                .select('id, course_code, status')
                .eq('lab_id', selectedLab.id)
                .in('status', ['ACTIVE', 'COMPLETED'])
                .order('status', { ascending: true }) // Prioritize ACTIVE (A) over COMPLETED (C)
                .order('date', { ascending: false })   // Then most recent
                .limit(1);

            const sessions = sessionList && sessionList.length > 0 ? sessionList[0] : null;

            if (error || !sessions) {
                console.warn("⚠️ No Session Found in Matrix:", error);
                setErrorMessage(`Hardware detected, but no digital class session active for ${selectedLab.name}. Ensure Faculty has 'Started Session'.`);
                setStatus('LAB_SELECT');
                return;
            }

            if (sessions.status === 'COMPLETED') {
                setErrorMessage(`The session for ${selectedLab.name} has already ended.`);
                setStatus('LAB_SELECT');
                return;
            }

            console.log("✅ Digital Session Locked:", sessions.id);
            setActiveSession(sessions);
            setStatus('BEACON_LOCKED');
        } catch (err: unknown) {
            console.error("Proximity Check Failed:", err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setErrorMessage(errorMessage || "Failed to detect Hardware ESP32 Beacon. Move closer to the classroom node.");
            setStatus('LAB_SELECT');
        }
    };

    // 3. Scanner Protocol (Isolated Matrix Upgrade)
    useEffect(() => {
        let qrEngine: Html5Qrcode | null = null;
        let isStopped = false;

        // UPI Refinement: Initializing scanner EARLIER (as soon as beacon search starts)
        // This keeps the DOM mounted and "hot" so switching to SCANNING_QR is instant.
        const shouldInitialize = status === 'SCANNING_QR';

        if (shouldInitialize) {
            const mountPointTimer = setTimeout(async () => {
                if (isStopped) return;

                const container = document.getElementById("attendance-reader");
                if (!container) return;

                try {
                    if (scannerRef.current) {
                        try {
                            await scannerRef.current.stop();
                            await scannerRef.current.clear();
                        } catch { }
                        scannerRef.current = null;
                    }

                    setIsScannerStarting(true);
                    qrEngine = new Html5Qrcode("attendance-reader", { verbose: false });
                    scannerRef.current = qrEngine;

                    if (status === 'SCANNING_QR' && scannerRef.current && !scannerRef.current.isScanning) {
                        const config = {
                            fps: 10, // Optimized for reliability on dense patterns
                            disableFlip: false,
                            qrbox: { width: 320, height: 320 }, // Optimized Google Pay size
                        };

                        await scannerRef.current.start(
                            { facingMode: "environment" },
                            config,
                            onScanSuccess,
                            () => { }
                        );
                        setIsScannerStarting(false);
                        console.log("Matrix Scanner: Optic sensor online.");
                    }
                } catch (err: unknown) {
                    if (!isStopped) {
                        setIsScannerStarting(false);
                        console.error("Optic Initialization Failure:", err);
                        const errorMsg = String(err);

                        if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
                            setErrorMessage("SECURE HANDSHAKE DENIED: Camera access blocked. Enable permissions in browser settings.");
                        } else if (errorMsg.includes("NotFoundError")) {
                            setErrorMessage("HARDWARE ERROR: No valid optical sensor detected.");
                        } else {
                            setErrorMessage("SCANNER_FAILURE: Interface collision or hardware lock. Please refresh the matrix.");
                        }
                    }
                }
            }, 500);

            return () => {
                isStopped = true;
                clearTimeout(mountPointTimer);
                (async () => {
                    const engineToClean = scannerRef.current;
                    if (engineToClean) {
                        try {
                            if (engineToClean.isScanning) {
                                await engineToClean.stop();
                            }
                            await engineToClean.clear();
                        } catch (e) {
                            console.error("Optic Handoff Failure:", e);
                        }
                        // Only clear the ref if it hasn't been reassigned by a new effector
                        if (scannerRef.current === engineToClean) {
                            scannerRef.current = null;
                        }
                    }
                })();
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    async function onScanSuccess(decodedText: string) {
        // Prevent double-processing during existing transitions
        if (localTxState !== 'IDLE') return;

        console.log("QR DETECTED: [Handshake Signature]");
        try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(100);
            }

            if (scannerRef.current) await scannerRef.current.pause(true);

            setLocalTxState('VERIFYING');
            const data = JSON.parse(decodedText) as AttendanceQrPayload & { exp?: number };

            // 🛑 Issue #5: QR Expiry Check (Critical for Security)
            if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
                throw new Error("QR Signature Expired. Please ask the faculty to refresh the code.");
            }

            if (!isTestMode && data.s_id !== activeSession?.id) {
                throw new Error("Mismatched Laboratory Node. QR from an unauthorized unit.");
            }

            // 🚀 UPI Refinement: OPTIMISTIC UI
            // Show success immediately to the student if the local checks pass
            setLocalTxState('SUCCESS');

            // Fire API in background (Don't await if we want instant feel, but handle errors)
            handleSubmitAttendance(data);

            // Shave time off the transition
            setTimeout(() => setStatus('CONFIRMED'), 1000);

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setErrorMessage(errorMessage || "Invalid Matrix QR Signature detected.");
            setLocalTxState('INVALID_QR');
            setTimeout(() => {
                setLocalTxState('IDLE');
                setErrorMessage(null);
                // Standard Resume: No setStatus here, so manual resume is REQUIRED
                if (scannerRef.current) scannerRef.current.resume();
            }, 3000);
        }
    }

    const handleSubmitAttendance = async (qrData: AttendanceQrPayload) => {
        // 🛑 Issue #3: Provide feedback if state is missing
        if (!tempSessionId || !fingerprintHash || !selectedLab || !activeSession) {
            if (!isTestMode) {
                setLocalTxState('ERROR');
                setErrorMessage("Identity session lost. Please login again.");
                return;
            }
        }

        // 🛑 Issue #8: Correct Test Mode behavior
        if (isTestMode) {
            console.log("Shadow Simulation: Anchoring presence locally...");
            return;
        }

        try {
            const response = await fetch('/api/attendance/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': tempSessionId || '',
                    'x-fingerprint': fingerprintHash || ''
                },
                body: JSON.stringify({
                    s_id: qrData.s_id,
                    t_id: qrData.t_id,
                    v_code: qrData.v_code,
                    beacon_status: 'CONNECTED'
                })
            });

            const result = await response.json();

            if (!result.success) {
                setErrorMessage(result.error || "Submission rejected by central matrix.");
                setLocalTxState('ERROR');
                // Auto-recovery to allow student to try again if it was a server rejection
                setTimeout(() => {
                    setStatus('SCANNING_QR'); // Triggers effect teardown & re-init
                    setLocalTxState('IDLE');
                    // Redundant: scanner is destroyed/recreated by setStatus('SCANNING_QR')
                }, 3000);
            }
        } catch {
            setErrorMessage("Transmission Failure: Encryption node unreachable.");
            setLocalTxState('ERROR');
        }
    };

    const performIntegrityScan = async () => {
        setIsIntegrityScanning(true);
        const steps = [
            "Initializing Shield Protocol...",
            "Validating Hardware Anchor...",
            "Checking SHA-256 Digest Integrity...",
            "Verify Enrolled Laboratory Cohorts...",
            "Identity Hub Synchronized."
        ];

        for (let i = 0; i < steps.length; i++) {
            setScanState(steps[i]);
            setScanProgress((i + 1) * 20);
            await new Promise(r => setTimeout(r, 600));
        }

        setTimeout(() => {
            setIsIntegrityScanning(false);
            setScanProgress(0);
        }, 1000);
    };

    // 5. Institutional File Manifestation (HTTP Fallback)
    const resizeImageForScan = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
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
                try {
                    await scannerRef.current.pause(true);
                } catch { }
            }

            const resizedDataUrl = await resizeImageForScan(file);
            const backgroundBufferId = "file-qr-buffer";
            const html5QrCode = new Html5Qrcode(backgroundBufferId, { verbose: false });

            try {
                // 🛑 Issue #6: Use the resized image data URL for scanning
                const decodedText = await html5QrCode.scanFile(new File([await (await fetch(resizedDataUrl)).blob()], file.name), false);
                try { await html5QrCode.clear(); } catch { }
                await onScanSuccess(decodedText);
            } catch {
                try { await html5QrCode.clear(); } catch { }
                throw new Error("UNREADABLE_SIGNATURE: The matrix could not decode this entry. Ensure the QR is clear and well-lit.");
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setErrorMessage(errorMessage || "File Manifestation Failure: Invalid or unreadable QR Signature.");
        } finally {
            setIsProcessingFile(false);
            if (scannerRef.current) {
                try { scannerRef.current.resume(); } catch { }
            }
        }
    };

    const runShadowSimulation = () => {
        const testData = JSON.stringify({
            s_id: activeSession?.id,
            lab_id: selectedLab?.id,
            temp_session_id: 'test-temp-qr-manifest',
            verification_code: '999999'
        });
        onScanSuccess(testData);
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
                <Loader2 size={48} className="text-[#0052a5] animate-spin" strokeWidth={3} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Loading Presence Matrix...</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-20 animate-in fade-in duration-700">
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
                #attendance-reader video {
                    object-fit: contain !important;
                    background: black;
                    border-radius: 28px !important;
                    width: 100% !important;
                    height: 100% !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                }
                #attendance-reader {
                    border: none !important;
                    width: 100% !important;
                    height: 100% !important;
                    position: relative !important;
                    overflow: hidden !important;
                }
                #attendance-reader > div {
                    width: 100% !important;
                    height: 100% !important;
                }
                #attendance-reader img {
                    display: none !important;
                }
            `}</style>

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2 lg:px-0">
                <div>
                    <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tighter mb-2 font-display">Institutional Attendance Node</h2>
                    <p className="text-slate-400 font-medium text-xs lg:text-sm">Managing cryptographically signed laboratory presence and academic credits.</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-3 bg-white px-8 py-4 rounded-full border border-slate-100 shadow-xl shadow-blue-500/5">
                        <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isTestMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#0052a5]">
                            {isTestMode ? 'Shadow Beacon: Test Mode' : 'Beacon Network: Active'}
                        </span>
                    </div>
                </div>
            </header>

            {/* Attendance Stepper Matrix */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                <div className="lg:col-span-8">
                    <div className="bg-white rounded-[40px] lg:rounded-[50px] border border-slate-100 p-6 lg:p-12 shadow-sm relative overflow-hidden group min-h-[500px] lg:min-h-[550px] flex flex-col justify-center">

                        <div className="absolute top-10 right-10 text-[60px] font-black text-slate-50 opacity-40 select-none tracking-tighter pointer-events-none group-hover:text-blue-50 transition-colors uppercase">
                            {status.split('_')[0]}
                        </div>

                        <AnimatePresence mode="wait">
                            {status === 'LAB_SELECT' && (
                                <motion.div key="lab" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center text-center">
                                    <div className="w-28 h-28 bg-[#0052a5]/5 text-[#0052a5] rounded-[40px] flex items-center justify-center mb-10 shadow-inner group-hover:rotate-3 transition-transform">
                                        <FlaskConical size={56} strokeWidth={2.5} />
                                    </div>
                                    <h3 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tighter mb-4 leading-none font-display">Select Laboratory Node</h3>
                                    <p className="text-slate-400 text-sm lg:text-lg font-medium mb-8 lg:mb-12 max-w-sm mx-auto">Identify the laboratory cohort you are currently attending to manifest a beacon search.</p>

                                    <div className="w-full max-w-sm grid grid-cols-1 gap-3 lg:gap-4 mb-8 lg:mb-10">
                                        {enrolledLabs.length === 0 ? (
                                            <p className="p-8 bg-slate-50 rounded-3xl text-[11px] font-black text-slate-400 uppercase tracking-widest">No Enrolled Hubs Detected</p>
                                        ) : (
                                            enrolledLabs.map((lab) => (
                                                <button
                                                    key={lab.id}
                                                    onClick={() => { setSelectedLab(lab); setErrorMessage(null); }}
                                                    className={`p-6 rounded-3xl border text-left transition-all flex items-center justify-between ${selectedLab?.id === lab.id ? 'bg-[#f0f7ff] border-blue-500 shadow-xl shadow-blue-500/5' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                                                >
                                                    <div>
                                                        <p className={`text-[13px] font-black tracking-tight ${selectedLab?.id === lab.id ? 'text-[#0052a5]' : 'text-slate-900'}`}>{lab.name}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{lab.description || "Experimental Node"}</p>
                                                    </div>
                                                    {selectedLab?.id === lab.id && <CircleCheckBig size={20} className="text-[#0052a5]" />}
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    {errorMessage && (
                                        <div className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3">
                                            <TriangleAlert size={16} className="text-rose-500" />
                                            <p className="text-[11px] font-black text-rose-700 uppercase tracking-widest">{errorMessage}</p>
                                        </div>
                                    )}

                                    {selectedLab && (
                                        <button
                                            onClick={startBeaconSearch}
                                            className="bg-[#0052a5] text-white w-full sm:w-auto px-10 lg:px-12 py-4 lg:py-5 rounded-[24px] lg:rounded-[28px] text-[11px] lg:text-[12px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4"
                                        >
                                            {isTestMode ? "Manifest Shadow Beacon" : "Connect to Beacon"} <ArrowRight size={20} />
                                        </button>
                                    )}
                                </motion.div>
                            )}

                            {status === 'SEARCHING_BEACON' && (
                                <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center">
                                    <div className="relative mb-12">
                                        <div className="w-40 h-40 bg-blue-50 rounded-full flex items-center justify-center text-[#0052a5]">
                                            <Wifi size={72} className="animate-pulse" />
                                        </div>
                                        <motion.div animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 border-4 border-blue-200 rounded-full"></motion.div>
                                    </div>
                                    <h4 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Querying Matrix for {selectedLab?.name}...</h4>
                                    <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.2em] animate-pulse">Scanning Proximal Frequencies</p>
                                </motion.div>
                            )}

                            {status === 'BEACON_LOCKED' && (
                                <motion.div key="locked" initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center text-center">
                                    <div className="w-32 h-32 bg-emerald-50 text-emerald-600 rounded-[40px] flex items-center justify-center mb-10 shadow-xl shadow-emerald-500/5 transition-transform">
                                        <ShieldCheck size={56} strokeWidth={2.5} />
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-4">Laboratory Beacon Initialized</h3>
                                    <p className="text-slate-400 text-lg font-medium mb-12 max-w-sm">Verification Handshake ready for {activeSession?.course_code}. Proceed to QR scan.</p>
                                    <div className="flex gap-4">
                                        <button onClick={() => setStatus('SCANNING_QR')} className="bg-[#0052a5] text-white px-12 py-5 rounded-3xl text-[12px] font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20 active:scale-95 transition-all">Launch Scanner</button>
                                        <button onClick={() => setStatus('LAB_SELECT')} className="px-10 py-5 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-rose-500 transition-colors">Abort</button>
                                    </div>
                                </motion.div>
                            )}

                            {status === 'SCANNING_QR' && (
                                <motion.div key="scanning" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center w-full">
                                    <div className="w-full max-w-sm aspect-square bg-slate-900 rounded-[40px] overflow-hidden border-[12px] border-white shadow-2xl relative">
                                        <div id="attendance-reader" className="w-full h-full relative z-10"></div>

                                        {isScannerStarting && (
                                            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center text-white z-40">
                                                <Loader2 size={40} className="animate-spin mb-4 text-[#0052a5]" />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Initializing Optic Node...</p>
                                            </div>
                                        )}

                                        {/* B-Case Tuning: Brackets suppressed for maximum hardware camera acceleration */}
                                        {false && (
                                            <>
                                                <div className="absolute top-[10%] left-[10%] right-[10%] bottom-[10%] border-2 border-emerald-500/40 rounded-3xl z-20 pointer-events-none">
                                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg" />
                                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg" />
                                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg" />
                                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-lg" />
                                                </div>
                                                <div className="absolute left-[15%] right-[15%] h-[2px] bg-emerald-500 shadow-[0_0_15px_#10b981] z-20 pointer-events-none" style={{ animation: 'scanner-laser 2s infinite linear' }} />
                                            </>
                                        )}

                                        {localTxState === 'VERIFYING' && (
                                            <div className="absolute inset-0 bg-[#0052a5]/60 backdrop-blur-md flex flex-col items-center justify-center text-white z-40 animate-in zoom-in duration-300">
                                                <div className="relative mb-6">
                                                    <div className="w-20 h-20 bg-white/20 border-2 border-white/50 rounded-full flex items-center justify-center animate-pulse">
                                                        <ShieldCheck size={32} />
                                                    </div>
                                                    <div className="absolute inset-0 rounded-full border-2 border-white" style={{ animation: 'pulse-ring 1s infinite' }} />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] italic">Handshake Active</p>
                                            </div>
                                        )}

                                        {localTxState === 'SUCCESS' && (
                                            <div className="absolute inset-0 bg-emerald-500 flex flex-col items-center justify-center text-white z-[50] animate-in zoom-in duration-300">
                                                <CircleCheckBig size={64} className="mb-4 animate-bounce" />
                                                <p className="text-xs font-black uppercase tracking-[0.4em]">Presence Anchored</p>
                                            </div>
                                        )}

                                        {(localTxState === 'ERROR' || localTxState === 'INVALID_QR') && (
                                            <div className="absolute inset-0 bg-rose-500 flex flex-col items-center justify-center p-8 text-center text-white z-[50] animate-in fade-in duration-300">
                                                <TriangleAlert size={40} className="mb-4" />
                                                <p className="text-[10px] font-black uppercase tracking-widest mb-2">Sync Interrupted</p>
                                                <p className="text-[9px] font-bold text-white/80 leading-relaxed italic">{errorMessage || "Invalid QR Structure"}</p>
                                                <p className="mt-8 text-[8px] font-black uppercase tracking-widest opacity-50 animate-pulse">Retrying Interface...</p>
                                            </div>
                                        )}

                                        {isTestMode && localTxState === 'IDLE' && (
                                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60]">
                                                <button
                                                    onClick={runShadowSimulation}
                                                    className="bg-emerald-500 text-white px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-black/40 hover:scale-105 active:scale-95 transition-all"
                                                >
                                                    Simulate QR Scan
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div id="file-qr-buffer" style={{ display: 'none' }} aria-hidden="true" />

                                    <div className="mt-8 flex flex-col items-center gap-4 w-full max-w-sm">
                                        <div className="flex items-center gap-4 text-slate-300">
                                            <div className="w-2 h-2 bg-[#0052a5] rounded-full animate-pulse" />
                                            <p className="text-[10px] font-black uppercase tracking-widest leading-none">UPI Matrix Mode: Point & Detect</p>
                                        </div>

                                        <div className="p-5 lg:p-6 bg-slate-50 rounded-[32px] border border-slate-100 w-full group/fallback relative overflow-hidden">
                                            {isProcessingFile && (
                                                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-4">
                                                    <Loader2 size={32} className="animate-spin text-[#0052a5] mb-2" />
                                                    <p className="text-[9px] font-black text-[#0052a5] uppercase tracking-widest text-center">Optimizing...</p>
                                                </div>
                                            )}
                                            <label className="flex-1">
                                                <input type="file" accept="image/*" onChange={handleFileScan} className="hidden" />
                                                <div className="flex items-center justify-center gap-2 py-4 bg-white border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                                                    <Upload size={14} />
                                                    Analyze Signature File
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </motion.div>
                            )}


                            {status === 'CONFIRMED' && (
                                <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center text-center py-6">
                                    <div className="w-32 h-32 bg-emerald-500 text-white rounded-[40px] flex items-center justify-center mb-10 shadow-2xl shadow-emerald-500/40 relative">
                                        <CircleCheckBig size={64} strokeWidth={3} />
                                        <motion.div initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1, repeat: Infinity }} className="absolute inset-0 border-4 border-emerald-500 rounded-[40px]" />
                                    </div>
                                    <h4 className="text-5xl font-black text-slate-900 tracking-tighter mb-4 font-display">Presence Confirmed</h4>
                                    <p className="text-slate-400 font-medium text-[13px] uppercase tracking-widest mb-12">Academic ledger updated for {activeSession?.course_code}.</p>
                                    <button onClick={() => { setStatus('LAB_SELECT'); router.push('/student'); }} className="px-12 py-5 bg-slate-900 text-white rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-black/10 hover:bg-black transition-all active:scale-95">Return to Command Central</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Sidebar Stats Hub */}
                <div className="lg:col-span-4 space-y-10">
                    <div className="bg-white rounded-[40px] border border-slate-100 p-10 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none group-hover:bg-blue-100/50 transition-colors" />
                        <h4 className="text-xl font-black text-slate-900 tracking-tighter mb-10 leading-none">Institutional Standing</h4>
                        <div className="space-y-10">
                            {[
                                { name: "System Uptime", val: "99.9%", color: "emerald-500" },
                                { name: "Lab Trust Score", val: "100%", color: "blue-500" },
                                { name: "Weekly Attendance", val: "88%", color: "amber-500" },
                                { name: "Identity Grade", val: "Tier 1", color: "emerald-500" }
                            ].map((sub, i) => (
                                <div key={i} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-300">{sub.name}</p>
                                        <p className="text-[11px] font-black text-slate-900">{sub.val}</p>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: sub.val.includes('%') ? sub.val : '100%' }}
                                            transition={{ delay: 1 + (i * 0.1), duration: 1 }}
                                            className={`h-full rounded-full ${sub.color === 'emerald-500' ? 'bg-emerald-500' :
                                                sub.color === 'blue-500' ? 'bg-blue-500' :
                                                    sub.color === 'amber-500' ? 'bg-amber-500' : 'bg-slate-400'
                                                }`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-[50px] p-10 text-white shadow-2xl shadow-blue-900/40 group relative overflow-hidden">
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500 rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity" />
                        <ShieldCheck size={48} className="mb-8 text-blue-400 group-hover:scale-110 transition-transform" />
                        <h4 className="text-2xl font-black tracking-tighter mb-4 leading-tight font-display">Zero-Trust Presence Hub</h4>
                        <p className="text-blue-100/40 text-[13px] font-medium leading-relaxed mb-10">Your presence is anchored to the 64-character SHA-256 institutional digest generated for this device node.</p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={performIntegrityScan}
                                className="w-full py-4 bg-white/5 border border-white/10 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all flex items-center justify-center gap-3 active:scale-95"
                            >
                                Integrity Check <Activity size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsTestMode(!isTestMode);
                                    setStatus('LAB_SELECT');
                                    setActiveSession(null);
                                    setErrorMessage(null);
                                }}
                                className={`w-full py-4 border rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 ${isTestMode ? 'bg-amber-500 border-amber-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                            >
                                {isTestMode ? 'Disable Shadow Beacon' : 'Enable Shadow Beacon (Test Mode)'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Historic Presence Ledger */}
            <section className="bg-white rounded-[50px] border border-slate-100 shadow-sm p-12 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-50" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16 relative z-10">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-black/10">
                            <Database size={24} />
                        </div>
                        <div>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter font-display leading-none mb-2">Institutional Ledger</h3>
                            <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">Immutable Record of Research Node Presence</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto relative z-10">
                    {attendanceLogs.length === 0 ? (
                        <div className="py-20 text-center bg-slate-50/50 rounded-[40px] border border-dashed border-slate-100">
                            <Clock size={48} className="text-slate-200 mx-auto mb-6" />
                            <p className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-300">Awaiting presence node manifest...</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-50">
                                    <th className="pb-8 text-[11px] uppercase font-black tracking-[0.25em] text-slate-300 pl-4">Class Node</th>
                                    <th className="pb-8 text-[11px] uppercase font-black tracking-[0.25em] text-slate-300">Status Matrix</th>
                                    <th className="pb-8 text-[11px] uppercase font-black tracking-[0.25em] text-slate-300">Manifested At</th>
                                    <th className="pb-8 text-[11px] uppercase font-black tracking-[0.25em] text-slate-300 text-right pr-4">Node ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {attendanceLogs.map((log, i) => (
                                    <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="py-8 pl-4">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-2xl bg-[#0052a5]/5 flex items-center justify-center text-[#0052a5] group-hover:bg-[#0052a5] group-hover:text-white transition-all transform group-hover:scale-105 shadow-sm">
                                                    <CircleUser size={28} />
                                                </div>
                                                <div>
                                                    <p className="text-[16px] font-black text-slate-900 tracking-tight mb-1 group-hover:text-[#0052a5] transition-colors">{log.class_sessions?.course_code || "Experimental Lab"}</p>
                                                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0052a5]/40 group-hover:text-[#0052a5]/60 transition-colors">Vanguard Laboratory Cohort</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-8">
                                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.1em] ${log.final_status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                                                }`}>
                                                {log.final_status === 'VERIFIED' ? <CircleCheckBig size={12} strokeWidth={3} /> : <AlertCircle size={12} strokeWidth={3} />}
                                                {log.final_status}
                                            </div>
                                        </td>
                                        <td className="py-8">
                                            <div>
                                                <p className="text-[13px] font-black text-slate-700 tracking-tight leading-none mb-1">{new Date(log.scanned_at).toLocaleDateString()}</p>
                                                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </td>
                                        <td className="py-8 text-right pr-4">
                                            <span className="text-[10px] font-black text-slate-200 uppercase tracking-tighter group-hover:text-[#0052a5]/20 transition-colors font-mono tracking-tight">{log.id.slice(0, 13)}...</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {/* Integrity Scan Overlay */}
            <AnimatePresence>
                {isIntegrityScanning && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-6 text-white"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 40 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 40 }}
                            className="bg-white text-slate-900 w-full max-w-lg rounded-[60px] shadow-2xl p-16 text-center overflow-hidden relative"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-50" />

                            <div className="relative z-10 flex flex-col items-center">
                                <div className="w-28 h-28 bg-[#0052a5] text-white rounded-[40px] flex items-center justify-center mb-10 shadow-2xl shadow-blue-500/40 relative">
                                    <ShieldCheck size={56} />
                                    <motion.div
                                        animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="absolute inset-0 border-4 border-blue-400 rounded-[40px]"
                                    ></motion.div>
                                </div>
                                <h3 className="text-3xl font-black tracking-tighter mb-4 uppercase font-display">Integrity Pulse</h3>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-12 animate-pulse">{scanState}</p>

                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-10">
                                    <motion.div
                                        animate={{ width: `${scanProgress}%` }}
                                        className="h-full bg-[#0052a5] shadow-[0_0_15px_rgba(0,82,165,0.4)]"
                                    ></motion.div>
                                </div>

                                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-300"> Institutional Core Protocol V1.2.4 </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
