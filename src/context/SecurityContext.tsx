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
  };

  /**
   * 🛡️ Silent Re-Manifestation Protocol
   * On refresh, re-authenticates and generates a new session node if token doesn't exist.
   * Stability: It now checks for existing active nodes matching the fingerprint to prevent churn.
   */
  useEffect(() => {
    const reinitSecurity = async () => {
      setIsVerifying(true);
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (authSession?.user) {
          const fingerprint = generateInstitutionalFingerprint();
          const hash = await hashFingerprint(fingerprint);
          
          // 📡 PERSISTENCE GAIN: Attempt to anchor to existing active node
          const { data: existingActive, error: searchError } = await supabase
            .from('sessions')
            .select('*')
            .eq('student_id', authSession.user.id)
            .eq('fingerprint_hash', hash)
            .eq('is_active', true)
            .maybeSingle();

          if (!searchError && existingActive) {
            // Check chronological expiry (24h)
            if (new Date(existingActive.expires_at) > new Date()) {
              setSession(existingActive.temp_session_id, hash);
              setIsVerifying(false);
              return; // ⚓ Session stable. Re-anchoring successful.
            }
          }

          // Generate temp_session_id via Vanguard protocol (handles unsafe origins)
          const temp_id = generateVanguardUUID();
          
          // Registry Manifestation (Service Role Admin Proxy)
          const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          
          // Invalidate legacy nodes for this student globally to prevent duplication
          await supabase.from('sessions').update({ is_active: false }).eq('student_id', authSession.user.id).eq('is_active', true);
          
          // Manifest new node
          const { error: manifestError } = await supabase.from('sessions').insert({
            temp_session_id: temp_id,
            student_id: authSession.user.id,
            fingerprint_hash: hash,
            expires_at,
            is_active: true
          });

          if (!manifestError) {
             setSession(temp_id, hash);
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
