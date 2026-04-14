"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  CalendarCheck, 
  Monitor, 
  Bell, 
  User, 
  LogOut,
  Settings,
  ShieldCheck,
  Search,
  Activity,
  CircleUser,
  ChartColumn,
  FlaskConical,
  Menu,
  X
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useSecurity } from "@/context/SecurityContext";

interface SidebarLinkProps {
  href: string;
  icon: any;
  label: string;
  active: boolean;
  onClick?: () => void;
}

function SidebarLink({ href, icon: Icon, label, active, onClick }: SidebarLinkProps) {
  return (
    <Link href={href} onClick={onClick}>
      <motion.div 
        whileHover={{ x: 5 }}
        whileTap={{ scale: 0.98 }}
        className={`flex items-center gap-4 px-6 py-4 rounded-[24px] mb-2 transition-all duration-300 group ${
          active 
            ? "bg-[#0052a5] text-white shadow-xl shadow-blue-900/20" 
            : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
        }`}
      >
        <Icon size={20} strokeWidth={active ? 3 : 2} className={active ? "text-white" : "text-slate-300 group-hover:text-[#0052a5]"} />
        <span className={`text-[11px] font-black uppercase tracking-widest ${active ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}>
          {label}
        </span>
      </motion.div>
    </Link>
  );
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { tempSessionId, fingerprintHash, clearSession } = useSecurity();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on path change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    let channel: any;

    async function initSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // 1. Resolve Profile Cache
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (student) {
          setProfile(student);
          setLoading(false);
        } else {
          // Institutional Gate: Cross-check if this node belongs to Faculty
          const { data: faculty, error: facultyError } = await supabase
            .from('faculty')
            .select('id')
            .eq('id', user.id)
            .single();

          if (facultyError && facultyError.code !== 'PGRST116') {
             console.error("Faculty Identity Cross-Check Failure:", facultyError);
             setSessionError(true);
             setProfile(null);
             setLoading(false);
             return;
          }

          if (faculty) {
             console.log("Faculty node detected in student portal. Redirecting to Root Dashboard.");
             router.push('/');
             return;
          }

          // Case: Authenticated user not found in either institutional table
          console.warn("Unknown Identity Node: User authenticated but missing from institutional rosters.");
          setProfile(null);
          setLoading(false);
          router.push("/login"); // Safe fallback to re-authenticate or logout
        }
      } catch (err) {
        console.error("Identity Hub Failure:", err);
        router.push("/login");
      }
    }

    initSession();

    // 2. SET UP WATCHDOG - Robust lifecycle management
    const setupWatchdog = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tempSessionId) return;

      // Clean up any existing channel with same name globally if possible 
      // or at least local reference
      const channelName = `student_security_${user.id}`;
      
      const setup = async () => {
        // Unsubscribe from any existing channel with this name
        await supabase.removeChannel(supabase.channel(channelName));

        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'sessions',
              filter: `student_id=eq.${user.id}`
            },
            (payload: any) => {
              if (payload.new.temp_session_id !== tempSessionId && payload.new.is_active === true) {
                setSessionError(true);
              }
              if (payload.new.temp_session_id === tempSessionId && payload.new.is_active === false) {
                setSessionError(true);
              }
            }
          );
        
        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log(`🛡️ Security Watchdog Online: node_${tempSessionId.substring(0,8)}`);
          }
        });
      };

      setup();
    };

    setupWatchdog();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [router, tempSessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <Activity className="animate-pulse text-[#0052a5] mb-6" size={48} strokeWidth={3} />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 animate-pulse">Initializing Security Nodes...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sessionError && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="fixed top-0 inset-x-0 z-[100] bg-rose-600 text-white py-4 px-6 text-center font-bold text-sm shadow-2xl flex items-center justify-center gap-4"
          >
            <ShieldCheck size={20} />
            Security Alert: You have been signed in on another device. This session is now terminal.
            <button 
              onClick={() => {
                supabase.auth.signOut();
                router.push("/login");
              }}
              className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all"
            >
              Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Sidebar - Responsive Navigation */}
      <aside className={`
        fixed top-0 left-0 h-screen bg-white border-r border-slate-100 p-8 flex flex-col z-50 transition-transform duration-300 ease-in-out
        w-80 lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl shadow-blue-900/20' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between mb-16 pl-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#0052a5] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10">
              <Activity size={24} strokeWidth={3} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tighter leading-none mb-1">PRISM</h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Institutional Matrix</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1">
          <SidebarLink href="/student" icon={LayoutDashboard} label="Dashboard" active={pathname === "/student"} onClick={() => setIsSidebarOpen(false)} />
          <SidebarLink href="/student/labs" icon={FlaskConical} label="Labs" active={pathname === "/student/labs"} onClick={() => setIsSidebarOpen(false)} />
          <SidebarLink href="/student/attendance" icon={CalendarCheck} label="Attendance" active={pathname === "/student/attendance"} onClick={() => setIsSidebarOpen(false)} />
          <SidebarLink href="/student/equipment" icon={Monitor} label="Equipment" active={pathname === "/student/equipment"} onClick={() => setIsSidebarOpen(false)} />
          <SidebarLink href="/student/analytics" icon={ChartColumn} label="Analytics" active={pathname === "/student/analytics"} onClick={() => setIsSidebarOpen(false)} />
        </nav>

        <div className="pt-8 border-t border-slate-50">
          <button 
            onClick={async () => {
              if (tempSessionId) {
                await supabase.from('sessions').update({ is_active: false }).eq('temp_session_id', tempSessionId);
              }
              clearSession();
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="w-full flex items-center gap-4 px-6 py-4 text-slate-400 hover:text-rose-500 transition-colors uppercase font-black text-[10px] tracking-widest"
          >
            <LogOut size={20} /> Sign Out Node
          </button>
        </div>
      </aside>

      {/* 2. Main Content Board */}
      <main className="flex-1 lg:ml-80 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <header className="h-28 bg-white/60 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-3 bg-white border border-slate-100 rounded-2xl shadow-sm text-slate-600 active:scale-95 transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="max-w-md w-full relative hidden md:block">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-300">
                <Search size={18} />
              </div>
              <input 
                type="text" 
                placeholder="Query the Matrix..." 
                className="w-full bg-slate-100/50 border-none rounded-[20px] py-4 pl-16 pr-8 text-[12px] font-bold focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 lg:gap-8 ml-4">
            <div className="hidden sm:flex items-center gap-3 pr-8 border-r border-slate-100">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Node Secure</span>
            </div>

            <Link href="/student/notifications">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-[#0052a5] hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer relative group">
                <Bell size={20} />
                <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></div>
              </div>
            </Link>

            <Link href="/student/profile">
              <div className="flex items-center gap-4 bg-slate-50 px-3 lg:px-5 py-3 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer group/prof">
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-black text-slate-900 leading-none mb-1 group-hover/prof:text-[#0052a5] transition-colors">{profile?.full_name?.split(' ')[0] || "Authorized"}</p>
                  <p className="text-[9px] font-bold text-[#0052a5] uppercase tracking-widest leading-none">{profile?.department || "CSE"}</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-[#0052a5] text-white flex items-center justify-center group-hover/prof:scale-105 transition-transform">
                  <CircleUser size={24} strokeWidth={1.5} />
                </div>
              </div>
            </Link>
          </div>
        </header>

        {/* Page Children with Staggered Entry */}
        <div className="p-6 lg:p-12 max-w-7xl mx-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
