/**
 * 🛰️ Institutional Security Protocol: Device Fingerprinting & Hashing
 * Manifests the silent background security layer for identity binding.
 */

/**
 * Generates a browser-independent canvas fingerprint node.
 */
export function getCanvasFingerprint(): string {
  if (typeof document === 'undefined') return 'server_node';
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'unsupported_rendering_node';
    
    // Manifest Institutional Encryption Layer (Visual)
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125,1,62,20);
    ctx.fillStyle = "#069";
    ctx.fillText("institutional-node-v1", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "18px 'Arial'";
    ctx.fillText("hardware-handshake-matrix-lock", 4, 45);
    
    return canvas.toDataURL();
  } catch (e) {
    return 'rendering_interrupted';
  }
}

/**
 * Generates the complete institutional hardware signature.
 */
export function generateInstitutionalFingerprint(): any {
  if (typeof navigator === 'undefined') return {};
  
  return {
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: (navigator as any).platform || 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || 0,
    touchPoints: navigator.maxTouchPoints || 0,
    canvas: getCanvasFingerprint()
  };
}

/**
 * Deterministic helper to sort object keys recursively.
 * Ensures consistent hashing of security signatures across browser environments.
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.keys(obj).sort().reduce((acc: any, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

/**
 * Hashes the fingerprint object into a SHA-256 institutional digest.
 * Includes a fallback for Non-Secure Contexts (HTTP over Network).
 */
export async function hashFingerprint(fingerprint: any): Promise<string> {
  // 1. Stabilize the raw artifact through deterministic sorting
  const stabilized = sortObjectKeys(fingerprint);
  const msg = JSON.stringify(stabilized);
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(msg);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn("Security Manifestation: Hardware crypto interrupted, engaging fallback protocol.");
    }
  }
  
  // Fallback for non-secure context (HTTP) or unsupported browsers
  // Using a robust string hashing algorithm (djb2 inspired)
  let hash = 0;
  for (let i = 0; i < msg.length; i++) {
    const char = msg.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const part1 = Math.abs(hash).toString(16).padStart(8, '0');
  
  // Add a second pass with a different seed for more entropy
  let hash2 = 5381;
  for (let i = 0; i < msg.length; i++) {
    hash2 = ((hash2 << 5) + hash2) + msg.charCodeAt(i);
  }
  const part2 = Math.abs(hash2).toString(16).padStart(8, '0');
  
  return `unsafe-node-${part1}-${part2}`;
}

/**
 * Institutional Identity Manifestation: UUID Protocol
 * Generates a unique node ID with fallback for non-secure environments.
 */
export function generateVanguardUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof (window.crypto as any).randomUUID === 'function') {
    return (window.crypto as any).randomUUID();
  }
  
  // Fallback implementation of random node manifestation (version 4 UUID)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
