# TechTalkHub Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: No path outside explicitly matched collections may ever be read or written.
2. **Identity & Privilege Escalation Guard**: A user creating `/users/{userId}` can ONLY set `role: "student"` and `uid == request.auth.uid`, and can never write `/admins/{userId}` unless already a verified administrator or the bootstrapped admin (`rudovickruben@gmail.com` with `email_verified == true`).
3. **PII Isolation**: Private fields (`email`, `phone`, `country`, `city`) reside in `/users/{userId}/private/{docId}` and are strictly readable/writable only by the owning user or an administrator.
4. **Immutable Ownership & Server Timestamps**: `uid` / `userId` / `createdAt` cannot be modified on update; `createdAt == request.time` on create and `updatedAt == request.time` on update.
5. **Certificate Integrity**: Only verified administrators may create, update, or revoke `/certificates/{certificateId}` records; public callers may only `get` a specific certificate by ID (no unauthenticated `list` scraping, and no PII stored on certificate docs).
6. **Enrollment Relational Integrity & Terminal State Locking**: An enrollment requires an existing `/courses/{courseId}` document, starts at `status: "active"`, and once `status == "completed"` cannot be reverted by non-admin callers.
7. **Volumetric & ID Poisoning Guards**: Every document ID path parameter passes `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars) and every string/list property enforces strict `.size()` limits.

## 2. The "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. **Self-Role Escalation**: Student writes `/users/{uid}` with `{ "uid": uid, "role": "admin", ... }`.
2. **Ghost Field Shadow Update**: Student updates `/users/{uid}` adding `{ "isVerified": true }` alongside allowed fields.
3. **Forged Admin Document**: Non-admin creates `/admins/{uid}` with `{ "uid": uid, "email": "hacker@example.com", "grantedAt": request.time }`.
4. **Email Spoofing Without Verification**: User with `email_verified: false` attempts to write `/users/{uid}` or `/enrollments/{id}`.
5. **PII Snooping**: Authenticated student A calls `get` on `/users/{studentB}/private/info`.
6. **Blanket User List Scraping**: Authenticated student calls `list` on `/users`.
7. **Orphaned Enrollment**: Student creates `/enrollments/e1` referencing nonexistent `courseId: "fake-course-999"`.
8. **Cross-Owner Enrollment Spoof**: Student A creates `/enrollments/e2` with `userId: studentB`.
9. **Terminal State Rollback**: Student updates completed `/enrollments/e1` back to `status: "active"`.
10. **Unauthorized Certificate Forgery**: Student creates `/certificates/TTH-FAKE-2026-123456`.
11. **Type / Resource Poisoning**: User submits `/contactMessages/m1` with a `message` exceeding `2000` characters or `score: "one hundred"` on certificate.
12. **Spoofed Timestamp**: Client creates `/contactMessages/m2` with a backdated `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
