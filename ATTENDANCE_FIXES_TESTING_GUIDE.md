# Attendance System 401 Fix - Testing Guide

## Summary of Changes

This document guides you through testing the attendance system fixes. The root cause was **fingerprint hash inconsistency** - the stored fingerprint could change between login and scan due to device state changes, causing backend rejection.

### Key Fixes Made:
1. **Fingerprint persistence** - Now stored in sessionStorage and reused instead of regenerated
2. **Diagnostic endpoint** - New `/api/student/session/health` for debugging
3. **Enhanced logging** - Detailed console logs at each authentication step
4. **Proactive renewal** - Sessions auto-extend if within 30 minutes of expiry

---

## Testing Workflow

### Phase 1: Pre-Login Checks

1. **Clear browser data** (to start fresh):
   - Open DevTools → Application tab
   - Clear all SessionStorage and LocalStorage
   - Close all tabs for this app

2. **Open DevTools Console** (F12 → Console tab)
   - You'll monitor logs here throughout testing

### Phase 2: Login with Diagnostics

3. **Navigate to login page** (`/login`)

4. **Enter student credentials** and submit

5. **Check Console Logs** - Look for these patterns:
   ```
   First-time fingerprint generated and stored: aaaa...bbbb
   Session credentials stored in sessionStorage
   ✅ Session created successfully
   ```
   **Expected**: Should see the fingerprint being generated ONCE and stored.

6. **Verify SessionStorage** (DevTools → Application → SessionStorage):
   - Should see `__lab_sess_id` with a UUID
   - Should see `__lab_fingerprint_hash` with a 64-character hex string

### Phase 3: Session Verification

7. **Check Current Session Health**:
   ```javascript
   // In browser console, run:
   fetch('/api/student/session/health', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       temp_session_id: sessionStorage.getItem('__lab_sess_id'),
       fingerprint_hash: sessionStorage.getItem('__lab_fingerprint_hash')
     })
   }).then(r => r.json()).then(d => console.log('Health:', JSON.stringify(d, null, 2)))
   ```

8. **Expected Health Response**:
   ```json
   {
     "overall_health": "HEALTHY",
     "checks": {
       "exact_session_found": { "passed": true },
       "session_validity": { "passed": true },
       "fingerprint_validation": { "passed": true }
     }
   }
   ```
   
   **If NOT healthy**: Note the specific field that failed and check the error details.

### Phase 4: Site Navigation (Session Persistence)

9. **Navigate around the student app** (`/student/attendance`, `/student/labs`, etc.)

10. **Check Console** - Look for:
    ```
    [SecurityContext] Using stored fingerprint hash: aaaa...bbbb
    [SecurityContext] Persisted session found and valid
    ✅ Fingerprint matches, reusing persisted session
    ```
    **Expected**: Should NOT generate a new fingerprint; should reuse the stored one.

11. **Re-run Health Check** from Step 7
    **Expected**: Should still be HEALTHY.

### Phase 5: Scanner Attendance Flow

12. **Navigate to Attendance Page** (`/student/attendance`)

13. **Select a Lab** with an active class session

14. **Beacon Connection** - Wait for "BEACON_LOCKED" status

15. **Open QR Scanner** or upload a QR image with attendance code

16. **Check Console During Scan**:
    ```
    [SecurityContext] refreshSession called
    [SecurityContext] Using stored fingerprint hash
    [SecurityContext] ✅ Found active session via fingerprint lookup
    
    ATTENDANCE_DEBUG: Received Handshake
    ATTENDANCE_DEBUG: ✅ Session is valid and usable
    ATTENDANCE_DEBUG: Attended successfully
    ```
    **Expected**: Session should be found and attendance should succeed.

### Phase 6: Edge Cases

#### Test 6A: Session Refresh After Long Idle
17. Keep the app open for 1 hour without activity
18. Attempt attendance submission
19. **Check Console**: Should show session still valid OR renewed gracefully

#### Test 6B: Device Rotation (Mobile)
20. On mobile device, rotate screen 90 degrees
21. Immediately attempt attendance
22. **Expected**: Should NOT fail (fingerprint hash is stored, not regenerated)

#### Test 6C: Network Disconnect/Reconnect
23. Disconnect network → Reconnect
24. Attempt attendance
25. **Expected**: Should recover via fingerprint lookup if exact session ID mismatches

### Phase 7: Error Scenarios (Intentional Failures)

#### Test 7A: Fingerprint Hash Mismatch
26. In Console, modify sessionStorage:
    ```javascript
    sessionStorage.setItem('__lab_fingerprint_hash', 'corrupted_hash_abc123')
    ```
27. Attempt attendance
28. **Expected**: Health check should show UNHEALTHY, attendance should return 401 with detailed debug info

#### Test 7B: Missing Session ID
29. In Console:
    ```javascript
    sessionStorage.removeItem('__lab_sess_id')
    ```
30. Attempt attendance
31. **Expected**: Should create a new session, attendance should still work

#### Test 7C: Expired Session
32. In Console:
    ```javascript
    sessionStorage.removeItem('__lab_sess_id')
    sessionStorage.removeItem('__lab_fingerprint_hash')
    ```
    Then wait 4+ hours OR manually check database for expired sessions
33. Attempt attendance
34. **Expected**: Should fail with "Session expired" and automatically redirect to login


---

## Debugging Checklist

### If Attendance Still Fails with 401:

1. **Run health check** (Step 7):
   - Check `overall_health` value
   - Note which specific check failed
   
2. **Check browser console** for these logs:
   - `[SecurityContext] refreshSession called` - Session refresh initiated
   - `ATTENDANCE_DEBUG` messages - Backend validation details
   
3. **Check SessionStorage** - Verify both values exist:
   - `__lab_sess_id` (not empty)
   - `__lab_fingerprint_hash` (64 chars)

4. **Verify database** - Check Supabase:
   - Does the session exist in `public.sessions` table?
   - Is `is_active = true`?
   - Is `expires_at` in the future?
   - Does `fingerprint_hash` match what browser is sending?

5. **Check logs for this pattern**:
   ```
   ATTENDANCE_DEBUG: Session invalid or expired
   - hasError: false
   - foundSession: false
   - recoveryAttempted: false
   ```
   This means the exact session ID wasn't found AND no fingerprint fallback was found.

### If Fingerprint Mismatch:

1. Check that `generateInstitutionalFingerprint()` is deterministic
2. Verify no device state changed (rotation, screen size)
3. Check DevTools → Application → SessionStorage for the stored hash
4. Compare console logs from login vs. scan attempt

### If Network Issues:

1. Verify attendance endpoint is reachable
2. Check browser network tab for request/response details
3. Look for CORS errors (cross-origin)
4. Check that headers are being sent:
   - `x-session-id`
   - `x-fingerprint`

---

## Success Criteria

✅ Login succeeds and stores both `__lab_sess_id` and `__lab_fingerprint_hash`
✅ Health endpoint returns HEALTHY after login
✅ Navigation preserves session without regenerating fingerprint
✅ Attendance scan submits without 401 error
✅ Detailed logs show exact flow in console
✅ Session auto-extends if near expiry
✅ Fingerprint mismatch is detected and logged clearly

---

## Rolling Back (If Issues Occur)

If the fixes cause unexpected issues:

1. Revert SecurityContext.tsx changes
2. Revert attendance/submit/route.ts changes
3. Remove health endpoint
4. Revert login/page.tsx changes
5. Stay on the previous working version

The database schema was not changed, so no migration revert needed.
