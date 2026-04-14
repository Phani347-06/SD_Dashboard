"use client";

import { useEffect, useState } from "react";
import { 
  ArrowUpRight, 
  ExternalLink,
  FlaskConical,
  Microscope,
  Stethoscope,
  ChevronRight,
  ChevronLeft,
  Filter,
  AlertTriangle,
  Loader2,
  PlusCircle,
  ShieldAlert,
  Users,
  Zap,
  HardDrive,
  Activity,
  ArrowRightLeft,
  ShieldCheck,
  Cpu,
  MonitorCheck,
  Archive,
  Info
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import BeaconMonitorWidget from "@/app/(dashboard)/components/BeaconMonitorWidget";

interface DashboardStats {
  totalLabs: number;
  totalStudents: number;
  activeSessions: number;
  recentLabs: any[];
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState("All");
  const [showDetailId, setShowDetailId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: faculty } = await supabase.from('faculty').select('*').eq('id', user.id).single();
      const { data: student } = await supabase.from('students').select('*').eq('id', user.id).single();
      
      const currentProfile = faculty || student;
      setProfile(currentProfile);

      const { data: labs } = await supabase.from('labs').select('id, name, department, status, created_at').eq('created_by', user.id).order('created_at', { ascending: false });
      
      // Calculate students enrolled in THIS faculty's labs
      const labIds = labs?.map(l => l.id) || [];
      const { count: studentCount } = labIds.length > 0 
        ? await supabase.from('lab_students').select('student_id', { count: 'exact', head: true }).in('lab_id', labIds)
        : { count: 0 };
      
      setStats({
        totalLabs: labs?.length || 0,
        totalStudents: studentCount || 0,
        activeSessions: labs?.filter(l => l.status === 'active').length || 0, 
        recentLabs: labs?.slice(0, 4) || []
      });

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  if (loading) {
     return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
           <Loader2 className="animate-spin text-[#0052a5] mb-6" size={56} strokeWidth={3} />
           <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1 animate-pulse">Synchronizing Intelligence Nodes...</p>
        </div>
     );
  }

  const filteredLabs = stats?.recentLabs.filter(lab => 
     filterCategory === "All" || lab.department === filterCategory
  ) || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-12 pb-20"
    >
      
      {/* 1. Page Title Group */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-10 relative">
        <div className="absolute -left-10 top-0 w-1 h-12 bg-[#0052a5] rounded-full blur-[2px]"></div>
        <div>
          <p className="text-[10px] uppercase font-black tracking-[0.25em] text-[#0052a5] mb-2 flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-blue-500 block"></span>
             Institutional Node Status: Active
          </p>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter tracking-[-0.04em] leading-none mb-2">Resource Command Center</h2>
          <p className="text-[13px] font-bold text-slate-400 uppercase tracking-widest leading-none">Matrix Operational Oversight / {profile?.department || "General Node"}</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white/50 backdrop-blur-xl px-6 py-4 rounded-[32px] border border-white shadow-sm ring-1 ring-slate-100/50">
           <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
              <Zap size={22} fill="currentColor" strokeWidth={3} />
           </div>
           <div className="cursor-pointer group" onClick={() => router.push('/labs')}>
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider leading-none mb-1 group-hover:text-[#0052a5] transition-colors">Matrix Health</p>
              <p className="text-sm font-black text-slate-900 tracking-tight leading-none group-hover:underline decoration-[#0052a5] underline-offset-4">Encrypted / Stable</p>
           </div>
        </div>
      </div>

      {/* 2. Hero Analytics Board */}
      <motion.div 
        variants={itemVariants}
        className="bg-[#0052a5] rounded-[48px] p-12 text-white shadow-3xl shadow-blue-900/40 relative overflow-hidden flex flex-col justify-between min-h-[440px] group transition-all duration-700 hover:shadow-blue-900/60"
      >
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] -mr-80 -mt-80 pointer-events-none group-hover:scale-125 transition-transform duration-1000" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/10 rounded-full blur-[100px] -ml-48 -mb-48 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start mb-16 relative z-10 gap-8">
          <div>
            <div className="px-6 py-2 bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-full backdrop-blur-md border border-white/20 inline-flex items-center gap-2 mb-10 shadow-lg">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse text-emerald-300"></div>
               Global Roster Active
            </div>
            <h3 className="text-6xl font-black mb-4 tracking-tighter leading-[0.9] max-w-xl group-hover:translate-x-2 transition-transform duration-500">Institutional <br/> Intelligence Matrix</h3>
            <p className="text-blue-200 font-bold uppercase tracking-[0.2em] text-[13px] opacity-80 pl-1">Synchronizing {stats?.totalLabs} Active Laboratory Nodes</p>
          </div>
          <button 
             onClick={() => router.push('/labs')}
             className="bg-white text-[#0052a5] px-10 py-6 rounded-3xl font-black text-[12px] uppercase tracking-[0.25em] shadow-2xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-4 group"
          >
             Initialize New Lab <ArrowUpRight size={22} strokeWidth={3} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-12 border-t border-white/15 relative z-10">
          {[
            { label: "Matrix Labs", value: stats?.totalLabs, sub: "Verified Environments", path: "/labs" },
            { label: "Active Personnel", value: stats?.totalStudents, sub: "Identity Anchored", path: "/attendance" },
            { label: "Hardware Nodes", value: stats?.totalLabs ? stats.totalLabs * 12 : 0, sub: "Telemetry Verified", path: "/inventory" },
            { label: "Operational uptime", value: "99.9%", sub: "SLA Compliant", path: "/reports" }
          ].map((stat, i) => (
             <div 
               key={i} 
               className="group/stat cursor-pointer p-4 -m-4 rounded-3xl hover:bg-white/5 transition-all"
               onClick={() => router.push(stat.path)}
             >
               <p className="text-[11px] text-blue-200/60 uppercase font-black tracking-[0.2em] mb-4 group-hover/stat:text-white transition-colors">{stat.label}</p>
               <p className="text-5xl font-black tracking-tight leading-none mb-3 group-hover/stat:scale-110 transition-transform origin-left">{stat.value}</p>
               <p className="text-[10px] font-bold text-blue-200/40 uppercase tracking-widest">{stat.sub}</p>
             </div>
          ))}
        </div>
      </motion.div>

      {/* 3. Operational Grid */}
      <div className="grid grid-cols-12 gap-10">
        
        {/* Recent Matrix Activity */}
        <div className="col-span-12 lg:col-span-8 space-y-10">
           <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[10px] uppercase font-black tracking-[0.3em] text-[#0052a5] mb-2">Live Registry</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter text-slate-900">Recent Laboratory Handshakes</h3>
              </div>
              
              <div className="flex items-center gap-3">
                 <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    {["All", "IT", "ECE", "MECH"].map(cat => (
                       <button 
                         key={cat}
                         onClick={() => setFilterCategory(cat)}
                         className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filterCategory === cat ? 'bg-white text-[#0052a5] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                       >
                          {cat}
                       </button>
                    ))}
                 </div>
                 <button 
                   onClick={() => router.push('/labs')}
                   className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-100 hover:border-[#0052a5] text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-sm group"
                 >
                    <Filter size={16} className="group-hover:rotate-180 transition-transform duration-500" /> All Labs
                 </button>
              </div>
           </div>

           <motion.div 
             layout
             variants={containerVariants}
             className="grid grid-cols-1 md:grid-cols-2 gap-8"
           >
              <AnimatePresence>
                 {(filteredLabs.length > 0 ? filteredLabs : stats?.recentLabs || []).map((lab) => (
                    <motion.div 
                      key={lab.id} 
                      layout
                      variants={itemVariants}
                      whileHover={{ y: -5 }}
                      className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 hover:shadow-3xl hover:shadow-blue-900/5 transition-all group relative overflow-hidden cursor-pointer"
                      onClick={() => router.push(`/labs/${lab.id}`)}
                    >
                       <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-50/50 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                       <div className="flex items-center justify-between mb-10 relative z-10">
                          <div className="w-16 h-16 rounded-[24px] bg-blue-50 flex items-center justify-center text-[#0052a5] group-hover:bg-[#0052a5] group-hover:text-white group-hover:scale-110 transition-all duration-500 shadow-lg shadow-blue-900/5">
                             <Microscope size={32} strokeWidth={2.5} />
                          </div>
                          <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-[#0052a5] group-hover:border-blue-100 group-hover:bg-blue-50 transition-all shadow-sm">
                             <ExternalLink size={20} />
                          </div>
                       </div>
                       <h4 className="text-2xl font-black text-slate-900 mb-2 tracking-tight group-hover:text-[#0052a5] transition-colors">{lab.name}</h4>
                       <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8">{lab.department} / Secure Node</p>
                       <div className="flex items-center gap-4 py-4 px-6 bg-slate-50/50 rounded-3xl border border-slate-100 group-hover:bg-blue-50 transition-colors">
                          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></div>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Roster Online</span>
                       </div>
                    </motion.div>
                 ))}
              </AnimatePresence>
           </motion.div>

           {/* Resource Intelligence */}
           <div className="pt-10 space-y-10">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] uppercase font-black tracking-[0.3em] text-[#0052a5] mb-2">Network Infrastructure</p>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Diagnostic Intelligence nodes</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                 {[
                   { icon: Microscope, label: "Beacons", value: "12", sub: "Operational", color: "blue", path: "/inventory" },
                   { icon: Users, label: "Nodes", value: stats?.totalStudents || "0", sub: "Whitelisted", color: "indigo", path: "/attendance" },
                   { icon: Activity, label: "Latency", value: "0.4ms", sub: "Response", color: "emerald", path: "/reports" },
                   { icon: Stethoscope, label: "Gateways", value: "08", sub: "Portals", color: "blue", path: "/labs" }
                 ].map((node, i) => (
                    <motion.div 
                      key={i}
                      variants={itemVariants}
                      whileHover={{ y: -10 }}
                      onClick={() => router.push(node.path)}
                      className="bg-[#fcfdff] rounded-[32px] p-8 border border-slate-100 hover:border-blue-200 hover:bg-white transition-all duration-500 cursor-pointer shadow-sm group"
                    >
                       <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-[#0052a5] shadow-lg shadow-blue-900/5 mb-10 group-hover:rotate-[360deg] transition-transform duration-700 border border-slate-50">
                          <node.icon size={26} strokeWidth={2.5} />
                       </div>
                       <h4 className="font-black text-slate-900 text-[14px] mb-1 uppercase tracking-tight group-hover:text-[#0052a5] transition-colors">{node.label}</h4>
                       <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-8">{node.sub}</p>
                       
                       <div className="flex items-end justify-between">
                          <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{node.value}</p>
                          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-[#0052a5] group-hover:text-white transition-all">
                             <ChevronRight size={18} />
                          </div>
                       </div>
                    </motion.div>
                 ))}
              </div>
           </div>
        </div>

        {/* 4. Right Intelligence Column */}
        <div className="col-span-12 lg:col-span-4 space-y-10">
          
          {/* Institutional Alerts Sidebar */}
          <div className="bg-white rounded-[48px] p-10 shadow-sm border border-slate-100 sticky top-10 flex flex-col min-h-[600px] overflow-hidden">
             <div className="absolute top-0 right-0 w-40 h-40 bg-blue-50 rounded-full blur-[100px] -mr-20 -mt-20"></div>
             
             <div className="flex items-center gap-4 mb-12 relative z-10">
                <div className="w-12 h-12 bg-[#0052a5] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10">
                   <ShieldAlert size={24} strokeWidth={2.5} />
                </div>
                <div>
                   <h3 className="font-black text-slate-900 text-xl uppercase tracking-tighter leading-none mb-1">Alert Matrix</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Security Ticker</p>
                </div>
             </div>
             
             <div className="space-y-6 flex-1 relative z-10">
                {[
                  { type: 'Critical Latency', message: 'Beacon L-Hall Sector 4 interrupted. Signals lost for 120ms.', color: 'rose', icon: AlertTriangle },
                  { type: 'Handshake Reclaim', message: 'Reconciling Matrix Pod metadata with secure nodes.', color: 'blue', icon: Loader2, animate: true },
                  { type: 'Roster Sync Complete', message: 'Diagnostic whitelisting finished for Cyber Dynamics Lab.', color: 'slate', icon: Users, dim: true }
                ].map((alert, i) => (
                   <motion.div 
                     key={i}
                     whileHover={{ x: 5 }}
                     onClick={() => setShowDetailId(alert.type)}
                     className={`flex gap-5 p-6 rounded-[32px] border transition-all cursor-pointer group ${
                        alert.color === 'rose' ? 'bg-rose-50 border-rose-100' : 
                        alert.color === 'blue' ? 'bg-blue-50 border-blue-100 shadow-sm' : 
                        'bg-slate-50 border-slate-100 opacity-60 hover:opacity-100'
                     }`}
                   >
                      <alert.icon size={24} className={`${alert.color === 'rose' ? 'text-rose-600' : alert.color === 'blue' ? 'text-[#0052a5]' : 'text-slate-400'} flex-shrink-0 ${alert.animate ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`} />
                      <div>
                         <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none ${alert.color === 'rose' ? 'text-rose-900' : alert.color === 'blue' ? 'text-[#0052a5]' : 'text-slate-500'}`}>{alert.type}</p>
                         <p className={`text-[13px] font-bold leading-relaxed tracking-tight ${alert.color === 'rose' ? 'text-rose-700/80' : alert.color === 'blue' ? 'text-blue-700/80' : 'text-slate-600'}`}>{alert.message}</p>
                      </div>
                   </motion.div>
                ))}
             </div>

             {/* Quick Actions Portal */}
             <div className="pt-10 border-t border-slate-50 mt-10 relative z-10">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 pl-2">Executive Handshakes</p>
                <div className="grid grid-cols-2 gap-4">
                   <button 
                     onClick={() => router.push('/labs')}
                     className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-[32px] text-white hover:bg-[#0052a5] transition-all group shadow-xl active:scale-95"
                   >
                      <PlusCircle size={24} className="mb-3 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">New Node</span>
                   </button>
                   <button 
                     onClick={() => router.push('/reports')}
                     className="flex flex-col items-center justify-center p-8 bg-white border border-slate-100 rounded-[32px] text-slate-400 hover:border-[#0052a5] hover:text-[#0052a5] transition-all group shadow-sm active:scale-95"
                   >
                      <Archive size={24} className="mb-3 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Reports</span>
                   </button>
                </div>
             </div>
          </div>
        </div>

      </div>

      {/* 5. Beacon Network Status Monitor */}
      <motion.div variants={itemVariants}>
        <BeaconMonitorWidget />
      </motion.div>

      {/* Alert Detail Modal */}
      <AnimatePresence>
         {showDetailId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 exit={{ opacity: 0 }}
                 className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                 onClick={() => setShowDetailId(null)}
               ></motion.div>
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0, y: 20 }}
                 animate={{ scale: 1, opacity: 1, y: 0 }}
                 exit={{ scale: 0.9, opacity: 0, y: 20 }}
                 className="bg-white rounded-[48px] p-12 max-w-lg w-full shadow-[0_40px_100px_rgba(0,0,0,0.3)] relative overflow-hidden"
               >
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-50 rounded-full blur-[80px] -mr-24 -mt-24 pointer-events-none"></div>
                  <div className="flex items-center gap-4 mb-8">
                     <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0052a5]">
                        <Info size={28} />
                     </div>
                     <div>
                        <h4 className="text-2xl font-black text-slate-900 tracking-tighter">Handshake Pulse</h4>
                        <p className="text-[11px] font-extrabold text-[#0052a5] uppercase tracking-widest">Detail View: {showDetailId}</p>
                     </div>
                  </div>
                  <div className="space-y-6 mb-10 text-slate-600 font-bold leading-relaxed">
                     <p>This institutional audit trail records the specific operational threshold event occurring within the laboratory matrix.</p>
                     <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                        <Activity size={20} className="text-[#0052a5]" />
                        <span className="text-xs uppercase font-black tracking-widest">Node ID: MATRIX-77-ALPHA</span>
                     </div>
                  </div>
                  <button 
                    onClick={() => setShowDetailId(null)}
                    className="w-full py-5 bg-[#0052a5] hover:bg-[#00438a] text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl shadow-blue-900/20 active:scale-95 transition-all"
                  >
                     Acknowledge Handshake
                  </button>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

    </motion.div>
  );
}
