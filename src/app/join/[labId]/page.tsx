"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  FlaskConical, 
  ShieldCheck, 
  AlertCircle, 
  ChevronRight,
  UserCheck2,
  Lock
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function JoinLabPage() {
  const router = useRouter();
  const params = useParams();
  const labId = params?.labId as string;
  
  const [status, setStatus] = useState<'loading' | 'joining' | 'success' | 'unauthorized' | 'error'>('loading');
  const [labName, setLabName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const processJoin = async () => {
      // 1. Check for authenticated session
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        // Not logged in. Store the intended destination and redirect
        localStorage.setItem('redirect_after_login', `/join/${labId}`);
        router.push('/login');
        return;
      }

      try {
        // 2. Resolve Lab Metadata
        const { data: lab, error: lError } = await supabase
          .from('labs')
          .select('name')
          .eq('id', labId)
          .single();

        if (lError || !lab) {
          setStatus('error');
          setErrorMsg("Institutional Pod not found or deactivated.");
          return;
        }
        setLabName(lab.name);
        setStatus('joining');

        // 3. Identification Check (Is this a Student?)
        const { data: student, error: sError } = await supabase
          .from('students')
          .select('id')
          .eq('id', user.id)
          .single();

        if (sError || !student) {
          setStatus('unauthorized');
          setErrorMsg("Only authenticated Student personnel can join Laboratory Pods.");
          return;
        }

        // 4. Enrollment Check (Already in a lab?)
        const { data: enrollmentList } = await supabase
          .from('lab_students')
          .select('*')
          .eq('lab_id', labId)
          .eq('student_id', student.id)
          .limit(1);

        if (enrollmentList && enrollmentList.length > 0) {
           // Already a member, skip ahead
           setTimeout(() => router.push('/student/scan'), 1500);
           setStatus('success');
           return;
        }

        // 5. Execute Enrollment Handshake
        const { error: jError } = await supabase
          .from('lab_students')
          .insert({
            lab_id: labId,
            student_id: student.id
          });

        if (jError) throw jError;

        setStatus('success');
        setTimeout(() => router.push('/student/scan'), 2500);

      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || "Network Interruption during Join Handshake.");
      }
    };

    if (labId) processJoin();
  }, [labId, router]);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50 rounded-full blur-3xl opacity-50 -mr-96 -mt-96"></div>
      
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl border border-slate-100 p-12 text-center relative z-10 overflow-hidden">
         {/* Animated Top Border */}
         <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-[#0052a5] to-blue-400 animate-gradient-x"></div>

         <div className="flex flex-col items-center">
            
            {status === 'loading' || status === 'joining' ? (
              <>
                 <div className="bg-[#f0f7ff] p-8 rounded-full mb-8 relative">
                    <FlaskConical size={48} className="text-[#0052a5] opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <Loader2 size={32} className="text-[#0052a5] animate-spin" />
                    </div>
                 </div>
                 <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">
                    {status === 'loading' ? "Synchronizing Matrix..." : "Performing Handshake..."}
                 </h2>
                 <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Verifying Institutional Credentials</p>
              </>
            ) : status === 'success' ? (
              <div className="animate-in zoom-in-95 duration-500">
                 <div className="bg-emerald-50 p-8 rounded-full mb-8 relative">
                    <UserCheck2 size={48} className="text-emerald-500" />
                 </div>
                 <h2 className="text-2xl font-black text-emerald-600 tracking-tight mb-2">Handshake Success</h2>
                 <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6">Connected to {labName}</p>
                 <div className="bg-slate-50 border border-slate-100 px-6 py-3 rounded-2xl flex items-center justify-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Redirecting to Dashboard...</span>
                 </div>
              </div>
            ) : status === 'unauthorized' ? (
              <>
                 <div className="bg-amber-50 p-8 rounded-full mb-8 relative">
                    <Lock size={48} className="text-amber-500" />
                 </div>
                 <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">Authorization Error</h2>
                 <p className="text-[11px] font-bold text-amber-600 uppercase tracking-[0.2em] mb-4">Personnel Mismatch detected</p>
                 <p className="text-[12px] font-medium text-slate-500 leading-relaxed mb-8">This pod is exclusively for authorized Student rosters. Your session is not eligible for enrollment.</p>
                 <button 
                  onClick={() => router.push('/login')}
                  className="w-full py-4 px-6 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group"
                 >
                   Return to Login Gateway <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                 </button>
              </>
            ) : (
              <>
                 <div className="bg-red-50 p-8 rounded-full mb-8 relative">
                    <AlertCircle size={48} className="text-red-500" />
                 </div>
                 <h2 className="text-xl font-black text-slate-800 tracking-tight mb-2">Protocol Failure</h2>
                 <p className="text-[11px] font-bold text-red-600 uppercase tracking-[0.2em] mb-8">{errorMsg}</p>
                 <button 
                  onClick={() => router.push('/')}
                  className="w-full py-4 px-6 border-2 border-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                 >
                    Abort Handshake
                 </button>
              </>
            )}

         </div>
      </div>
    </div>
  );
}
