"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    User, 
    Mail, 
    Shield, 
    Smartphone, 
    Activity, 
    Package, 
    Calendar,
    LogOut,
    Camera,
    CircleCheckBig,
    ShieldCheck,
    TriangleAlert,
    CircleUser,
    ArrowUpRight,
    Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSecurity } from "@/context/SecurityContext";

export default function ProfilePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { tempSessionId, fingerprintHash } = useSecurity();
    const [profile, setProfile] = useState<any>(null);
    const [currentSession, setCurrentSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [isRotatingKeys, setIsRotatingKeys] = useState(false);
    const [isIntegrityScanning, setIsIntegrityScanning] = useState(false);
    const [isSecurityAuditing, setIsSecurityAuditing] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanState, setScanState] = useState("");
    
    const handleSignOut = async () => {
        try {
            if (tempSessionId) {
                await supabase
                    .from('sessions')
                    .update({ is_active: false })
                    .eq('temp_session_id', tempSessionId);
            }
            await supabase.auth.signOut();
            router.push('/login');
        } catch (err) {
            console.error("Logout Error:", err);
            await supabase.auth.signOut();
            router.push('/login');
        }
    };

    const BREACH_LOGS = [
        { id: 1, event: "Unauthorized Fingerprint Shift", device: "Android Node 10.x", timestamp: "Mar 20, 02:22 PM", action: "AUTO_ROTATE_KEYS" },
        { id: 2, event: "IP Geolocation Mismatch", device: "Browser Hub 4.0", timestamp: "Mar 18, 11:15 AM", action: "TERMINATED_SESSION" }
    ];

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Fetch Student Profile
                const { data } = await supabase
                    .from('students')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                setProfile(data);

                // Fetch Active Session Node
                if (tempSessionId) {
                  const { data: sessionData } = await supabase
                    .from('sessions')
                    .select('*')
                    .eq('temp_session_id', tempSessionId)
                    .single();
                  setCurrentSession(sessionData);
                }
            }
            setLoading(false);
        }
        loadProfile();

        if (searchParams.get('action') === 'integrity_scan') {
            performIntegrityScan();
        } else if (searchParams.get('action') === 'security_audit') {
            performSecurityAudit();
        }
    }, [searchParams, tempSessionId]);
    
    // Helper to calculate expiration
    const getSessionExpiry = () => {
      if (!currentSession) return null;
      const expiry = new Date(currentSession.expires_at).getTime();
      const now = new Date().getTime();
      const diff = expiry - now;
      const minutes = Math.floor(diff / 1000 / 60);
      return minutes > 0 ? minutes : 0;
    };

    const performSecurityAudit = async () => {
        setIsSecurityAuditing(true);
        const steps = [
            "Accessing Breach Logs...",
            "Tracing IP Origins...",
            "Verifying Rotation Status...",
            "Audit Complete."
        ];

        for (let i = 0; i < steps.length; i++) {
            setScanState(steps[i]);
            setScanProgress((i + 1) * 25);
            await new Promise(r => setTimeout(r, 600));
        }
        
        // Keep scan on screen for a bit to show results
        setTimeout(() => {
            setScanProgress(100);
        }, 500);
    };

    const performIntegrityScan = async () => {
        setIsIntegrityScanning(true);
        const steps = [
            "Initializing Shield Protocol...",
            "Validating Hardware Anchor...",
            "Verifying SHA-256 Digest Integrity...",
            "Synchronizing with Institutional Ledger...",
            "Integrity Confirmed."
        ];

        for (let i = 0; i < steps.length; i++) {
            setScanState(steps[i]);
            setScanProgress((i + 1) * 20);
            await new Promise(r => setTimeout(r, 800));
        }
        
        setTimeout(() => {
            setIsIntegrityScanning(false);
            setScanProgress(0);
        }, 1500);
    };

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise(r => setTimeout(r, 1500));
        setSuccessMsg("Academic Identity Synchronized.");
        setTimeout(() => setSuccessMsg(""), 3000);
        setIsSaving(false);
    };

    const handleRotateKeys = async () => {
        setIsRotatingKeys(true);
        await new Promise(r => setTimeout(r, 2000));
        alert("RSA 4096 Keys Rotated Successfully. All session nodes have been re-anchored.");
        setIsRotatingKeys(false);
    };

    if (loading) return null;

    const sessionMinutesLeft = getSessionExpiry();

    return (
        <div className="space-y-12 pb-20">
            <header>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">Institutional Identity Hub</h2>
                <p className="text-slate-400 font-medium text-sm">Managing your unique presence and security anchors within the Matrix.</p>
            </header>

            {/* 1. Header Profile Banner */}
            <section className="bg-white rounded-[40px] border border-slate-100 p-12 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-1000"></div>
                
                <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
                    <div className="relative group/avatar">
                        <div className="w-32 h-32 rounded-[48px] bg-[#0052a5] flex items-center justify-center text-white shadow-2xl shadow-blue-500/20 border-4 border-white overflow-hidden">
                            <CircleUser size={80} strokeWidth={1} />
                        </div>
                        <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center text-[#0052a5] hover:bg-[#0052a5] hover:text-white transition-all transform group-hover/avatar:scale-110">
                            <Camera size={18} />
                        </button>
                    </div>

                    <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-4">
                            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{profile?.full_name?.toUpperCase() || "AUTHORIZED STUDENT"}</h3>
                            <div className="px-5 py-1.5 rounded-full bg-blue-50 text-[#0052a5] text-[10px] font-black uppercase tracking-widest border border-blue-100/50 shadow-sm shadow-blue-500/5">
                                {profile?.department || "CSE / 2ND YEAR"}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-8 text-slate-400 font-bold text-sm">
                            <span className="flex items-center gap-2"><Smartphone size={16} /> {profile?.roll_no || "ROLL_2026_X"}</span>
                            <span className="flex items-center gap-2"><Mail size={16} /> student@{profile?.roll_no?.toLowerCase() || "school"}.edu</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={handleSignOut}
                            className="bg-slate-50 hover:bg-rose-50 hover:text-rose-500 text-slate-400 px-8 py-4 rounded-[28px] text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-4 active:scale-95"
                        >
                            <LogOut size={16} /> Sign Out Node
                        </button>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* 2. Form Section (Left - 8 Cols) */}
                <div className="lg:col-span-8 space-y-10">
                    {/* Academic Identity */}
                    <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0052a5] flex items-center justify-center">
                                <User size={20} />
                            </div>
                            <h4 className="text-lg font-black text-slate-900 tracking-tighter capitalize underline decoration-blue-500/20 underline-offset-8">Academic Personalization</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Full Legal Name</label>
                                <input 
                                    type="text" 
                                    defaultValue={profile?.full_name}
                                    className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-6 text-[13px] font-bold focus:ring-2 focus:ring-blue-100 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Institutional Email</label>
                                <input 
                                    type="email" 
                                    placeholder={profile?.roll_no ? `${profile.roll_no}@vnrvjiet.in` : "authorized@vnrvjiet.in"} 
                                    readOnly
                                    className="w-full bg-slate-100/50 border-none rounded-[20px] py-4 px-6 text-[13px] font-bold text-slate-400 cursor-not-allowed"
                                />
                            </div>
                        </div>
                        
                        <div className="mt-10 flex items-center justify-between border-t border-slate-50 pt-8">
                            <p className="text-[10px] font-medium text-slate-400 max-w-xs leading-relaxed">Identity changes require administrative validation before reflecting in the institutional ledger.</p>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-[#0052a5] text-white px-10 py-4 rounded-[24px] text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/10 hover:scale-105 transition-all flex items-center gap-3 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : "Update Identity"}
                                {successMsg && <CircleCheckBig size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Security Hub */}
                    <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm relative group">
                        <div className="flex items-center justify-between mb-10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
                                    <Shield size={20} />
                                </div>
                                <h4 className="text-lg font-black text-slate-900 tracking-tighter capitalize underline decoration-rose-500/20 underline-offset-8">Security Protocol Update</h4>
                            </div>
                            <div className="flex items-center gap-2 text-emerald-500">
                                <ShieldCheck size={16} className="animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-widest">SHA-256 Active</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Current Key</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-6 text-[13px] font-bold focus:ring-2 focus:ring-rose-100 transition-all font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">New Key</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-6 text-[13px] font-bold focus:ring-2 focus:ring-rose-100 transition-all font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Confirm Key</label>
                                <input type="password" placeholder="••••••••" className="w-full bg-slate-50 border-none rounded-[20px] py-4 px-6 text-[13px] font-bold focus:ring-2 focus:ring-rose-100 transition-all font-mono" />
                            </div>
                        </div>

                        <div className="mt-8 bg-slate-50/50 p-6 rounded-[30px] flex items-center justify-between border border-slate-100/50">
                            <div className="flex items-center gap-4">
                                <TriangleAlert size={20} className="text-amber-500" />
                                <p className="text-[11px] font-bold text-slate-500 tracking-tight">Updating your key will invalidate all active Matrix session nodes.</p>
                            </div>
                            <button 
                                onClick={handleRotateKeys}
                                disabled={isRotatingKeys}
                                className="text-[11px] font-black uppercase tracking-widest text-rose-500 hover:tracking-[0.2em] transition-all disabled:opacity-50"
                            >
                                {isRotatingKeys ? "Rotating..." : "Symmetrically Update Keys"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3. Stats & Info Sidebar (Right - 4 Cols) */}
                <div className="lg:col-span-4 space-y-10">
                    {/* Academic Performance Snapshot */}
                    <div className="bg-[#0052a5] p-10 rounded-[40px] text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden group">
                        <div className="relative z-10 space-y-8">
                            <header className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xl font-black tracking-tighter mb-1">My Pulse snapshot</h4>
                                    <p className="text-blue-200 text-[10px] uppercase font-bold tracking-[0.2em]">Matrix Stats Cluster</p>
                                </div>
                                <Link href="/student/analytics" className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all">
                                    <ArrowUpRight size={16} />
                                </Link>
                            </header>

                            <div className="grid grid-cols-2 gap-6">
                                <Link href="/student/analytics" className="bg-white/10 p-5 rounded-[28px] backdrop-blur-md hover:bg-white/20 transition-all group/card">
                                    <Activity className="text-blue-300 mb-3 group-hover/card:scale-110 transition-transform" size={20} />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1">Attendance</p>
                                    <p className="text-2xl font-black tracking-tighter">82%</p>
                                </Link>
                                <Link href="/student/equipment" className="bg-white/10 p-5 rounded-[28px] backdrop-blur-md hover:bg-white/20 transition-all group/card">
                                    <Package className="text-blue-300 mb-3 group-hover/card:scale-110 transition-transform" size={20} />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1">Assets Held</p>
                                    <p className="text-2xl font-black tracking-tighter">02</p>
                                </Link>
                                <div className="bg-white/10 p-5 rounded-[28px] backdrop-blur-md col-span-2 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1">Node Longevity</p>
                                        <p className="text-2xl font-black tracking-tighter capitalize">482 Days</p>
                                    </div>
                                    <Calendar className="text-blue-200/40" size={32} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Active Hardware Anchor Info (Session Info Section) */}
                    <div className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm transition-all duration-500 hover:shadow-xl hover:shadow-blue-500/5">
                        <h4 className="text-lg font-black text-slate-900 tracking-tighter mb-8 capitalize">Session Info</h4>
                        
                        <div className="space-y-6">
                            <div className="flex items-center gap-6">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#0052a5]">
                                    <Smartphone size={24} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 leading-none mb-1">Device Status</p>
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                      Bound to this device
                                    </p>
                                </div>
                                <ShieldCheck size={20} className="text-emerald-500" />
                            </div>

                            <div className="p-6 bg-slate-50/50 rounded-[30px] border border-slate-50 group hover:border-blue-100 transition-all cursor-default relative overflow-hidden">
                                {tempSessionId ? (
                                  <>
                                    <div className="flex items-center gap-3 mb-3 relative z-10">
                                        <Activity size={16} className="text-[#0052a5]" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Current Session</span>
                                    </div>
                                    <p className="text-[11px] font-mono text-slate-400 break-all leading-relaxed group-hover:text-slate-900 transition-colors relative z-10 tracking-widest">
                                        sess_{tempSessionId.substring(0, 8)}••••••••
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-2 relative z-10">
                                      <div className="px-3 py-1 bg-white rounded-full text-[9px] font-black text-slate-400 border border-slate-100">
                                        STARTED: {currentSession ? new Date(currentSession.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'NOW'}
                                      </div>
                                      <div className={`px-3 py-1 rounded-full text-[9px] font-black border border-slate-100 ${sessionMinutesLeft && sessionMinutesLeft < 60 ? 'bg-amber-50 text-amber-500' : 'bg-white text-slate-400'}`}>
                                        EXPIRES: {currentSession ? new Date(currentSession.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '24H'}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-center py-4">
                                     <Loader2 className="animate-spin text-slate-300 mx-auto mb-2" size={20} />
                                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Handshake...</p>
                                  </div>
                                )}
                            </div>

                            {sessionMinutesLeft !== null && sessionMinutesLeft < 60 && (
                               <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col gap-4"
                               >
                                  <p className="text-[11px] font-bold text-amber-600 leading-tight">
                                    <TriangleAlert size={14} className="inline mr-2" />
                                    Session expires in {sessionMinutesLeft} minutes.
                                  </p>
                                  <button className="w-full py-3 bg-white border border-amber-200 text-amber-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-100 transition-all">
                                    Extend Session node
                                  </button>
                               </motion.div>
                            )}

                            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 leading-relaxed px-4 py-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                                <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                                <span>Fingerprint status: Verified (SHA-256 Digest Active)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Integrity / Security Scan Overlay */}
            <AnimatePresence>
                {(isIntegrityScanning || isSecurityAuditing) && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 text-white"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white text-slate-900 w-full max-w-2xl rounded-[50px] shadow-2xl p-12 text-center overflow-hidden relative"
                        >
                            <div className="flex flex-col items-center">
                                <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl relative ${isSecurityAuditing ? 'bg-rose-500 shadow-rose-500/40 text-white' : 'bg-[#0052a5] shadow-blue-500/40 text-white'}`}>
                                    {isSecurityAuditing ? <TriangleAlert size={48} /> : <ShieldCheck size={48} />}
                                    <motion.div 
                                        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className={`absolute inset-0 border-4 rounded-[32px] ${isSecurityAuditing ? 'border-rose-400' : 'border-blue-400'}`}
                                    ></motion.div>
                                </div>
                                <h3 className="text-2xl font-black tracking-tighter mb-4 uppercase">{isSecurityAuditing ? "Security Breach Audit" : "Integrity Handshake"}</h3>
                                <p className="text-slate-400 text-sm font-medium mb-10 max-w-xs mx-auto">{scanState}</p>
                                
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-12">
                                    <motion.div 
                                        animate={{ width: `${scanProgress}%` }}
                                        className={`h-full ${isSecurityAuditing ? 'bg-rose-500' : 'bg-[#0052a5]'}`}
                                    ></motion.div>
                                </div>

                                {isSecurityAuditing && scanProgress === 100 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-4 mb-10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-left mb-4">Forensic Log History</h4>
                                        {BREACH_LOGS.map(log => (
                                            <div key={log.id} className="bg-slate-50 p-6 rounded-3xl flex items-center justify-between border border-slate-100">
                                                <div className="text-left">
                                                    <p className="text-[13px] font-black tracking-tight text-slate-900 mb-1">{log.event}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{log.device}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-rose-500 mb-1">{log.action}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">{log.timestamp}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}

                                <button 
                                    onClick={() => { setIsIntegrityScanning(false); setIsSecurityAuditing(false); router.replace('/student/profile'); }}
                                    className="w-full py-5 bg-slate-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em]"
                                >
                                    Dismiss Audit Report
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
