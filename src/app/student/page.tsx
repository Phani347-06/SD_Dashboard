"use client";

import { useEffect, useState } from "react";
import { 
    Activity, 
    Calendar, 
    MonitorCheck, 
    AlarmClock, 
    ArrowUpRight, 
    History,
    Info,
    Loader2
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";

export default function Dashboard() {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        attendanceRate: 0,
        enrolledLabs: 0,
        activeEquipment: 0,
        totalSessions: 0,
        attendedSessions: 0
    });
    const [activities, setActivities] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);

    useEffect(() => {
        const fetchStudentData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // 1. Fetch Profile & Enrollment Status
                const [studentRes, enrollmentsRes] = await Promise.all([
                    supabase.from('students').select('*').eq('id', user.id).single(),
                    supabase.from('lab_students').select('lab_id, labs(name)', { count: 'exact' }).eq('student_id', user.id)
                ]);

                if (studentRes.data) {
                    setProfile(studentRes.data);
                    console.log("🔓 Student Node Authenticated:", studentRes.data.roll_no);
                } else {
                    console.warn("⚠️ Student Profile Missing for UID:", user.id);
                }

                const enrollments = enrollmentsRes.data || [];
                const labCount = enrollmentsRes.count || 0;
                const labIds = enrollments.map(e => e.lab_id);

                // 2. Fetch ALL Sessions for these labs
                const { data: rawSessions } = labIds.length > 0 
                    ? await supabase.from('class_sessions').select('id, lab_id').in('lab_id', labIds)
                    : { data: [] as any[] };

                // 3. Fetch Student Attendance Logs
                const { data: rawLogs } = await supabase
                    .from('attendance_logs')
                    .select(`
                        id,
                        status,
                        session_id,
                        scanned_at,
                        class_sessions (
                            course_code,
                            lab_id,
                            labs (name)
                        )
                    `)
                    .eq('student_id', user.id)
                    .order('scanned_at', { ascending: false });

                // 4. Calculate Analytics
                const processedLogs = rawLogs as any[] || [];
                const processedSessions = rawSessions as any[] || [];
                const attendedSessions = processedLogs?.filter(l => l.status === 'PRESENT') || [];
                const totalSessionsCount = processedSessions?.length || 0;
                const attendanceRate = totalSessionsCount > 0 ? Math.round((attendedSessions.length / totalSessionsCount) * 100) : 0;

                setStats({
                    attendanceRate,
                    enrolledLabs: labCount,
                    activeEquipment: 0, 
                    totalSessions: totalSessionsCount,
                    attendedSessions: attendedSessions.length
                });

                if (processedLogs) {
                    setActivities(processedLogs.slice(0, 4).map((log: any) => ({
                        type: "ATTENDANCE",
                        title: `${log.class_sessions?.labs?.name || log.class_sessions?.course_code || 'Lab Node'} Handshake`,
                        time: new Date(log.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        status: log.status === 'PRESENT' ? 'VERIFIED' : 'ABSENT',
                        color: log.status === 'PRESENT' ? 'blue' : 'red'
                    })));
                }

                // 5. Build Subject Analytics Matrix from real data
                if (enrollments && processedSessions) {
                    const subjectData = enrollments.map((e: any) => {
                        const labSessions = (processedSessions as any[]).filter(s => s.lab_id === e.lab_id);
                        const labAttended = attendedSessions.filter((l: any) => l.class_sessions?.lab_id === e.lab_id);
                        
                        const percentage = labSessions.length > 0 
                            ? Math.round((labAttended.length / labSessions.length) * 100)
                            : 0;

                        return {
                            name: e.labs?.name?.split(' ')[0] || "Unknown",
                            percentage: percentage,
                            color: "bg-[#0052a5]"
                        };
                    });
                    setSubjects(subjectData);
                }

            } catch (error) {
                console.error("Dashboard Sync Failure:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStudentData();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="animate-spin text-[#0052a5] mb-6" size={56} strokeWidth={3} />
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1 animate-pulse">Syncing Matrix Node...</p>
            </div>
        );
    }

    const STAT_CARDS = [
        { label: "Attendance Status", value: `${stats.attendanceRate}%`, sub: stats.attendanceRate > 75 ? "High Performance" : "Attention Required", icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10", href: "/student/analytics" },
        { label: "Lab Presence", value: `${stats.attendedSessions}/${stats.totalSessions}`, sub: "Sessions Attended", icon: Calendar, color: "text-amber-500", bg: "bg-amber-500/10", href: "/student/attendance" },
        { label: "Enrolled Nodes", value: stats.enrolledLabs.toString().padStart(2, '0'), sub: "Active Laboratory Nodes", icon: MonitorCheck, color: "text-[#0052a5]", bg: "bg-blue-500/10", href: "/student/labs" },
        { label: "Security Pulse", value: "Verified", sub: "AES-256 Anchored", icon: AlarmClock, color: "text-rose-500", bg: "bg-rose-500/10", href: "/student/profile" }
    ];

    return (
        <div className="space-y-12">
            {/* Header Section */}
            <header>
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-[#0052a5] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                        <MonitorCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-1">
                            {profile ? `Welcome, ${profile.full_name.split(' ')[0]}` : "Student Matrix Command"}
                        </h2>
                        <p className="text-slate-400 font-medium text-[11px] uppercase tracking-widest pl-0.5">
                            Institutional Node: <span className="text-[#0052a5] font-black">{profile?.roll_no || "AUTH_NOD_881"}</span>
                        </p>
                    </div>
                </div>
            </header>

            {/* 1. Hero Stats Board */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">
                {STAT_CARDS.map((stat, i) => (
                    <Link href={stat.href} key={i}>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white p-6 lg:p-8 rounded-[32px] lg:rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-[#0052a5]/5 transition-all group h-full cursor-pointer"
                        >
                            <div className="flex items-center justify-between mb-4 lg:mb-6">
                                <div className={`p-3 lg:p-4 rounded-xl lg:rounded-2xl ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
                                    <stat.icon size={20} strokeWidth={2.5} className="lg:w-6 lg:h-6" />
                                </div>
                                <ArrowUpRight size={18} className="text-slate-200 group-hover:text-[#0052a5]" />
                            </div>
                            <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 lg:mb-2">{stat.label}</p>
                            <h3 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tighter mb-1 lg:mb-2">{stat.value}</h3>
                            <p className={`text-[10px] lg:text-[11px] font-bold ${stat.color} uppercase tracking-widest`}>{stat.sub}</p>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* 2. Main Panels Integration */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                
                {/* Attendance Analytics Matrix (8 Cols) */}
                <div className="lg:col-span-8 bg-white rounded-[32px] lg:rounded-[40px] p-6 lg:p-10 border border-slate-100 shadow-sm overflow-hidden relative group">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 lg:mb-12">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tighter mb-1">Attendance Analytics Matrix</h3>
                            <p className="text-[10px] uppercase font-black tracking-widest text-[#0052a5]">Real-time Academic Synchronicity</p>
                        </div>
                        <Link href="/student/attendance" className="flex items-center gap-4 bg-slate-50 px-5 py-2.5 rounded-full border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                            <History size={16} className="text-[#0052a5]" />
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Attendance Logs</span>
                        </Link>
                    </div>

                    <div className="overflow-x-auto pb-6 scrollbar-hide">
                        <div className="flex items-end justify-between gap-4 lg:gap-8 h-[240px] min-w-[500px] lg:min-w-0 mb-8 pr-4 px-2">
                        {subjects.length > 0 ? subjects.map((subject, i) => (
                            <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group/bar relative">
                                <motion.div 
                                    initial={{ height: 0 }}
                                    animate={{ height: `${subject.percentage}%` }}
                                    transition={{ delay: 0.5 + (i * 0.1), duration: 1, ease: [0.33, 1, 0.68, 1] }}
                                    className={`w-full ${subject.color} rounded-t-[20px] relative shadow-lg shadow-slate-200/50`}
                                >
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-black py-2 px-3 rounded-xl opacity-0 group-hover/bar:opacity-100 transition-all pointer-events-none scale-90 group-hover/bar:scale-100 shadow-2xl z-20 whitespace-nowrap">
                                        {subject.percentage}% SYNCED
                                    </div>
                                </motion.div>
                                <div className="mt-4 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">{subject.name}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center w-full h-full text-slate-300">
                                <MonitorCheck size={48} strokeWidth={1} className="mb-4 opacity-20" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No Node Data Detected</p>
                            </div>
                        )}
                        </div>
                    </div>

                    <div className="hidden lg:block absolute inset-x-10 bottom-24 h-px bg-slate-100"></div>
                </div>

                {/* Recent Activity Sync (4 Cols) */}
                <div className="lg:col-span-4 bg-white rounded-[32px] lg:rounded-[40px] p-6 lg:p-10 border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8 lg:mb-10">
                        <h3 className="text-xl font-black text-slate-900 tracking-tighter">Activity Sync</h3>
                        <Activity size={20} className="text-[#0052a5]" />
                    </div>

                    <div className="space-y-6 relative ml-2">
                        <div className="absolute top-0 bottom-0 -left-6 w-px bg-slate-100"></div>

                        {activities.length > 0 ? activities.map((activity, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8 + (i * 0.1) }}
                                className="relative group cursor-default"
                            >
                                <div className={`absolute top-2.5 -left-8 w-4 h-4 rounded-full border-4 border-white shadow-md z-10 transition-transform group-hover:scale-125 ${
                                    activity.color === 'blue' ? 'bg-[#0052a5]' : 'bg-rose-500'
                                }`}></div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{activity.type}</p>
                                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest ${
                                            activity.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                        }`}>
                                            {activity.status}
                                        </div>
                                    </div>
                                    <h4 className="text-[13px] font-black text-slate-900 tracking-tight leading-none mb-1 group-hover:text-[#0052a5] transition-colors">
                                        {activity.title}
                                    </h4>
                                    <p className="text-[10px] font-bold text-slate-400">{activity.time}</p>
                                </div>
                            </motion.div>
                        )) : (
                            <div className="py-10 text-center">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Recent Handshakes</p>
                            </div>
                        )}
                    </div>

                    <Link href="/student/attendance">
                        <button className="w-full mt-10 py-4 bg-slate-50 rounded-[24px] text-[10px] font-black text-[#0052a5] uppercase tracking-[0.2em] hover:bg-[#0052a5] hover:text-white transition-all duration-300 group">
                            Unlock Full Audit <ArrowUpRight size={14} className="inline ml-2 group-hover:rotate-45 transition-transform" />
                        </button>
                    </Link>
                </div>

            </div>

            {/* Bottom Alert Strip */}
            <div className="bg-[#0052a5] text-white p-6 lg:p-8 rounded-[32px] lg:rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-blue-900/40 relative overflow-hidden group border border-blue-400/20">
                <div className="flex items-center gap-4 lg:gap-6 relative z-10">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 bg-white/10 rounded-2xl lg:rounded-3xl flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform flex-shrink-0">
                        <Info size={24} className="lg:w-8 lg:h-8" />
                    </div>
                    <div>
                        <h4 className="text-lg lg:text-xl font-black tracking-tighter leading-none mb-2 capitalize">Secure Lab Access Optimized</h4>
                        <p className="text-white/60 text-[12px] lg:text-sm font-medium">Your hardware fingerprint is actively anchoring this login node. Handshake confirmed.</p>
                    </div>
                </div>
                <div className="bg-white/20 px-6 lg:px-8 py-2.5 lg:py-3 rounded-full text-[10px] lg:text-[12px] font-black uppercase tracking-widest backdrop-blur-md relative z-10 border border-white/10 whitespace-nowrap">
                    Symmetrically Encrypted
                </div>
                
                {/* Abstract Visual Elements */}
                <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-400/10 rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
                <div className="absolute left-1/2 top-0 w-px h-full bg-blue-400/10 -rotate-45"></div>
            </div>
        </div>
    );
}
