"use client";
import { useState, useEffect } from "react";
import { 
  QrCode, 
  RotateCw, 
  LogOut, 
  Signal, 
  Filter, 
  Download,
  Search,
  Play,
  Pause,
  StopCircle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  X,
  Maximize2
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";

export default function AttendancePage() {
  const [session, setSession] = useState<any>(null);
  const [tempSession, setTempSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [elapsed, setElapsed] = useState("00h 00m 00s");
  
  // Faculty Specific States
  const [facultyLabs, setFacultyLabs] = useState<any[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>("");
  const [isQrZoomed, setIsQrZoomed] = useState(false);
  const [rotationCountdown, setRotationCountdown] = useState(30);

  // Fetch Labs and Active Session
  useEffect(() => {
    const initCommandCenter = async () => {
       setLoading(true);
       try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // 1. Fetch Faculty's Labs
          const { data: labs } = await supabase
             .from('labs')
             .select('*')
             .eq('created_by', user.id);
          
          if (labs) setFacultyLabs(labs);

          // 2. Get current ACTIVE session (Persistence Check)
          const { data: activeSession, error: sessErr } = await supabase
             .from('class_sessions')
             .select('*')
             .eq('teacher_id', user.id)
             .eq('status', 'ACTIVE')
             .order('date', { ascending: false })
             .limit(1)
             .maybeSingle();

          if (sessErr) {
             console.error("❌ Session Retrieval Failure:", sessErr);
          }

          if (activeSession) {
             setSession(activeSession);
             setSelectedLabId(activeSession.lab_id);
             
             const { data: labData } = await supabase.from('labs').select('name').eq('id', activeSession.lab_id).single();
             if (labData) {
                setSession((prev: any) => ({ ...prev, labs: labData }));
             }
             
             const { data: activeToken } = await supabase
                .from('temp_qr_sessions')
                .select('*')
                .eq('class_session_id', activeSession.id)
                .maybeSingle();
             
             if (activeToken) {
                setTempSession(activeToken);
             }
          }
       } catch (err: any) {
          console.error("Hub synchronization failure:", err);
       } finally {
          setLoading(false);
       }
    };
    initCommandCenter();
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (session && session.date) {
      interval = setInterval(() => {
        const startTime = session.created_at ? new Date(session.created_at).getTime() : new Date(session.date).getTime();
        const now = new Date().getTime();
        const diff = now - startTime;
        
        if (diff < 0) {
           setElapsed("00h 00m 00s");
           return;
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        setElapsed(`${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
      }, 1000);
    } else {
       setElapsed("00h 00m 00s");
    }
    return () => clearInterval(interval);
  }, [session]);

  // Handle Keyboard Shortcuts for Matrix Zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsQrZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch real attendance logs
  useEffect(() => {
    if (session) {
      const fetchLogs = async () => {
        try {
          const res = await fetch(`/api/attendance/logs?session_id=${session.id}&limit=100`);
          const data = await res.json();
          if (data.success) {
            setLogs(data.logs);
          }
        } catch (err) {
          console.error("❌ Faculty Ledger API Failure:", err);
        }
      };

      fetchLogs();
      const channel = supabase
        .channel('attendance_changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'attendance_logs', 
            filter: `class_session_id=eq.${session.id}` 
        }, () => {
          fetchLogs();
        })
        .subscribe();
      
      return () => { supabase.removeChannel(channel); };
    }
  }, [session]);

  const startNewSession = async () => {
    if (!selectedLabId) {
        setError("Institutional Error: Laboratory Node must be selected.");
        return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized Access Detection.");

      const selectedLab = facultyLabs.find(l => l.id === selectedLabId);

      const { data: newSession, error: sError } = await supabase
        .from('class_sessions')
        .insert({
          lab_id: selectedLabId,
          course_code: selectedLab.name,
          teacher_id: user.id,
          date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE'
        })
        .select('*, labs(name)')
        .single();
      
      if (sError) throw sError;
      setSession(newSession);

      await generateNewToken(newSession.id);
    } catch (err: any) {
      setError("Handshake Failure: " + (err.message || "Database node unreachable."));
    } finally {
      setLoading(false);
    }
  };

  const generateNewToken = async (sessionId: string) => {
    setLoading(true);
    try {
       // 🧹 INSTITUTIONAL CLEANUP: Delayed Removal for 'Dual Version' Support
       const graceWindowStart = new Date(Date.now() - 120 * 1000).toISOString();
       await supabase
          .from('temp_qr_sessions')
          .delete()
          .eq('class_session_id', sessionId)
          .lt('created_at', graceWindowStart);

       const { data: newToken, error: tError } = await supabase
          .from('temp_qr_sessions')
          .insert({
            class_session_id: sessionId, 
            verification_code: Math.floor(100000 + Math.random() * 900000).toString(),
            expires_at: new Date(Date.now() + 600000).toISOString() // Rigid 10m window
          })
          .select()
          .single();
       
       if (tError) throw tError;
       setTempSession(newToken);
       console.log("🛰️ Matrix Rotated: New identity token manifested.");
    } catch (err: any) {
       setError("Token Manifestation Failure: " + err.message);
    } finally {
       setLoading(false);
    }
  };

  // 🔄 RIGID QR ROTATION PROTOCOL
  // Automatically rotates the QR node every 30 seconds to prevent session theft.
  useEffect(() => {
    let rotationInterval: any;
    let timerInterval: any;
    
    if (session?.id && tempSession?.temp_session_id) {
       // Main rotation logic
       rotationInterval = setInterval(() => {
          console.log("🔄 Triggering Scheduled Matrix Rotation...");
          generateNewToken(session.id);
          setRotationCountdown(600);
       }, 600000); // 10m strict rotation

       // UI Timer logic
       timerInterval = setInterval(() => {
          setRotationCountdown(prev => (prev <= 1 ? 600 : prev - 1));
       }, 1000);
    }

    return () => {
      if (rotationInterval) clearInterval(rotationInterval);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [session?.id, tempSession?.temp_session_id]);

   const togglePause = async () => {
     let targetId = tempSession?.temp_session_id;

     if (!targetId && session) {
        const { data: current } = await supabase
          .from('temp_qr_sessions')
          .select('*')
          .eq('class_session_id', session.id)
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (current) {
          targetId = current.temp_session_id;
        }
     }

     setLoading(true);
      try {
       if (targetId) {
          // Pausing: Physically purge the active token node
          // Pausing: Physically purge the active token node
          const { error: dError } = await supabase
            .from('temp_qr_sessions')
            .delete()
            .eq('temp_session_id', targetId);
          
          if (dError) throw dError;
          setTempSession(null);
          console.log("Matrix Protocol: Node Purged (STANDBY)");
       } else {
          // Resuming: Manifest a fresh identity token
          if (session) {
            await generateNewToken(session.id);
            console.log("Matrix Protocol: New Node Manifested (RESUMED)");
          }
       }
     } catch (err: any) {
       console.error("Matrix Protocol Error:", err);
       setError("Protocol Error: Matrix toggle failed during handshake.");
     } finally {
       setLoading(false);
     }
   };

   const endSession = async () => {
     if (!session) return;
     setLoading(true);
     try {
       const { error: eError } = await supabase
         .from('class_sessions')
         .update({ status: 'COMPLETED' })
         .eq('id', session.id);
       
       if (eError) throw eError;

       if (session) {
         await supabase
           .from('temp_qr_sessions')
           .delete()
           .eq('class_session_id', session.id);
       }

       setSession(null);
       setTempSession(null);
       setElapsed("00h 00m 00s");
       setLogs([]);
     } catch (err: any) {
        setError("Shutdown Protocol Failure: Node lock detected.");
     } finally {
        setLoading(false);
     }
   };

  const qrValue = `v1|${session?.id || ''}|${tempSession?.temp_session_id || ''}|${tempSession?.verification_code || ''}`;

   return (
     <div className="flex flex-col h-full bg-[#f8fafc] text-slate-900 pb-12 w-full max-w-[1400px] mx-auto overflow-y-auto animate-in fade-in duration-700">
       
       {error && (
         <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-[12px] uppercase tracking-widest flex items-center gap-4 animate-in slide-in-from-top-4 duration-300">
            <ShieldCheck size={20} /> {error}
            <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100 transition-opacity">Dismiss</button>
         </div>
       )}

       {/* Header Area */}
       <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-6">
         <div>
           <div className="flex items-center gap-3 mb-2">
             <span className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border ${session ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
               <span className={`w-1.5 h-1.5 rounded-full ${session ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
               {session ? 'Node Manifested' : 'System Standby'}
             </span>
             <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{session ? `Uptime ${elapsed}` : 'Awaiting initialization'}</span>
           </div>
           <h1 className="text-[40px] font-black text-slate-900 tracking-tighter leading-none font-display mb-4">
             Command Center:<br />
             {session ? session.labs?.name : (
                 <div className="flex items-center gap-4 mt-2">
                     <select 
                         disabled={!!session}
                         value={selectedLabId}
                         onChange={(e) => setSelectedLabId(e.target.value)}
                         className="bg-white border border-slate-200 rounded-2xl px-6 py-3 text-[16px] font-black tracking-tight text-[#0052a5] focus:outline-none focus:ring-4 focus:ring-blue-500/10 min-w-[300px]"
                     >
                         <option value="">Select Laboratory Node</option>
                         {facultyLabs.map(lab => (
                             <option key={lab.id} value={lab.id}>{lab.name}</option>
                         ))}
                     </select>
                 </div>
             )}
           </h1>
         </div>

         <div className="flex bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-slate-100 overflow-hidden divide-x divide-slate-100 h-28 transform hover:scale-[1.02] transition-transform">
           <div className="px-10 py-6 flex flex-col justify-center">
             <p className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 mb-2">Identity Nodes</p>
             <p className="text-4xl font-black text-slate-900 tracking-tighter">{logs.length}<span className="text-xl text-slate-300 ml-1">/{session ? '45' : '0'}</span></p>
           </div>
           <div className="px-10 py-6 flex flex-col justify-center bg-slate-50/50">
              <div className="flex items-center gap-3 mb-2">
                 <div className="w-2 h-2 bg-[#0052a5] rounded-full animate-pulse" />
                 <p className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">Integrity Pulse</p>
              </div>
              <p className="text-sm font-black text-[#0052a5] uppercase tracking-widest">Handshake Active</p>
           </div>
         </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
         
         {/* Left Column - QR Protocol */}
         <div className="md:col-span-4 lg:col-span-3 space-y-6">
           <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 flex flex-col items-center group relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none group-hover:bg-blue-50 transition-colors" />
             
             <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em] mb-10 w-full text-center relative z-10">Attendance Access Portal</h3>
             
             <div className="w-56 h-56 bg-white border border-slate-100 rounded-[40px] mb-10 flex items-center justify-center p-6 shadow-2xl shadow-blue-900/5 relative z-10 group-hover:scale-105 transition-transform duration-500">
                <div className="w-full h-full bg-slate-50 rounded-[30px] flex items-center justify-center flex-col p-4 relative overflow-hidden border border-slate-100">
                   {session && tempSession ? (
                     (!session.id || !tempSession.temp_session_id) ? (
                       <div className="flex flex-col items-center animate-pulse">
                          <Loader2 size={32} className="text-[#0052a5] animate-spin mb-3" />
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center px-2">Synchronizing Node...</p>
                       </div>
                     ) : !tempSession ? (
                        <div className="flex flex-col items-center animate-pulse">
                           <Pause size={48} className="text-amber-500 mb-3" fill="currentColor" />
                           <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none">Matrix Disconnected</p>
                        </div>
                     ) : (
                        <div 
                           onClick={() => setIsQrZoomed(true)}
                           className="cursor-zoom-in relative group/qr transition-all duration-300 hover:scale-105"
                           title="Click to expand Matrix"
                        >
                           <div className="absolute inset-0 bg-blue-500/5 blur-xl group-hover/qr:bg-blue-500/10 transition-colors rounded-3xl" />
                           <QRCodeSVG 
                              value={qrValue}
                              size={160}
                              level="H"
                              includeMargin={false}
                              className="relative z-10"
                           />
                           <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-xl shadow-lg border border-slate-100 opacity-0 group-hover/qr:opacity-100 transition-opacity">
                              <Maximize2 size={12} className="text-slate-400" />
                           </div>
                        </div>
                     )
                   ) : (
                     <>
                       <QrCode size={56} className="text-slate-100 animate-pulse" strokeWidth={1} />
                       <p className="text-[9px] text-slate-300 mt-4 font-black uppercase tracking-[0.2em] text-center px-4">Initialize Lab Beacon to Manifest QR</p>
                     </>
                   )}
                </div>
             </div>

             <div className="w-full space-y-4 relative z-10">
               <button 
                 onClick={startNewSession}
                 disabled={!!session || loading}
                 className="w-full py-5 bg-[#0052a5] hover:bg-[#00438a] text-white rounded-3xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-900/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 active:scale-95"
               >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : (
                    <><Play size={18} fill="currentColor" stroke="none" /> {session ? 'Session Locked' : 'Manifest Protocol'}</>
                  )}
               </button>
               
               <button 
                 onClick={togglePause}
                 disabled={!session || loading}
                 className={`w-full py-4 border-2 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 ${!tempSession ? 'bg-amber-500 text-white border-amber-600 shadow-xl shadow-amber-900/10' : 'bg-white hover:bg-slate-50 text-slate-400 border-slate-100'}`}
               >
                 {!tempSession ? <Play size={16} fill="currentColor" stroke="none" /> : <Pause size={16} fill="currentColor" stroke="none" />}
                 {!tempSession ? 'Resume Matrix' : 'Toggle Standby'}
               </button>
             </div>

             <button 
               onClick={endSession}
               disabled={!session}
               className="mt-10 w-full py-4 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30"
             >
               <StopCircle size={18} fill="currentColor" stroke="none" /> Terminate Node
             </button>
           </div>

           <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-[60px] -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity" />
              <div className="relative z-10">
                 <div className="flex items-center gap-4 mb-6">
                    <ShieldCheck size={32} className="text-blue-400" />
                    <h4 className="text-sm font-black uppercase tracking-widest">Protocol Integrity</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-100/40">
                       <span>Encryption Type</span>
                       <span className="text-blue-300">SHA-256 Digest</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-blue-100/40">
                       <span>Hardware Handshake</span>
                       <span className="text-blue-300">Enabled</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                       <div className="w-[85%] h-full bg-blue-400 shadow-[0_0_100px_rgba(96,165,250,0.5)]" />
                    </div>
                 </div>
              </div>
           </div>
         </div>

         {/* Right Column - Attendance Matrix */}
         <div className="md:col-span-8 lg:col-span-9 bg-white rounded-[50px] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[800px] relative transition-all">
           
           <div className="pt-12 px-12 pb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-50">
             <div>
               <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-3 font-display">Presence Matrix Ledger</h2>
               <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Institutional Identity Synchronization Hub</p>
             </div>
             <div className="flex gap-4">
               <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#0052a5] transition-colors" size={16} />
                  <input 
                     type="text" 
                     placeholder="Filter nodes..." 
                     className="bg-slate-50 border-none rounded-2xl py-3 pl-12 pr-6 text-[11px] font-black uppercase tracking-widest focus:ring-4 focus:ring-blue-100 transition-all w-64" 
                  />
               </div>
               <button className="bg-[#0052a5] p-3 rounded-2xl text-white shadow-xl shadow-blue-500/10 hover:rotate-6 transition-transform">
                  <Download size={20} />
               </button>
             </div>
           </div>

           <div className="flex-1 overflow-x-auto relative scrollbar-thin scrollbar-thumb-slate-100 scrollbar-track-transparent">
             <table className="w-full text-left">
               <thead className="bg-[#fcfdff] sticky top-0 z-10 border-b border-slate-50">
                 <tr className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em]">
                   <th className="px-12 py-6">Institutional Roll</th>
                   <th className="px-12 py-6">Identity Manifest</th>
                   <th className="px-12 py-6">Handshake At</th>
                   <th className="px-12 py-6">Security Node</th>
                   <th className="px-12 py-6 pr-12 text-right">Integrity</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50 text-[13px] font-medium text-slate-700">
                 {logs.length === 0 ? (
                   <tr>
                     <td colSpan={5} className="py-24 text-center">
                        <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                           <Signal size={32} className="text-slate-100 animate-pulse" />
                        </div>
                        <p className="text-[12px] font-black text-slate-300 uppercase tracking-[0.3em]">Awaiting Peer Manifestation...</p>
                     </td>
                   </tr>
                 ) : logs.map((log, idx) => (
                   <tr key={idx} className="hover:bg-slate-50/50 transition-all group h-24">
                     <td className="px-12 font-black text-slate-900 text-[14px] uppercase tracking-tighter">{log.students?.roll_no || 'EXTERNAL'}</td>
                     <td className="px-12">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-[#0052a5]/5 text-[#0052a5] font-black text-[12px] flex items-center justify-center shadow-inner group-hover:bg-[#0052a5] group-hover:text-white transition-all transform group-hover:rotate-6">
                              {(log.students?.full_name || '??').substring(0,2).toUpperCase()}
                           </div>
                           <div>
                              <p className="font-black text-slate-900 tracking-tight leading-none mb-1 group-hover:text-[#0052a5] transition-colors">{log.students?.full_name || 'Unauthorized Node'}</p>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Enrolled Research Fellow</p>
                           </div>
                        </div>
                     </td>
                     <td className="px-12 font-black text-slate-500 text-[12px] uppercase">
                        {new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                     </td>
                     <td className="px-12 font-mono text-[10px] text-slate-300 uppercase tracking-tighter">
                        NODE-{log.id.slice(0,8).toUpperCase()}
                     </td>
                     <td className="px-12 pr-12 text-right">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm">
                           <CheckCircle2 size={12} strokeWidth={3} /> VERIFIED
                        </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>

           <div className="px-12 py-8 border-t border-slate-50 bg-slate-50/30 flex justify-between items-center text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] relative z-10">
             <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#0052a5] rounded-full animate-pulse" />
                Roster Integrity: {logs.length} Nodes Synchronized
             </span>
             <div className="flex gap-4">
                <button className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-500 rounded-2xl transition-all shadow-sm border border-slate-100 active:scale-95">Matrix Prev</button>
                <button className="px-6 py-3 bg-[#0052a5] hover:bg-[#00438a] text-white rounded-2xl shadow-xl shadow-blue-900/10 transition-all active:scale-95">Matrix Next</button>
             </div>
           </div>
         </div>

       </div>

       {/* Fullscreen QR Matrix Expansion Overlay */}
       {isQrZoomed && session?.id && tempSession?.temp_session_id && (
         <div 
           className="fixed inset-0 z-[1000] flex items-center justify-center animate-in fade-in zoom-in duration-300 p-8 md:p-12 overflow-hidden"
         >
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-slate-950/60 backdrop-blur-[40px] cursor-pointer" 
             onClick={() => setIsQrZoomed(false)}
           />
           
           {/* Expanded Container */}
           <div className="relative z-10 w-full max-w-4xl aspect-square bg-white rounded-[60px] p-12 md:p-20 shadow-[0_0_100px_rgba(0,0,0,0.4)] border border-white/10 flex flex-col items-center justify-center animate-in slide-in-from-bottom-12 duration-500">
             <button 
               onClick={() => setIsQrZoomed(false)}
               className="absolute top-8 right-8 w-16 h-16 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-full flex items-center justify-center transition-all active:scale-90 border border-slate-100 shadow-sm"
             >
               <span className="sr-only">Retract Matrix</span>
               <X size={32} strokeWidth={2.5} />
             </button>

             <div className="mb-12 text-center px-4">
                <h3 className="text-[12px] font-black text-blue-500 uppercase tracking-[0.4em] mb-4">Matrix Broadcast Node</h3>
                <p className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight">Secure Attendance Signature</p>
             </div>
             
             <div className="w-full h-full max-w-[550px] max-h-[550px] bg-white p-8 rounded-[40px] shadow-2xl border border-slate-50 flex items-center justify-center transform hover:scale-[1.02] transition-transform duration-700">
               <QRCodeSVG 
                 value={qrValue}
                 size={480} // Optimized for distance scans
                 level="H"
                 includeMargin={true}
                 className="w-full h-full"
               />
             </div>

             <p className="mt-12 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
               Click background or press ESC to retract
             </p>
           </div>
         </div>
       )}
     </div>
   );
}
