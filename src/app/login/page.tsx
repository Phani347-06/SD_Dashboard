"use client";
import { useState, useEffect } from 'react';
import { 
  Fingerprint, 
  FlaskConical, 
  KeyRound, 
  Mail, 
  QrCode, 
  ShieldCheck, 
  ArrowRight,
  UserCircle,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSecurity } from '@/context/SecurityContext';
import { generateInstitutionalFingerprint, hashFingerprint, generateVanguardUUID } from '@/lib/security';

export default function LoginPage() {
  const router = useRouter();
  const { setSession, clearSession } = useSecurity();
  const [role, setRole] = useState<'student' | 'faculty'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'onboarding'>('signin');
  const [fullName, setFullName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [department, setDepartment] = useState('');
  const [authUser, setAuthUser] = useState<any>(null); // To store session user for onboarding
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Detect recovery mode or activation from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    
    if (hash) {
      if (hash.includes('type=recovery')) {
        setMode('reset');
        setSuccessMsg("System Access Granted: You may now define a new secure password.");
      } else if (hash.includes('type=signup') || hash.includes('type=invite')) {
        setSuccessMsg("Identity Node Activated: Your institutional account is now live. Please log in.");
        setMode('signin');
      }
    }
  }, []);

  const handleLoginSuccess = (defaultRoute: string) => {
     const redirect = localStorage.getItem('redirect_after_login');
     if (redirect) {
        localStorage.removeItem('redirect_after_login');
        router.push(redirect);
     } else {
        router.push(defaultRoute);
     }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      // Step 0: Institutional Role Guard
      if (mode !== 'reset') {
        const isFacultyEmail = (email.toLowerCase().startsWith('admin')) || /^\d{2}[a-zA-Z]{3}\d{3}/.test(email);
        const isStudentEmail = /^\d/.test(email) && !isFacultyEmail;
        if (role === 'student' && !isStudentEmail) {
           throw new Error("Institutional Conflict: Use Researcher credentials for Student access.");
        }
        if (role === 'faculty' && isStudentEmail) {
           throw new Error("Institutional Conflict: Use Command Node credentials for Faculty access.");
        }
      }

      // Step 0.5: Cross-Matrix Contention Check (Deter Mis-Mapping)
      if (mode === 'signup') {
         const clashingTable = role === 'student' ? 'faculty' : 'students';
         const clashingField = role === 'student' ? 'email' : 'roll_no';
         const clashingVal = role === 'student' ? email : email.split('@')[0].toUpperCase();

         const { data: clash } = await supabase.from(clashingTable).select('id').eq(clashingField, clashingVal).single();
         if (clash) {
            throw new Error(`Institutional Conflict: Identity already Manifested as an authorized ${role === 'student' ? 'Faculty' : 'Student'} node.`);
         }
      }

      if (mode === 'forgot') {
         // Handle Password Reset Request
         const { error } = await supabase.auth.resetPasswordForEmail(email, {
             redirectTo: window.location.origin + '/login',
         });
         if (error) throw error;
         setSuccessMsg("Recovery protocol initiated. Check your institutional email for the reset link.");
         setLoading(false);
         return;
      }

      if (mode === 'reset') {
         // Handle Password Update
         const { error } = await supabase.auth.updateUser({ password });
         if (error) throw error;
         setSuccessMsg("Security credentials updated. You may now authenticate with your new password.");
         setMode('signin');
         setLoading(false);
         return;
      }

      let authResponse: any;

          // Step 1: Authentication Matrix Handshake
          if (mode === 'signup') {
             authResponse = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin + '/login',
                }
             });
             if (authResponse.error) throw authResponse.error;
             if (!authResponse.data.user) throw new Error("Sync Failure: Identity node generation aborted.");
             
             // Check if Confirmation is required (no session returned)
             if (!authResponse.data.session) {
                setSuccessMsg("Account Manifested: Please verify your institutional email node to continue.");
                setLoading(false);
                return;
             }
          } else {
             authResponse = await supabase.auth.signInWithPassword({
                email,
                password,
             });
             if (authResponse.error) throw authResponse.error;
          }

          // Step 3: Institutional Security Manifestation (Silent Layer)
          const fingerprint = generateInstitutionalFingerprint();
          const fingerprintHash = await hashFingerprint(fingerprint);
          const temp_session_id = generateVanguardUUID();

          // Step 4: Institutional Matrix Synchronization (Atomic Pulse)
          const matrixTable = role === 'student' ? 'students' : 'faculty';
          let { data: profile, error: fetchError } = await supabase
            .from(matrixTable)
            .select('*')
            .eq('id', authResponse.data.user?.id)
            .single();

          if (fetchError || !profile) {
             // Self-Healing Identity Manifestation
             const syncPayload: any = {
                id: authResponse.data.user.id,
                full_name: fullName || (role === 'student' ? 'Institutional Researcher' : 'Faculty Administrator')
             };

             // Dynamic Identity Anchor
             if (role === 'student') {
                syncPayload.roll_no = email.split('@')[0].toUpperCase();
             } else {
                syncPayload.email = email;
             }
             
             const { data: newProfile, error: syncError } = await supabase
                .from(matrixTable)
                .upsert(syncPayload, { onConflict: 'id' })
                .select()
                .single();
             
             if (syncError) {
                console.error("Identity Handshake Failure State:", JSON.stringify(syncError, null, 2));
                
                // Handle Identity Forge: Resolve clashing roll_no or email anchors
                if (syncError.code === '23505') {
                   const conflictCol = role === 'student' ? 'roll_no' : 'email';
                   const conflictVal = role === 'student' ? syncPayload.roll_no : syncPayload.email;

                   // Purge legacy node (RLS authorizes this for the verified email owner)
                   await supabase.from(matrixTable).delete().eq(conflictCol, conflictVal).neq('id', authResponse.data.user.id);
                   
                   // Final Identity Manifestation Retry
                   const { data: retriedProfile, error: retryError } = await supabase
                      .from(matrixTable)
                      .upsert(syncPayload)
                      .select()
                      .single();
                   
                   if (retryError) throw new Error(`Institutional Conflict: Identity already anchored to another ${role} node.`);
                   profile = retriedProfile;
                } else {
                   throw new Error("Cloud synchronization protocol interrupted.");
                }
             } else {
                profile = newProfile;
             }
          }

          // Step 4.5: Institutional Onboarding Check
          if (!profile.department) {
             setAuthUser(authResponse.data.user);
             setMode('onboarding');
             setLoading(false);
             return;
          }

          // Step 5: Silent Background Security — Session Matrix Manifestation
          if (role === 'student') {
             const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
             
             // 5.1 🧹 INSTITUTIONAL CLEANUP: Remove legacy sessions (Direct Removal)
             await supabase.from('sessions').delete().eq('student_id', profile.id);

             // 5.2 Manifest new temporary session node
             const { error: sessionError } = await supabase.from('sessions').insert({
                temp_session_id: temp_session_id,
                student_id: profile.id,
                fingerprint_hash: fingerprintHash,
                expires_at
             });

             if (sessionError) {
                console.error("CRITICAL: SECURITY_MATRIX_FAILURE", sessionError);
                throw new Error(`Security Matrix Manifestation Failure: [${sessionError.code}] ${sessionError.message}`);
             }

             // 5.3 Sync memory-only nodes (Deter persistence)
             setSession(temp_session_id, fingerprintHash);
             setSuccessMsg("System Access Granted: Previous session ended. You are now signed in on this device.");

             // 5.4 Primary Hardware Lock Check (Permanent Affinity)
             if (!profile.registered_device_fingerprint) {
                const { error: lockError } = await supabase
                   .from('students')
                   .update({ registered_device_fingerprint: fingerprintHash })
                   .eq('id', profile.id);
                if (lockError) throw new Error("Hardware Anchor Synchronization Failed.");
             } else if (profile.registered_device_fingerprint !== fingerprintHash) {
                // Device Mismatch Detected: Auto-Purge invalid session node (Direct Removal)
                await supabase.from('sessions').delete().eq('temp_session_id', temp_session_id);
                clearSession();
                throw new Error("Hardware Lock Error: Device mismatch. Presence from unrecognized nodes is restricted.");
             }
          }

       // 6. Navigation Protocol
       handleLoginSuccess(role === 'student' ? '/student' : '/attendance');
    } catch (err: any) {
       setErrorMsg(err.message || "Institutional Proxy Error: Access Interrupted.");
       if (mode !== 'signup' && mode !== 'forgot' && mode !== 'reset') {
          await supabase.auth.signOut();
       }
    } finally {
       setLoading(false);
    }
  };

  const handleFacultyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
       // Step 0: Institutional Role Guard
       const isFacultyEmail = email.toLowerCase().startsWith('admin') || /^\d{2}[a-zA-Z]{3}\d{3}/.test(email);
       const isStudentEmail = /^\d/.test(email) && !isFacultyEmail;
       if (isStudentEmail) {
          throw new Error("Institutional Conflict: Researcher nodes are restricted from Command Node access.");
       }

       // 1. Sign In Handshake
       const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
       });

       if (error) throw error;
       if (!data.user) throw new Error("Command Center Access Failure: Identity node offline.");

       // 2. Institutional Matrix Sync (Faculty Hub)
       const { data: faculty, error: fError } = await supabase
          .from('faculty')
          .select('*')
          .eq('id', data.user.id)
          .single();

       let facultyRecord = faculty;

       if (fError || !faculty) {
          // Institutional Manifestation Handshake
          const syncPayload = {
             id: data.user.id,
             email: email,
             full_name: fullName || 'Faculty Administrator'
          };
          
          const { data: newFaculty, error: syncError } = await supabase
             .from('faculty')
             .upsert(syncPayload, { onConflict: 'id' })
             .select()
             .single();

          if (syncError) {
             console.error("Faculty Handshake Logic Error:", JSON.stringify(syncError, null, 2));
             
             // Handle Identity Contention (Existing Email Anchor OR Student Matrix Clash)
             if (syncError.code === '23505' || syncError.message.includes('students')) {
                // Purge legacy unclaimed record with this email from Faculty Registry
                await supabase.from('faculty').delete().eq('email', email).neq('id', data.user.id);
                // Purge legacy mis-mapped record with this email from Student Registry (Role Conversion)
                await supabase.from('students').delete().eq('roll_no', email.split('@')[0].toUpperCase());
                
                // Final Identity Manifestation Retry
                const { data: retriedFaculty, error: retryError } = await supabase
                   .from('faculty')
                   .upsert(syncPayload)
                   .select()
                   .single();
                
                if (retryError) throw new Error("Institutional Conflict: Email node already verified for another identity.");
                facultyRecord = retriedFaculty;
             } else {
                setErrorMsg("Institutional Error: Failed to manifest Faculty identity node.");
                await supabase.auth.signOut();
                return;
             }
          } else {
             facultyRecord = newFaculty;
          }
       }

       // Step 2.5: Faculty Onboarding Protocol
       if (!facultyRecord.department) {
          setAuthUser(data.user);
          setMode('onboarding');
          setLoading(false);
          return;
       }

       setSuccessMsg("System Authorization Confirmed. Accessing Command Center...");
       handleLoginSuccess('/attendance');
    } catch (err: any) {
       setErrorMsg(err.message || "Command System Failure: Protocol Interrupted.");
    } finally {
       setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
       let user = authUser;
       if (!user) {
          user = (await supabase.auth.getUser()).data.user;
       }
       if (!user) throw new Error("Session Authorization Protocol Interrupted: Please log in again.");

       const table = role === 'student' ? 'students' : 'faculty';
       
       const onboardingData: any = {
          id: user.id,
          college_id: collegeId,
          department: department,
          full_name: fullName || (role === 'student' ? 'Student User' : 'Faculty Admin')
       };

       // Add role-specific unique identifiers
       if (role === 'faculty') {
          onboardingData.email = user.email;
       } else {
          onboardingData.roll_no = user.email.split('@')[0].toUpperCase();
       }

       const { error } = await supabase
          .from(table)
          .upsert(onboardingData, { 
             onConflict: role === 'faculty' ? 'email' : 'id' 
          });

       if (error) {
          // If conflict exists on unique fields (roll_no or email), it means a legacy record exists.
          if (error.code === '23505') {
             const conflictCol = role === 'student' ? 'roll_no' : 'email';
             const conflictVal = role === 'student' ? onboardingData.roll_no : user.email;

             // Purge redundant legacy node (RLS authorizes deletion of unverified/unclaimed nodes)
             await supabase.from(table).delete().eq(conflictCol, conflictVal).neq('id', user.id);
             
             // Final Synchronization Retry
             const { error: retryError } = await supabase
                .from(table)
                .upsert(onboardingData);
             if (retryError) throw retryError;
          } else {
             throw error;
          }
       }
       
       setSuccessMsg("Institutional Verification Complete: Credentials Activated.");
       handleLoginSuccess(role === 'student' ? '/student' : '/attendance');
    } catch (err: any) {
       setErrorMsg(err.message || "Onboarding Protocol Failed.");
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50 rounded-full blur-3xl opacity-50 -mr-96 -mt-96 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#e6f4ea] rounded-full blur-3xl opacity-40 -ml-72 -mb-72 pointer-events-none"></div>

      <div className="w-full max-w-5xl flex gap-8 items-stretch relative z-10">
        
        {/* Left Branding Panel */}
        <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0052a5] rounded-3xl p-12 text-white shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-16">
              <div className="bg-white w-12 h-12 rounded-xl flex items-center justify-center shadow-md">
                <FlaskConical size={24} className="text-[#0052a5]" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight leading-none text-white">Lab Intel</h1>
                <p className="text-[10px] uppercase font-bold tracking-widest text-blue-200 mt-1">Clinical Prism V1.0</p>
              </div>
            </div>

            <h2 className="text-4xl font-extrabold mb-6 leading-tight">Secure Lab <br/> Attendance Protocol</h2>
            <p className="text-blue-100 font-medium leading-relaxed max-w-sm">
              Authenticating hardware proximity through isolated BLE beacon validation and cryptographic device fingerprinting.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-6 mt-16 font-bold text-sm text-blue-100">
             <div className="flex items-center gap-3"><ShieldCheck size={20} className="text-blue-300"/> Institutional Matrix</div>
             <div className="flex items-center gap-3"><Fingerprint size={20} className="text-blue-300"/> Zero-Proxy Engine</div>
             <div className="flex items-center gap-3"><QrCode size={20} className="text-blue-300"/> Rolling Encryption</div>
          </div>
        </div>

        {/* Right Authentication Panel */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center">
          <div className="bg-white p-10 sm:p-14 rounded-3xl shadow-xl shadow-blue-900/5 border border-slate-100">
            
            <div className="text-center mb-10">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Access Gateway</h2>
              <p className="text-[13px] font-medium text-slate-500 mt-2">Select your institutional role to continue</p>
            </div>

            {/* Role Toggles */}
            <div className="flex p-1.5 bg-slate-100/80 rounded-2xl mb-10 w-full max-w-xs mx-auto">
              <button 
                onClick={() => setRole('student')}
                className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 ${role === 'student' ? 'bg-white text-[#0052a5] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Student
                </button>
              <button 
                onClick={() => { setRole('faculty'); setErrorMsg(""); }}
                className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-all duration-300 ${role === 'faculty' ? 'bg-white text-[#0052a5] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Faculty
              </button>
            </div>

            {/* Error & Success Message Modules */}
            {errorMsg && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-300">
                 <ShieldCheck size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                 <p className="text-[12px] font-bold text-red-800 leading-snug">{errorMsg}</p>
              </div>
            )}
            {successMsg && (
              <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-300">
                 <ShieldCheck size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                 <p className="text-[12px] font-bold text-green-800 leading-snug">{successMsg}</p>
              </div>
            )}

            {/* Form Area */}
            {mode === 'onboarding' ? (
              <form onSubmit={handleOnboardingSubmit} className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 mb-6 font-bold text-center text-blue-900 animate-pulse">
                   Identity Manifestation: Finalizing Profile...
                </div>

                <div>
                   <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">College ID No.</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <QrCode size={18} />
                      </div>
                      <input 
                        type="text" 
                        required
                        value={collegeId}
                        onChange={(e) => setCollegeId(e.target.value)}
                        placeholder="e.g. 21B81A05A1" 
                        className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all"
                      />
                    </div>
                </div>

                <div>
                   <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">Department Path</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <ShieldCheck size={18} />
                      </div>
                      <input 
                        type="text" 
                        required
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="e.g. Electrical & Electronics Engineering" 
                        className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all"
                      />
                    </div>
                </div>

                <button disabled={loading} type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-4 bg-[#0052a5] hover:bg-[#00438a] text-white rounded-2xl text-[14px] font-bold shadow-md shadow-blue-900/20 transition-all group disabled:opacity-70">
                   {loading ? <Loader2 size={18} className="animate-spin" /> : (
                      <>Activate Institutional Profile <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                   )}
                </button>
              </form>
            ) : mode === 'forgot' || mode === 'reset' ? (
              <form onSubmit={handleStudentLogin} className="space-y-6 animate-in fade-in duration-500">
                  {mode === 'forgot' ? (
                    <div>
                      <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">Institutional Recovery Email</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                          <Mail size={18} />
                        </div>
                        <input 
                          type="email" 
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. user@vnrvjiet.in" 
                          className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="animate-in fade-in slide-in-from-top-2">
                       <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">New Secure Password</label>
                       <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <ShieldCheck size={18} />
                          </div>
                          <input 
                            type="password" 
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Set your new credentials" 
                            className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-bold tracking-[0.2em] bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400"
                          />
                       </div>
                    </div>
                  )}

                  <button disabled={loading} type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-4 text-white rounded-2xl text-[14px] font-bold shadow-md transition-all group disabled:opacity-70 bg-slate-800 hover:bg-slate-700">
                     {loading ? <Loader2 size={18} className="animate-spin" /> : (
                        <>
                           {mode === 'forgot' ? "Send Reset Link" : "Update Secure Password"} 
                           <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                     )}
                  </button>

                  <div className="text-center mt-6">
                     <button type="button" onClick={() => { setMode('signin'); setErrorMsg(""); setSuccessMsg(""); }} className="text-[12px] font-bold text-[#0052a5] hover:underline flex items-center justify-center gap-2 mx-auto">
                        Return to Access Gateway
                     </button>
                  </div>
              </form>
            ) : role === 'student' ? (
              <form onSubmit={handleStudentLogin} className="space-y-5 animate-in fade-in duration-500">
                  
                  {/* Register Fields */}
                  {mode === 'signup' && (
                    <div className="animate-in slide-in-from-top-2 duration-300">
                      <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">Display Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                          <UserCircle size={18} />
                        </div>
                        <input 
                          type="text" 
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your Full Name (e.g. Rahul Sharma)" 
                          className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Email Field */}
                    <div>
                      <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">Institutional Email</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                          <Mail size={18} />
                        </div>
                        <input 
                          type="email" 
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. student@vnrvjiet.in" 
                          className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    <div className="animate-in fade-in slide-in-from-top-2">
                       <div className="flex justify-between items-end mb-2">
                          <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1">Secure Password</label>
                          {mode === 'signin' && (
                            <button type="button" onClick={() => { setMode('forgot'); setErrorMsg(""); setSuccessMsg(""); }} className="text-[11px] font-bold text-[#0052a5] hover:underline">
                               Forgot Password?
                            </button>
                          )}
                       </div>
                       <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                            <KeyRound size={18} />
                          </div>
                          <input 
                            type="password" 
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••" 
                            className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-bold tracking-[0.2em] bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400"
                          />
                       </div>
                    </div>

                  {mode === 'signup' && (
                    <div className="flex bg-orange-50/50 p-4 rounded-xl border border-orange-100 gap-3 mt-4">
                       <Fingerprint size={18} className="text-orange-600 flex-shrink-0 mt-0.5" />
                       <p className="text-[11px] font-medium text-orange-800 leading-tight">
                         By registering, this device&apos;s exact cryptographical blueprint will be permanently locked to your Roll Number. Do not register on multiple devices.
                       </p>
                    </div>
                  )}

                  <button disabled={loading} type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-4 text-white rounded-2xl text-[14px] font-bold shadow-md transition-all group disabled:opacity-70 bg-[#1e8e3e] hover:bg-[#177233] shadow-green-900/20">
                     {loading ? <Loader2 size={18} className="animate-spin" /> : (
                        <>
                           {mode === 'signin' ? "Authenticate & Login" : "Manifest Secure Node"} 
                           <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                     )}
                  </button>

                  <div className="text-center mt-6">
                     {mode === 'signin' ? (
                       <p className="text-[12px] font-medium text-slate-500">
                         First time accessing the Lab? <button type="button" onClick={() => { setMode('signup'); setErrorMsg(""); setSuccessMsg(""); }} className="font-bold text-[#0052a5] hover:underline">Create an account</button>
                       </p>
                     ) : (
                       <p className="text-[12px] font-medium text-slate-500">
                         Already registered your device? <button type="button" onClick={() => { setMode('signin'); setErrorMsg(""); setSuccessMsg(""); }} className="font-bold text-[#0052a5] hover:underline">Sign In directly</button>
                       </p>
                     )}
                  </div>

              </form>
            ) : (
              <form onSubmit={handleFacultyLogin} className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                 <div className="space-y-5">
                    <div>
                      <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1 mb-2">Institutional Faculty ID / Email</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                          <UserCircle size={18} />
                        </div>
                        <input 
                          type="email" 
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="professor@vnrvjiet.in" 
                          className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-medium bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <label className="block text-[12px] font-bold text-slate-700 uppercase tracking-widest pl-1">Secure Command PIN</label>
                        <button type="button" onClick={() => { setMode('forgot'); setErrorMsg(""); setSuccessMsg(""); }} className="text-[11px] font-bold text-[#0052a5] hover:underline">
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                          <KeyRound size={18} />
                        </div>
                        <input 
                          type="password" 
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••" 
                          className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-[14px] font-bold tracking-[0.2em] bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#0052a5] transition-all placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                 </div>
                 
                 <button disabled={loading} type="submit" className="w-full mt-2 flex items-center justify-center gap-2 py-4 bg-[#0052a5] hover:bg-[#00438a] text-white rounded-2xl text-[14px] font-bold shadow-md shadow-blue-900/20 transition-all group disabled:opacity-70">
                     {loading ? <Loader2 size={18} className="animate-spin" /> : (
                        <><KeyRound size={18} className="group-hover:rotate-12 transition-transform" /> Enter Command Center <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                     )}
                  </button>
              </form>
            )}

            <div className="mt-10 text-center border-t border-slate-100 pt-8">
               <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                  © 2026 Lab Intel Precision Command
               </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
