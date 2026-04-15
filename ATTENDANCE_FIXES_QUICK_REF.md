# Attendance 401 Fixes - Quick Reference

## Problem
Students were getting `401 "Session invalid or expired"` errors when submitting QR attendance, even though:
- QR reader worked
- Dashboard generation worked  
- Class session row existed
- Student was logged in

## Root Cause
The **fingerprint hash was being regenerated** on each `refreshSession()` call instead of being stored and reused. This caused:
- Device rotation: screen dimensions change → fingerprint changes
- Canvas rendering variations → hash changes
- Browser cache/state differences → hash changes
- Result: Backend couldn't match the fingerprint sent to what was stored in DB

## Solution: Persist Fingerprint Hash

### Before (Broken)
```javascript
const fingerprint = generateInstitutionalFingerprint();
const hash = await hashFingerprint(fingerprint);
// Query sessions with this hash
```
Problem: `hash` is DIFFERENT on each call if device state changed

### After (Fixed)
```javascript
let hash = sessionStorage.getItem('__lab_fingerprint_hash');
if (!hash) {
  const fingerprint = generateInstitutionalFingerprint();
  hash = await hashFingerprint(fingerprint);
  sessionStorage.setItem('__lab_fingerprint_hash', hash); // STORE IT
}
// Query sessions with this SAME hash every time
```
Benefit: Hash never changes unless app is closed/re-opened

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `src/context/SecurityContext.tsx` | Store fingerprint hash in sessionStorage; reuse instead of regenerate | Fixes fingerprint mismatch 401s |
| `src/app/login/page.tsx` | Explicitly store both session ID and fingerprint hash in sessionStorage | Ensures both exists for refreshSession |
| `src/app/api/attendance/submit/route.ts` | Add proactive session renewal + detailed logging | Better diagnostics + edge case handling |
| `src/app/api/student/session/health/route.ts` | **NEW** diagnostic endpoint | Debug session state without changing code |

## New Endpoints

### Session Health Diagnostic
```bash
POST /api/student/session/health
Content-Type: application/json

{
  "temp_session_id": "uuid-from-sessionStorage",
  "fingerprint_hash": "hash-from-sessionStorage"
}
```

**Response** if HEALTHY:
```json
{
  "overall_health": "HEALTHY",
  "checks": {
    "exact_session_found": { "passed": true },
    "session_validity": { "passed": true },
    "fingerprint_validation": { "passed": true },
    "fingerprint_recovery_candidates": { "passed": true }
  }
}
```

**Use this to debug** 401 errors without changing code

## Key Logs to Watch

### During Login
```
[SecurityContext] First-time fingerprint generated and stored: aaaa...bbbb
✅ Session created successfully
✅ Session credentials stored in sessionStorage
```

### During Attendance Scan
```
[SecurityContext] Using stored fingerprint hash: aaaa...bbbb
[SecurityContext] ✅ Found active session via fingerprint lookup
ATTENDANCE_DEBUG: ✅ Session is valid and usable
```

### If Failing
```
ATTENDANCE_DEBUG: Session invalid or expired
- foundSession: false
- recoveryAttempted: false
```

## Testing Steps

1. **Login**: Check logs for "First-time fingerprint"
2. **Health check**: `POST /api/student/session/health` → should return HEALTHY
3. **Navigate**: Check logs show "Using stored fingerprint hash" (not "generated")
4. **Scan**: Attempt attendance → should work

## Database Changes
None. Schema is unchanged. Only the CLIENT fingerprint handling changed.

## Rollback
If needed, revert these 4 files to remove changes:
- SecurityContext.tsx
- attendance/submit/route.ts  
- login/page.tsx
- Remove health/route.ts

## Expected Improvement
- 401 errors from fingerprint mismatch: **ELIMINATED**
- Session recovery: **Improved** (fallback to fingerprint lookup)
- Debugging: **Much easier** (health endpoint + detailed logs)
- Edge cases: **Handled** (auto-renew expiring sessions)

## Questions to Ask Yourself

1. Are logs showing "First-time fingerprint generated" only once after login?
   - ✅ Good: Fingerprint is being stored
   - ❌ Bad: Check sessionStorage persistence

2. Does health endpoint show HEALTHY?
   - ✅ Good: Session is valid in database
   - ❌ Bad: Check specific failed check in response

3. Are logs showing "Using stored fingerprint hash"?
   - ✅ Good: Fingerprint is being reused consistently
   - ❌ Bad: Storage might be cleared between requests

4. Does attendance succeed without 401?
   - ✅ Good: Fixes are working
   - ❌ Bad: Enable ATTENDANCE_DEBUG logs and check the trace
