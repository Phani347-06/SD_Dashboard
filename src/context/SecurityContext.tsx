"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { generateInstitutionalFingerprint, hashFingerprint, generateVanguardUUID } from '@/lib/security';
import { supabase } from '@/lib/supabase';

interface SessionAnchor {
  tempSessionId: string | null;
  fingerprintHash: string | null;
}

interface SecurityContextType {
  tempSessionId: string | null;
  fingerprintHash: string | null;
  setSession: (id: string, hash: string) => void;
  clearSession: () => void;
  isVerifying: boolean;
  refreshSession: () => Promise<SessionAnchor>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const inFlightRefreshRef = useRef<Promise<SessionAnchor> | null>(null);

  const setSession = (id: string, hash: string) => {
    setTempSessionId(id);
    setFingerprintHash(hash);
  };

  const clearSession = () => {
    setTempSessionId(null);
    setFingerprintHash(null);
    sessionStorage.removeItem('__lab_sess_id');
  };

  const refreshSession = async (): Promise<SessionAnchor> => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const refreshPromise = (async (): Promise<SessionAnchor> => {
      setIsVerifying(true);

      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();

        if (!authSession?.user) {
          clearSession();
          return { tempSessionId: null, fingerprintHash: null };
        }

        const nowIso = new Date().toISOString();
        const mask = (val: any) => {
          if (!val) return 'null';
          const str = String(val);
          if (str.length <= 8) return str;
          return `${str.slice(0, 4)}...${str.slice(-4)}`;
        };

        // 🔐 CRITICAL FIX: Use stored fingerprint hash instead of regenerating
        // Fingerprint regeneration can cause hash changes due to device state (rotation, etc)
        let hash = sessionStorage.getItem('__lab_fingerprint_hash');
        
        if (!hash) {
          // First time - generate and store
          const fingerprint = generateInstitutionalFingerprint();
          hash = await hashFingerprint(fingerprint);
          sessionStorage.setItem('__lab_fingerprint_hash', hash);
          console.log('[SecurityContext] First-time fingerprint generated and stored:', mask(hash));
        } else {
          console.log('[SecurityContext] Using stored fingerprint hash:', mask(hash));
        }

        const persistedId = sessionStorage.getItem('__lab_sess_id');
        console.log('[SecurityContext] refreshSession called', {
          authUser: mask(authSession.user.id),
          persistedTempId: mask(persistedId),
          storedHash: mask(hash),
        });
        
        if (persistedId) {
          console.log('[SecurityContext] Attempting to reuse persisted session:', mask(persistedId));
          const { data: sessionNode, error: persistError } = await supabase
            .from('sessions')
            .select('*')
            .eq('temp_session_id', persistedId)
            .eq('student_id', authSession.user.id)
            .eq('is_active', true)
            .gt('expires_at', nowIso)
            .maybeSingle();

          if (persistError) {
            console.warn('[SecurityContext] Persisted session lookup error:', persistError.message);
          }
          
          if (sessionNode) {
            console.log('[SecurityContext] Persisted session found and valid', {
              temp_session_id: mask(sessionNode.temp_session_id),
              is_active: sessionNode.is_active,
              expires_at: sessionNode.expires_at,
              fingerprint_match: sessionNode.fingerprint_hash === hash,
            });
            
            if (sessionNode.fingerprint_hash === hash) {
              console.log('[SecurityContext] ✅ Fingerprint matches, reusing persisted session');
              setSession(sessionNode.temp_session_id, hash);
              return { tempSessionId: sessionNode.temp_session_id, fingerprintHash: hash };
            } else {
              console.warn('[SecurityContext] Fingerprint mismatch!', {
                stored: mask(sessionNode.fingerprint_hash),
                current: mask(hash),
              });
              // Fingerprint mismatch - will create new session below
            }
          } else {
            console.log('[SecurityContext] Persisted session not found or expired');
          }
        }

        console.log('[SecurityContext] Looking for active sessions with stored fingerprint:', mask(hash));
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
          console.log('[SecurityContext] Retrying with expires_at order...');
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
          console.error("[SecurityContext] Session lookup error:", deviceSessionQuery.error.message);
        }

        if (deviceSessionQuery.data) {
          console.log('[SecurityContext] ✅ Found active session via fingerprint lookup');
          setSession(deviceSessionQuery.data.temp_session_id, hash);
          sessionStorage.setItem('__lab_sess_id', deviceSessionQuery.data.temp_session_id);
          return { tempSessionId: deviceSessionQuery.data.temp_session_id, fingerprintHash: hash };
        }
        
        console.log('[SecurityContext] No active session found - checking cleanup and renewal');

        // Mark old sessions (different fingerprint or expired)
        const markOldSessionsRes = await supabase
          .from('sessions')
          .update({ is_active: false })
          .eq('student_id', authSession.user.id)
          .neq('fingerprint_hash', hash)
          .eq('is_active', true);
        
        if (markOldSessionsRes.error) {
          console.warn('[SecurityContext] Error marking old sessions:', markOldSessionsRes.error.message);
        } else {
          console.log('[SecurityContext] Marked old/mismatched sessions as inactive');
        }

        // Mark expired sessions
        const markExpiredRes = await supabase
          .from('sessions')
          .update({ is_active: false })
          .eq('student_id', authSession.user.id)
          .lt('expires_at', nowIso)
          .eq('is_active', true);
        
        if (markExpiredRes.error) {
          console.warn('[SecurityContext] Error marking expired sessions:', markExpiredRes.error.message);
        }

        // Cleanup very old sessions (30+ days old)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const deleteOldRes = await supabase
          .from('sessions')
          .delete()
          .lt('created_at', thirtyDaysAgo.toISOString());
        
        if (deleteOldRes.error) {
          console.warn('[SecurityContext] Error deleting old sessions:', deleteOldRes.error.message);
        } else {
          console.log('[SecurityContext] Cleaned up old sessions');
        }

        // Create fresh session
        const tempId = generateVanguardUUID();
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

        console.log('[SecurityContext] Creating new session', {
          temp_session_id: mask(tempId),
          student_id: mask(authSession.user.id),
          fingerprint_hash: mask(hash),
          expires_at: expiresAt,
        });

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
          console.error("[SecurityContext] Session creation failed:", manifestError.message);
          return { tempSessionId: null, fingerprintHash: null };
        }

        console.log('[SecurityContext] ✅ New session created:', mask(tempId));
        setSession(tempId, hash);
        sessionStorage.setItem('__lab_sess_id', tempId);
        return { tempSessionId: tempId, fingerprintHash: hash };
      } catch (err) {
        console.error("[SecurityContext] refreshSession exception:", err);
        return { tempSessionId: null, fingerprintHash: null };
      } finally {
        setIsVerifying(false);
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = refreshPromise;
    return refreshPromise;
  };

  useEffect(() => {
    let isDisposed = false;
    const refreshVisibleSession = () => {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    };

    void refreshSession();

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshSession();
      }
    }, 60_000);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
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
    <SecurityContext.Provider value={{ tempSessionId, fingerprintHash, setSession, clearSession, isVerifying, refreshSession }}>
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
