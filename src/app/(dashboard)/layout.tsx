"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { 
  Users, 
  Box, 
  LayoutDashboard,
  FlaskConical,
  HelpCircle,
  Archive,
  Menu,
  Bell,
  Settings,
  CircleUser,
  Moon,
  Search,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Zap,
  Activity,
  AlertTriangle,
  X,
  Key,
  Trash2,
  Sliders,
  RotateCcw,
  ShieldAlert,
  User,
  CheckCircle2,
  RefreshCw,
  Fingerprint,
  Mail
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSecurity } from "@/context/SecurityContext";

interface NotificationItem {
  id: string;
  type: 'event' | 'alert';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

interface ProfileData {
  name: string;
  dept: string;
  role: string;
  email: string;
  avatar_url?: string;
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { tempSessionId, clearSession } = useSecurity();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  
  // States
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeModal, setActiveModal] = useState<'password' | 'calibrate' | 'reset' | 'unlink' | 'settings' | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateProgress, setCalibrateProgress] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [updatingPass, setUpdatingPass] = useState(false);
  const [passFeedback, setPassFeedback] = useState<{type: 'success'|'error', msg: string} | null>(null);
  
  // Profile Settings States
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{type: 'success'|'error', msg: string} | null>(null);
  const [isPhotoUpdating, setIsPhotoUpdating] = useState(false);

  // Refs
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // --- Institutional Utility Protocols ---

  // 1. Profiling Protocol - Identity Synchronization
  const fetchProfile = useCallback(async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      router.push('/login');
      return;
    }

    let { data: faculty } = await supabase.from('faculty').select('*').eq('id', user.id).single();
    if (!faculty && user.email) {
       const { data: whitelisted } = await supabase.from('faculty').select('*').eq('email', user.email).single();
       if (whitelisted) {
          await supabase.from('faculty').update({ id: user.id }).eq('email', user.email);
          faculty = whitelisted;
       }
    }

    if (faculty) {
      setProfile({ name: faculty.full_name, dept: faculty.department, role: 'Faculty Lead', email: user.email || '', avatar_url: faculty.avatar_url });
      setEditName(faculty.full_name);
      setEditEmail(user.email || '');
    } else {
       const { data: st } = await supabase.from('students').select('*').eq('id', user.id).single();
      if (st) {
          setProfile({ name: st.full_name, dept: st.department, role: 'Researcher', email: user.email || '', avatar_url: st.avatar_url });
          setEditName(st.full_name);
          setEditEmail(user.email || '');
      }
    }
  }, [router]);

  // 2. Notification Protocols - Telemetry Handshakes
  const addNotification = (n: NotificationItem) => {
     setNotifications(prev => [n, ...prev].slice(0, 10));
     setUnreadCount(prev => prev + 1);
  };

  const fetchInitialNotifications = useCallback(async () => {
     let totalUnread = 0;
     const initialAlerts: NotificationItem[] = [];

     const { data: events } = await supabase.from('rfid_events').select('*').order('timestamp', { ascending: false }).limit(5);
     if (events) {
        initialAlerts.push(...events.map(e => ({
           id: e.id,
           type: 'event' as const,
           title: e.type === 'checkout' ? 'Asset Outbound' : 'Asset Returned',
           message: `Tag ${e.tag_id} processed.`,
           timestamp: 'Recent',
           isRead: false
        })));
        totalUnread += events.length;
     }
     
     const { data: alerts } = await supabase.from('inventory_alerts').select('*').order('created_at', { ascending: false }).limit(5);
     if (alerts) {
        initialAlerts.push(...alerts.map(a => ({
           id: a.id,
           type: 'alert' as const,
           title: `CRITICAL: ${a.type}`,
           message: a.message,
           timestamp: 'Active',
           isRead: false
        })));
        totalUnread += alerts.length;
     }

     setNotifications(initialAlerts.slice(0, 10));
     setUnreadCount(totalUnread);
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Global Effect Matrix ---

  useEffect(() => {
    if (activeModal === 'settings' && profile) {
       setEditName(profile.name);
       setEditEmail(profile.email);
       setProfileFeedback(null);
    }
  }, [activeModal, profile]);

  // Reactive Redirection Protocol: Decoupled from async profile handshake to avoid stale closures
  useEffect(() => {
    if (profile?.role === 'Researcher' && pathname === '/') {
       router.push('/student');
    }
  }, [profile, pathname, router]);

  useEffect(() => {
    fetchProfile();
    fetchInitialNotifications();

    const channel = supabase
      .channel('global_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_events' }, (payload) => {
         addNotification({
            id: payload.new.id,
            type: 'event' as const,
            title: payload.new.type === 'checkout' ? 'Asset Outbound' : 'Asset Returned',
            message: `Tag ${payload.new.tag_id} processed.`,
            timestamp: 'Just Now',
            isRead: false
         });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_alerts' }, (payload) => {
         addNotification({
            id: payload.new.id,
            type: 'alert' as const,
            title: `CRITICAL: ${payload.new.type}`,
            message: payload.new.message,
            timestamp: 'Just Now',
            isRead: false
         });
      })
      .subscribe();

    const handleClickOutside = (e: MouseEvent) => {
       if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
          setShowNotifications(false);
       }
       if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
          setShowProfileMenu(false);
       }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;

     setIsPhotoUpdating(true);
     setProfileFeedback(null);

     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return;

     const fileExt = file.name.split('.').pop();
     const filePath = `${user.id}-${Math.random()}.${fileExt}`;

     // 1. Upload to storage
     const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

     if (uploadError) {
        setProfileFeedback({ type: 'error', msg: uploadError.message });
        setIsPhotoUpdating(false);
        return;
     }

     const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

     // 2. Update DB
     const isFaculty = profile?.role === 'Faculty Lead';
     const { error: dbError } = await supabase
        .from(isFaculty ? 'faculty' : 'students')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

     if (dbError) {
        setProfileFeedback({ type: 'error', msg: dbError.message });
     } else {
        setProfileFeedback({ type: 'success', msg: 'Identity Photo Synchronized' });
        fetchProfile();
     }
     setIsPhotoUpdating(false);
  };

  const handleProfileUpdate = async () => {
     setUpdatingProfile(true);
     setProfileFeedback(null);
     
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return;

     // 1. Update Auth Email
     if (editEmail !== user.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: editEmail });
        if (authError) {
           setProfileFeedback({ type: 'error', msg: authError.message });
           setUpdatingProfile(false);
           return;
        }
     }

     // 2. Update Metadata in Faculty or Students table
     const isFaculty = profile?.role === 'Faculty Lead';
     const { error: tableError } = await supabase
        .from(isFaculty ? 'faculty' : 'students')
        .update({ full_name: editName })
        .eq('id', user.id);

     if (tableError) {
        setProfileFeedback({ type: 'error', msg: tableError.message });
     } else {
        setProfileFeedback({ type: 'success', msg: 'Identity Synchronized Successfully' });
        fetchProfile(); // Refresh local state
        setTimeout(() => {
           setActiveModal(null);
           setProfileFeedback(null);
        }, 2000);
     }
     setUpdatingProfile(false);
  };

  const handleLogout = async () => {
    if (tempSessionId) {
       await supabase.from('sessions').update({ is_active: false }).eq('temp_session_id', tempSessionId);
    }
    clearSession();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const startCalibration = () => {
     setCalibrating(true);
     setCalibrateProgress(0);
     const interval = setInterval(() => {
        setCalibrateProgress(prev => {
           if (prev >= 100) {
              clearInterval(interval);
              setTimeout(() => {
                 setCalibrating(false);
                 setActiveModal(null);
              }, 1000);
              return 100;
           }
           return prev + 2;
        });
     }, 40);
  };

  const handlePasswordUpdate = async () => {
     if (!newPassword || newPassword.length < 6) {
        setPassFeedback({ type: 'error', msg: 'Key must be at least 6 characters' });
        return;
     }

     setUpdatingPass(true);
     setPassFeedback(null);
     
     const { error } = await supabase.auth.updateUser({ password: newPassword });
     
     if (error) {
        setPassFeedback({ type: 'error', msg: error.message });
     } else {
        setPassFeedback({ type: 'success', msg: 'Master Key Synchronized Successfully' });
        setTimeout(() => {
           setActiveModal(null);
           setNewPassword("");
           setPassFeedback(null);
        }, 2000);
     }
     setUpdatingPass(false);
  };

  const [isDecommissioning, setIsDecommissioning] = useState(false);

  const handleDeleteIdentity = async () => {
     if (!confirm("CRITICAL: Irreversible destruction of Identity Node initiated. Proceed with final decommissioning?")) return;
     
     setIsDecommissioning(true);
     try {
        const { error } = await supabase.rpc('delete_user_identity');
        if (error) throw error;
        
        // Identity Purge Success
        clearSession();
        await supabase.auth.signOut();
        router.push('/login');
     } catch (err: any) {
        setPassFeedback({ type: 'error', msg: `Decommission Failure: ${err.message}` });
        setIsDecommissioning(false);
     }
  };

  const navItems = [
    { name: "DASHBOARD", href: "/", icon: <LayoutDashboard size={20} /> },
    { name: "ATTENDANCE", href: "/attendance", icon: <Users size={20} /> },
    { name: "LABS", href: "/labs", icon: <FlaskConical size={20} /> },
    { name: "INVENTORY", href: "/inventory", icon: <Box size={20} /> },
    { name: "REPORTS", href: "/reports", icon: <Archive size={20} /> },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden w-full bg-[#f8fafc]">
        {/* Top Navbar */}
        <header className="h-[72px] bg-white border-b border-slate-100 flex items-center justify-between px-4 md:px-8 flex-shrink-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden w-12 h-12 flex items-center justify-center rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-3">
               <div onClick={() => router.push('/')} className="w-10 h-10 bg-[#0052a5] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10 hover:rotate-12 transition-transform cursor-pointer">
                  <Cpu size={24} />
               </div>
               <h1 onClick={() => router.push('/')} className="font-black text-xl text-slate-900 tracking-tighter leading-none cursor-pointer">
                  Prism<span className="text-[#0052a5]">Matrix</span>
               </h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification Bell */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => { setShowNotifications(!showNotifications); setUnreadCount(0); }}
                className={`relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${
                  showNotifications ? 'bg-blue-50 text-[#0052a5] shadow-inner' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                 <Bell size={22} strokeWidth={2.5} />
                 {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-rose-600 text-white text-[9px] font-black rounded-full border-4 border-white flex items-center justify-center animate-bounce">
                       {unreadCount}
                    </span>
                 )}
              </button>
              
              <AnimatePresence>
                 {showNotifications && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-[70px] right-0 w-[420px] bg-white rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden z-[60] p-2"
                    >
                       <div className="p-6 pb-2 border-b border-slate-50 flex justify-between items-center">
                          <div>
                             <h4 className="font-black text-slate-900 uppercase tracking-tight text-lg leading-none mb-1">Telemetry Alerts</h4>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Security Handshakes</p>
                          </div>
                       </div>
                       <div className="max-h-[300px] overflow-y-auto custom-scrollbar-light p-2">
                          {notifications.map((n) => (
                             <div key={n.id} className="p-4 rounded-[20px] hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                                <h5 className="text-[12px] font-black text-slate-900">{n.title}</h5>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{n.message}</p>
                             </div>
                          ))}
                          {notifications.length === 0 && (
                             <div className="p-12 text-center">
                                <ShieldAlert size={32} className="text-slate-100 mx-auto mb-3" />
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Active Alerts</p>
                             </div>
                          )}
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>
            </div>

            {/* Profile Logic */}
            <div className="relative" ref={profileRef}>
              <div 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 pl-2 group cursor-pointer"
              >
                 <div className="text-right hidden md:block group-hover:-translate-x-1 transition-transform">
                    <p className="text-[12px] font-black text-slate-900 leading-none mb-1 uppercase tracking-tight">{profile?.name || "Node User"}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#0052a5] leading-none">{profile?.dept || "Institutional"}</p>
                 </div>
                 <div className={`w-12 h-12 rounded-[20px] bg-[#0052a5] text-white flex items-center justify-center p-0.5 shadow-lg transition-all ${showProfileMenu ? 'ring-4 ring-blue-100 scale-110' : 'ring-white group-hover:scale-105'}`}>
                    <img src={profile?.avatar_url || `https://i.pravatar.cc/100?u=${profile?.name || 'default'}`} alt="Profile" className="w-full h-full object-cover rounded-[18px]" />
                 </div>
              </div>

              <AnimatePresence>
                 {showProfileMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-[70px] right-0 w-[360px] bg-white rounded-[40px] shadow-[0_30px_70px_rgba(0,0,0,0.2)] border border-slate-100 overflow-hidden z-[100]"
                    >
                       <div className="p-6 pb-4 border-b border-slate-50 bg-[#fcfdff] relative">
                          <div className="relative z-10 flex flex-col items-center text-center">
                             <div className="w-16 h-16 rounded-[28px] bg-white p-1 shadow-2xl mb-3 border border-slate-50">
                                <img src={profile?.avatar_url || `https://i.pravatar.cc/100?u=${profile?.name || 'default'}`} alt="Profile Large" className="w-full h-full object-cover rounded-[24px]" />
                             </div>
                             <h4 className="text-lg font-black text-slate-900 tracking-tighter mb-1 uppercase leading-none">{profile?.name}</h4>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">{profile?.email}</p>
                             <div className="px-3 py-1.5 bg-[#0052a5] rounded-lg text-white text-[8px] font-black uppercase tracking-widest">
                                {profile?.role} / {profile?.dept}
                             </div>
                          </div>
                       </div>

                       {/* Scrollable Settings Matrix */}
                       <div className="max-h-[min(300px,35vh)] overflow-y-auto custom-scrollbar-light px-4 pb-4">
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-3 pl-4 pt-2">Institutional Security</p>
                             <button onClick={() => { setActiveModal('settings'); setShowProfileMenu(false); }} className="flex items-center gap-4 w-full p-4 rounded-3xl hover:bg-blue-50/50 text-slate-600 hover:text-[#0052a5] transition-all group">
                                <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-blue-100/50 flex items-center justify-center text-slate-400 group-hover:text-[#0052a5] transition-colors"><User size={20} /></div>
                                <div className="text-left">
                                   <p className="text-[11px] font-black uppercase tracking-widest">Profile Identity</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Update node name & photo</p>
                                </div>
                             </button>
                             <button onClick={() => { setActiveModal('password'); setShowProfileMenu(false); }} className="flex items-center gap-4 w-full p-4 rounded-3xl hover:bg-blue-50/50 text-slate-600 hover:text-[#0052a5] transition-all group">
                                <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-blue-100/50 flex items-center justify-center text-slate-400 group-hover:text-[#0052a5] transition-colors"><Key size={20} /></div>
                                <div className="text-left">
                                   <p className="text-[11px] font-black uppercase tracking-widest">Change Global Pass</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Update security handshake</p>
                                </div>
                             </button>
                             
                             <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] my-3 pl-4">Hardware Engineering</p>
                             <button onClick={() => { setActiveModal('calibrate'); setShowProfileMenu(false); }} className="flex items-center gap-4 w-full p-4 rounded-3xl hover:bg-emerald-50/50 text-slate-600 hover:text-emerald-600 transition-all group">
                                <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-emerald-100/50 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors"><Sliders size={20} /></div>
                                <div className="text-left">
                                   <p className="text-[11px] font-black uppercase tracking-widest">Calibrate Hardware</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Normalize node frequencies</p>
                                </div>
                             </button>
                             <button onClick={() => { setActiveModal('reset'); setShowProfileMenu(false); }} className="flex items-center gap-4 w-full p-4 rounded-3xl hover:bg-amber-50/50 text-slate-600 hover:text-amber-600 transition-all group">
                                <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-amber-100/50 flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors"><RotateCcw size={20} /></div>
                                <div className="text-left">
                                   <p className="text-[11px] font-black uppercase tracking-widest">Reset Sub-System</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Refresh internal telemetry caches</p>
                                </div>
                             </button>

                             <p className="text-[9px] font-black text-rose-300 uppercase tracking-[0.2em] my-3 pl-4">Danger Zone</p>
                             <button onClick={() => { setActiveModal('unlink'); setShowProfileMenu(false); }} className="flex items-center gap-4 w-full p-4 rounded-3xl hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-all group">
                                <div className="w-11 h-11 rounded-2xl bg-slate-50 group-hover:bg-rose-100/50 flex items-center justify-center text-slate-400 group-hover:text-rose-500 transition-colors"><Trash2 size={20} /></div>
                                <div className="text-left">
                                   <p className="text-[11px] font-black uppercase tracking-widest">Unlink Identity Node</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider text-rose-400">Irreversible decommission</p>
                                </div>
                             </button>
                          </div>
                       </div>

                       {/* Fixed Institutional Footer - Symmetric Curvature Finish */}
                       <div className="p-6 pt-4 border-t border-slate-50 bg-[#fcfdff] rounded-b-[40px]">
                          <button onClick={handleLogout} className="flex items-center justify-center gap-3 w-full py-4 bg-white border border-slate-200 hover:border-rose-200 hover:text-rose-600 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] transition-all group active:scale-95 leading-none">
                             <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
                             Sign Out Protocol
                          </button>
                       </div>
                    </motion.div>
                 )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Modal Matrix */}
        <AnimatePresence>
           {activeModal && (
              <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveModal(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
                 
                 <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-white rounded-[48px] p-12 max-w-lg w-full shadow-2xl relative overflow-hidden"
                 >
                    <button onClick={() => setActiveModal(null)} className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all z-20">
                       <X size={24} />
                    </button>

                    {activeModal === 'settings' && (
                       <div className="space-y-8 text-center uppercase">
                          <div className="relative w-24 h-24 mx-auto mb-6">
                             <div className="w-24 h-24 bg-slate-50 rounded-[32px] flex items-center justify-center border-2 border-dashed border-slate-200 overflow-hidden relative">
                                <img src={profile?.avatar_url || `https://i.pravatar.cc/100?u=${profile?.name || 'default'}`} className={`w-full h-full object-cover transition-opacity ${isPhotoUpdating ? 'opacity-30' : 'opacity-100'}`} />
                                {isPhotoUpdating && <RefreshCw size={24} className="absolute inset-0 m-auto text-[#0052a5] animate-spin" />}
                             </div>
                             <button 
                               onClick={() => photoInputRef.current?.click()}
                               className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#0052a5] text-white rounded-2xl flex items-center justify-center shadow-lg border-4 border-white active:scale-95 transition-all"
                             >
                                <Zap size={18} />
                             </button>
                             <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />
                          </div>
                          <div>
                             <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">Identity Matrix</h4>
                             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Update Node Personalization</p>
                          </div>
                          <div className="space-y-4 text-left">
                             <div className="space-y-1.5 px-2">
                                <label className="text-[9px] font-black text-slate-400 tracking-wider ml-4">Institutional Full Name</label>
                                <div className="relative">
                                   <User size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                                   <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full pl-14 pr-8 py-4 border border-slate-100 rounded-[24px] font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                                </div>
                             </div>
                             <div className="space-y-1.5 px-2">
                                <label className="text-[9px] font-black text-slate-400 tracking-wider ml-4">Secure Email Protocol</label>
                                <div className="relative">
                                   <Mail size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                                   <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full pl-14 pr-8 py-4 border border-slate-100 rounded-[24px] font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                                </div>
                                <p className="text-[8px] font-bold text-slate-400 tracking-widest ml-4">Changing email requires secondary verification link.</p>
                             </div>
                             {profileFeedback && (
                                <p className={`text-[10px] font-black uppercase tracking-widest text-center ${profileFeedback.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                   {profileFeedback.msg}
                                </p>
                             )}
                             <div className="flex flex-col gap-3">
                                <button onClick={handleProfileUpdate} disabled={updatingProfile} className={`w-full py-5 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-[24px] shadow-xl transition-all active:scale-95 ${updatingProfile ? 'bg-slate-400' : 'bg-[#0052a5] hover:bg-[#00438a]'}`}>
                                   {updatingProfile ? 'Synchronizing Identity...' : 'Authorize Updates'}
                                </button>
                                <button onClick={() => setActiveModal(null)} className="w-full py-4 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] hover:text-slate-600 transition-colors">Abort Changes</button>
                             </div>
                          </div>
                       </div>
                    )}

                    {activeModal === 'password' && (
                       <div className="space-y-8">
                          <div className="w-20 h-20 bg-blue-50 text-[#0052a5] rounded-3xl flex items-center justify-center mx-auto"><Fingerprint size={40} /></div>
                          <div>
                             <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">Security Handshake</h4>
                             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Update Global Access Credentials</p>
                          </div>
                          <div className="space-y-4">
                             <input 
                               type="password" 
                               value={newPassword}
                               onChange={(e) => setNewPassword(e.target.value)}
                               placeholder="NEW MASTER PASS" 
                               className="w-full px-8 py-5 border border-slate-100 rounded-[24px] text-center font-black tracking-widest bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all" 
                             />
                             {passFeedback && (
                                <p className={`text-[10px] font-black uppercase tracking-widest ${passFeedback.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                   {passFeedback.msg}
                                </p>
                             )}
                             <button 
                               onClick={handlePasswordUpdate}
                               disabled={updatingPass}
                               className={`w-full py-5 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                                  updatingPass ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#0052a5] shadow-blue-900/10 hover:bg-[#00438a]'
                               }`}
                             >
                                {updatingPass ? (
                                   <>Synchronizing Master Key <RefreshCw size={14} className="animate-spin" /></>
                                ) : (
                                   'Update Access Key'
                                )}
                             </button>
                          </div>
                       </div>
                    )}

                    {activeModal === 'calibrate' && (
                       <div className="space-y-8">
                          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
                             {calibrating ? <RefreshCw className="animate-spin" size={40} /> : <Sliders size={40} />}
                          </div>
                          <div>
                             <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">Hardware Calibration</h4>
                             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Normalizing Frequency Oscillators</p>
                          </div>
                          {calibrating ? (
                             <div className="space-y-4">
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                   <motion.div initial={{ width: 0 }} animate={{ width: `${calibrateProgress}%` }} className="h-full bg-emerald-500" />
                                </div>
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">Scanning: {calibrateProgress}% Compliant</p>
                             </div>
                          ) : (
                             <button onClick={startCalibration} className="w-full py-5 bg-emerald-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl transition-all active:scale-95">Initialize Frequency Scan</button>
                          )}
                       </div>
                    )}

                    {activeModal === 'reset' && (
                       <div className="space-y-8">
                          <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto"><RotateCcw size={40} /></div>
                          <div>
                             <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">System Purge</h4>
                             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Refresh Node Metadata & Cache</p>
                          </div>
                          <p className="text-[13px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">Warning: This will clear temporary signal anchors and force a global telemetry re-sync. Node uptime will be briefly affected.</p>
                          <div className="flex gap-4">
                             <button onClick={() => setActiveModal(null)} className="flex-1 py-5 border border-slate-100 rounded-3xl text-[11px] font-black uppercase tracking-widest text-slate-400">Abort</button>
                             <button onClick={() => setActiveModal(null)} className="flex-1 py-5 bg-amber-500 text-white text-[11px] font-black uppercase tracking-widest rounded-3xl shadow-lg shadow-amber-900/20 active:scale-95 transition-all">Execute Purge</button>
                          </div>
                       </div>
                    )}

                    {activeModal === 'unlink' && (
                       <div className="space-y-8">
                          <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto"><Trash2 size={40} /></div>
                          <div>
                             <h4 className="text-2xl font-black text-rose-600 tracking-tight uppercase mb-2">Identity Decommission</h4>
                             <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Permanent Node Destruction</p>
                          </div>
                          <p className="text-[13px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">Irreversibly unlink your institutional identity from this matrix node. All secure permissions and historical telemetry will be purged.</p>
                          <button 
                            onClick={handleDeleteIdentity}
                            disabled={isDecommissioning}
                            className={`w-full py-6 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                              isDecommissioning ? 'bg-slate-400 cursor-not-allowed' : 'bg-rose-600 shadow-rose-900/30 hover:bg-rose-700'
                            }`}
                          >
                             {isDecommissioning ? (
                                <>Decommissioning Node <RefreshCw size={14} className="animate-spin" /></>
                             ) : (
                                'Authorize Final Destruction'
                             )}
                          </button>
                       </div>
                    )}
                 </motion.div>
              </div>
           )}
        </AnimatePresence>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar Overlay (Mobile) */}
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

          <aside className={`
            fixed lg:relative top-0 left-0 bottom-0 w-72 bg-white border-r border-[#f1f5f9] flex flex-col justify-between h-full z-50 transition-transform duration-300 lg:translate-x-0
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <div className="flex-1 overflow-y-auto px-4 py-8 space-y-12">
               {/* Mobile Close Button */}
               <div className="lg:hidden absolute top-6 right-6">
                  <button onClick={() => setIsSidebarOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                    <X size={20} />
                  </button>
               </div>
               
               <div className="px-4 pb-8 border-b border-slate-50">
                 <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 relative overflow-hidden group">
                    <div className="relative z-10">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Institutional Role</p>
                       <h4 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2 mb-1">
                          {profile?.role || "Faculty Lead"} <ShieldCheck size={14} className="text-blue-500" />
                       </h4>
                       <p className="text-[10px] font-bold text-slate-500 leading-none">Access Level: Level 4</p>
                    </div>
                 </div>
              </div>
              <nav className="space-y-2">
                {navItems.map((item, idx) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link 
                      key={idx} 
                      href={item.href} 
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${isActive ? "bg-[#0052a5] text-white shadow-xl" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"}`}
                    >
                      {item.icon}
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] pt-0.5">{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="p-6 space-y-4 bg-slate-50/50">
               <button onClick={handleLogout} className="flex items-center gap-4 px-6 py-4 w-full bg-white border border-slate-100 hover:border-rose-100 hover:text-rose-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95">
                 <LogOut size={18} /> Sign Out Node
               </button>
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
               <motion.div
                 key={pathname}
                 initial={{ opacity: 0, scale: 0.98 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.98 }}
                 transition={{ duration: 0.4, ease: "circOut" }}
                 className="p-4 md:p-10 pb-32 max-w-[1600px] mx-auto"
               >
                 {children}
               </motion.div>
            </AnimatePresence>
          </main>
        </div>
    </div>
  );
}
