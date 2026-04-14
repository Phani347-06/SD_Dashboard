"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { generateInstitutionalFingerprint, hashFingerprint, generateVanguardUUID } from '@/lib/security';
import { supabase } from '@/lib/supabase';

interface SecurityContextType {
  tempSessionId: string | null;
  fingerprintHash: string | null;
  setSession: (id: string, hash: string) => void;
  clearSession: () => void;
  isVerifying: boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

/**
 * 🛰️ Institutional Security Provider
 * Manages the memory-only session nodes for the Silent Background Security layer.
 */
export function SecurityProvider({ children }: { children: React.ReactNode }) {
  // Memory-only storage (not in localStorage/sessionStorage)
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  const setSession = (id: string, hash: string) => {
    setTempSessionId(id);
    setFingerprintHash(hash);
  };

  const clearSession = () => {
    setTempSessionId(null);
    setFingerprintHash(null);
    sessionStorage.removeItem('__lab_sess_id');
  };

  /**
   * 🛡️ Silent Re-Manifestation Protocol
   * Stabilized with sessionStorage anchor and Fingerprint-Affinity rules.
   */
  useEffect(() => {
    const reinitSecurity = async () => {
      setIsVerifying(true);
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (authSession?.user) {
          const fingerprint = generateInstitutionalFingerprint();
          const hash = await hashFingerprint(fingerprint);
          
          // 1. Try to re-anchor using sessionStorage (survives tab refresh)
          const persistedId = sessionStorage.getItem('__lab_sess_id');
          if (persistedId) {
            const { data: sessionNode } = await supabase
              .from('sessions')
              .select('*')
              .eq('temp_session_id', persistedId)
              .eq('student_id', authSession.user.id)
              .maybeSingle();
            
            if (sessionNode && sessionNode.fingerprint_hash === hash) {
              console.log("🛡️ Session Anchor Verified: Persistent node matched.");
              setSession(persistedId, hash);
              setIsVerifying(false);
              return;
            }
          }

          // 2. Try to re-anchor using device fingerprint (survives app closure/re-open)
          const { data: deviceSession } = await supabase
            .from('sessions')
            .select('*')
            .eq('student_id', authSession.user.id)
            .eq('fingerprint_hash', hash)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (deviceSession) {
            console.log("🛡️ Session Anchor Recovered: Existing device node manifested.");
            setSession(deviceSession.temp_session_id, hash);
            sessionStorage.setItem('__lab_sess_id', deviceSession.temp_session_id);
            setIsVerifying(false);
            return;
          }

          // 3. Manifest New Node (Single Device Enforcement + Permanent Cleanup)
          console.warn("Generating New Identity Node. Purging foreign fingerprints.");
          
          // 🧹 INSTITUTIONAL CLEANUP: Direct Removal of irrelevant data
          // A: Remove sessions from DIFFERENT devices (fingerprints)
          await supabase
            .from('sessions')
            .delete()
            .eq('student_id', authSession.user.id)
            .neq('fingerprint_hash', hash);

          // B: Sweep chronological detritus (Expired sessions for this student)
          await supabase
            .from('sessions')
            .delete()
            .eq('student_id', authSession.user.id)
            .lt('expires_at', new Date().toISOString());

          const temp_id = generateVanguardUUID();
          const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          
          const { error: manifestError } = await supabase.from('sessions').insert({
            temp_session_id: temp_id,
            student_id: authSession.user.id,
            fingerprint_hash: hash,
            expires_at
          });

          if (!manifestError) {
             setSession(temp_id, hash);
             sessionStorage.setItem('__lab_sess_id', temp_id);
          }
        }
      } catch (err) {
        console.error("Security Re-Manifestation Failure:", err);
      } finally {
        setIsVerifying(false);
      }
    };

    reinitSecurity();
  }, []);

  return (
    <SecurityContext.Provider value={{ tempSessionId, fingerprintHash, setSession, clearSession, isVerifying }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
