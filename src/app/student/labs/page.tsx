"use client";

import { useEffect, useState } from "react";
import { 
  FlaskConical, 
  Search, 
  ChevronRight, 
  Activity,
  Calendar,
  Users,
  ShieldCheck,
  ArrowUpRight,
  Loader2,
  Box
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface Lab {
  id: string;
  name: string;
  description: string;
  created_at: string;
  faculty_name?: string;
}

export default function StudentLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchEnrolledLabs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('lab_students')
      .select(`
        lab_id,
        labs (
          id,
          name,
          department,
          room_no,
          faculty (
             full_name
          )
        )
      `)
      .eq('student_id', user.id);

    if (error) {
       console.error("Matrix Retrieval Failure:", error);
       setLoading(false);
       return;
    }

    if (data) {
      // @ts-ignore
      setLabs(data.map((item: any) => ({
        ...item.labs,
        faculty_name: item.labs?.faculty?.full_name || "Institutional Staff"
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEnrolledLabs();
  }, []);

  const filteredLabs = labs.filter(lab => 
    lab.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lab.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      
      {/* Dynamic Header Matrix */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
           <div className="flex items-center gap-4 mb-3">
              <div className="bg-[#0052a5] p-3 rounded-2xl shadow-xl shadow-blue-900/10">
                 <FlaskConical size={24} className="text-white" />
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none font-display">Enrolled Laboratory Nodes</h1>
           </div>
           <p className="text-[13px] font-bold text-slate-500 uppercase tracking-widest pl-16">Institutional Roster Alignment: Active Cohorts</p>
        </div>

        <div className="relative group min-w-[320px]">
           <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-300 group-focus-within:text-[#0052a5] transition-colors">
              <Search size={18} />
           </div>
           <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Query Lab Matrix..." 
              className="w-full bg-white border border-slate-100 rounded-[24px] py-4 pl-16 pr-8 text-[12px] font-black uppercase tracking-widest focus:ring-4 focus:ring-blue-100 focus:border-[#0052a5] transition-all placeholder:text-slate-300"
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
           Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-[40px] p-10 border border-slate-50 shadow-sm animate-pulse space-y-6">
                 <div className="w-16 h-16 bg-slate-50 rounded-3xl" />
                 <div className="space-y-3">
                    <div className="w-3/4 h-6 bg-slate-50 rounded-lg" />
                    <div className="w-1/2 h-3 bg-slate-50 rounded-lg" />
                 </div>
              </div>
           ))
        ) : filteredLabs.length === 0 ? (
           <div className="col-span-full py-40 text-center bg-white rounded-[50px] border border-dashed border-slate-200">
              <div className="bg-slate-50 p-10 rounded-full w-fit mx-auto mb-8">
                 <FlaskConical size={64} className="text-slate-100" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">No Laboratory Alliances</h3>
              <p className="text-slate-400 font-medium max-w-xs mx-auto">You have not been whitelisted into any research nodes yet. Contact your Faculty Administrator to join a cohort.</p>
           </div>
        ) : (
           <AnimatePresence>
             {filteredLabs.map((lab, i) => (
                <motion.div 
                  key={lab.id}
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-blue-500/5 transition-all group relative overflow-hidden flex flex-col h-full"
                >
                   {/* Background Visual Element */}
                   <div className="absolute -top-10 -right-10 w-40 h-40 bg-slate-50 rounded-full blur-3xl opacity-50 group-hover:bg-blue-50 transition-colors" />

                   <div className="relative z-10 flex-1">
                      <div className="w-16 h-16 bg-slate-50 rounded-[24px] flex items-center justify-center text-slate-300 group-hover:bg-[#0052a5] group-hover:text-white group-hover:rotate-6 transition-all mb-8 shadow-sm">
                         <Box size={32} strokeWidth={1.5} />
                      </div>
                      
                      <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2 group-hover:text-[#0052a5] transition-colors">{lab.name}</h3>
                      <p className="text-[10px] font-black text-[#0052a5]/60 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                         <Activity size={12} /> Unit Lead: {lab.faculty_name}
                      </p>
                      
                      <p className="text-slate-500 text-[13px] font-medium leading-relaxed mb-10 line-clamp-3">
                         {lab.description || "Experimental laboratory node focusing on advanced institutional research protocols."}
                      </p>

                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                         <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Status</p>
                            <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                               <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wide">Authorized</span>
                            </div>
                         </div>
                         <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Manifested</p>
                            <p className="text-[11px] font-black text-slate-900 uppercase">{new Date(lab.created_at).toLocaleDateString()}</p>
                         </div>
                      </div>
                   </div>

                   <div className="pt-10 mt-auto">
                      <Link href={`/student/attendance?lab=${lab.id}`} className="flex items-center justify-center gap-3 w-full py-5 bg-slate-50 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:bg-[#0052a5] group-hover:text-white transition-all shadow-xl shadow-transparent group-hover:shadow-blue-900/20 active:scale-95">
                         Enter Attendance Protocol <ArrowUpRight size={18} />
                      </Link>
                   </div>
                </motion.div>
             ))}
           </AnimatePresence>
        )}
      </div>

      {/* Institutional Note Matrix */}
      <div className="bg-slate-900 rounded-[50px] p-12 text-white relative overflow-hidden shadow-2xl shadow-blue-900/20 mt-12">
         <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500 rounded-full blur-[100px] -mr-40 -mt-40 opacity-20" />
         <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="max-w-xl">
               <ShieldCheck size={48} className="text-blue-400 mb-6" />
               <h3 className="text-3xl font-black tracking-tighter mb-4">Laboratory Access Lockdown</h3>
               <p className="text-blue-100/60 font-medium leading-relaxed">Your access to these laboratory nodes is tied to your institutional roll number. Sharing credentials or attempting access from unauthorized hardware will trigger a central security alert.</p>
            </div>
            <div className="flex gap-4">
               <div className="px-8 py-5 bg-white/5 rounded-3xl border border-white/10 text-center">
                  <p className="text-2xl font-black text-white mb-1">{labs.length}</p>
                  <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Active Cohorts</p>
               </div>
               <div className="px-8 py-5 bg-white/5 rounded-3xl border border-white/10 text-center">
                  <p className="text-2xl font-black text-white mb-1">98%</p>
                  <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest">Security Standing</p>
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}
