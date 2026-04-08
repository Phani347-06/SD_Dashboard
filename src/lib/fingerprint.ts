/**
 * Zero-Trust Device Fingerprinting
 * Combines hardware limits, user agent, and an encrypted token to prevent buddy scanning.
 */
export async function getDeviceFingerprint(): Promise<string> {
  // 1. Ensure we have a persistent local token mapping the device
  let deviceToken = localStorage.getItem('__lab_device_anchor');
  if (!deviceToken) {
    deviceToken = crypto.randomUUID();
    localStorage.setItem('__lab_device_anchor', deviceToken);
  }

  // 2. Gather highly identifiable browser entropy
  const userAgent = navigator.userAgent;
  const cores = navigator.hardwareConcurrency || 'unknown';
  const screenHash = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const language = navigator.language;

  // 3. Construct fingerprint payload
  const rawPayload = `${deviceToken}-${userAgent}-${cores}-${screenHash}-${language}`;

  // 4. Hash using Web Crypto API natively to generate a 64-char hex string
  const encoder = new TextEncoder();
  const data = encoder.encode(rawPayload);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // 5. Convert buffer to Hex String
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
