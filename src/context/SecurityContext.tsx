"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
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

export function SecurityProvider({ children }: { children: React.ReactNode }) {
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

  useEffect(() => {
    let isDisposed = false;
    let refreshInFlight = false;

    const reinitSecurity = async () => {
      if (isDisposed || refreshInFlight) return;

      refreshInFlight = true;
      setIsVerifying(true);

      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();

        if (!authSession?.user) {
          clearSession();
          return;
        }

        const fingerprint = generateInstitutionalFingerprint();
        const hash = await hashFingerprint(fingerprint);
        const nowIso = new Date().toISOString();

        const persistedId = sessionStorage.getItem('__lab_sess_id');
        if (persistedId) {
          const { data: sessionNode } = await supabase
            .from('sessions')
            .select('*')
            .eq('temp_session_id', persistedId)
            .eq('student_id', authSession.user.id)
            .eq('is_active', true)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sessionNode && sessionNode.fingerprint_hash === hash) {
            setSession(sessionNode.temp_session_id, hash);
            return;
          }
        }

        let deviceSessionQuery = await supabase
          .from('sessions')
          .select('*')
          .eq('student_id', authSession.user.id)
          .eq('fingerprint_hash', hash)
          .eq('is_active', true)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (deviceSessionQuery.error?.message?.includes('created_at')) {
          deviceSessionQuery = await supabase
            .from('sessions')
            .select('*')
            .eq('student_id', authSession.user.id)
            .eq('fingerprint_hash', hash)
            .eq('is_active', true)
            .gt('expires_at', nowIso)
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        }

        if (deviceSessionQuery.error) {
          console.error("Security Matrix Recovery Failed:", deviceSessionQuery.error.message);
        }

        if (deviceSessionQuery.data) {
          setSession(deviceSessionQuery.data.temp_session_id, hash);
          sessionStorage.setItem('__lab_sess_id', deviceSessionQuery.data.temp_session_id);
          return;
        }

        await supabase
          .from('sessions')
          .update({ is_active: false })
          .eq('student_id', authSession.user.id)
          .neq('fingerprint_hash', hash)
          .eq('is_active', true);

        await supabase
          .from('sessions')
          .update({ is_active: false })
          .eq('student_id', authSession.user.id)
          .lt('expires_at', nowIso)
          .eq('is_active', true);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        await supabase
          .from('sessions')
          .delete()
          .lt('created_at', thirtyDaysAgo.toISOString());

        const tempId = generateVanguardUUID();
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

        const { error: manifestError } = await supabase
          .from('sessions')
          .insert({
            temp_session_id: tempId,
            student_id: authSession.user.id,
            fingerprint_hash: hash,
            expires_at: expiresAt,
            is_active: true,
          });

        if (manifestError) {
          console.error("Security Re-Manifestation Failure:", manifestError.message);
          return;
        }

        setSession(tempId, hash);
        sessionStorage.setItem('__lab_sess_id', tempId);
      } catch (err) {
        console.error("Security Re-Manifestation Failure:", err);
      } finally {
        refreshInFlight = false;
        if (!isDisposed) {
          setIsVerifying(false);
        }
      }
    };

    const refreshVisibleSession = () => {
      if (document.visibilityState === 'visible') {
        reinitSecurity();
      }
    };

    reinitSecurity();

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        reinitSecurity();
      }
    }, 60_000);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      reinitSecurity();
    });

    window.addEventListener('focus', refreshVisibleSession);
    document.addEventListener('visibilitychange', refreshVisibleSession);

    return () => {
      isDisposed = true;
      window.clearInterval(heartbeatId);
      window.removeEventListener('focus', refreshVisibleSession);
      document.removeEventListener('visibilitychange', refreshVisibleSession);
      authListener.subscription.unsubscribe();
    };
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
