# Security Model

## Authentication

- **Password hashing**: Argon2id (`app/core/security/passwords.py`), tuned
  parameters (`time_cost=3, memory_cost=64MB, parallelism=2`).
- **Password policy**: configurable minimum length + character-class
  requirements (`app/core/settings/config.py` `PASSWORD_*` settings),
  enforced on registration, password change, and password reset.
- **Sessions**: short-lived JWT access tokens (default 15 min) + opaque,
  hashed refresh tokens (default 7 days) stored in the `sessions` table.
  Only the refresh token's SHA-256 hash is persisted — a database dump
  alone does not yield usable tokens. Logout and "logout everywhere"
  revoke session rows, which is checked on every access-token validation
  (`app/core/auth/dependencies.py get_current_user`), so revocation takes
  effect immediately despite stateless access tokens.
- **MFA**: TOTP (RFC 6238) via `pyotp`. Secrets are encrypted at rest with
  Fernet, keyed from `JWT_SECRET_KEY` (`app/core/security/mfa.py`).
  Recovery codes are Argon2-hashed, single-use. MFA is currently mandatory
  for the Owner, Admin, and Finance Manager roles by name
  (`AuthService.MFA_MANDATORY_ROLES`); making this fully role-configurable
  via a DB flag (`mfa_enforced`, already present as a per-user column) is
  the natural next step if per-role enforcement is needed.
- **Lockout**: after `MAX_FAILED_LOGIN_ATTEMPTS` (default 5) consecutive
  failures, the account locks for `LOCKOUT_DURATION_MINUTES` (default 15).
- **Password reset**: never reveals whether an email exists — the
  `/auth/password/reset-request` endpoint returns `204` identically
  whether or not the account is found (`AuthService.request_password_reset`).

## Authorization (RBAC)

```
User ──(user_roles)──> Role ──(role_permissions)──> Permission
```

- Permissions are plain strings in dot notation
  (`finance.expense.approve`), defined once in
  `app/core/permissions/registry.py`.
- **No backend code ever branches on a role name** for authorization
  decisions — every protected endpoint depends on
  `require_permission("some.permission.code")`
  (`app/core/permissions/dependencies.py`). This is what makes custom
  roles possible: an Admin can create an arbitrary role with any
  permission combination via `POST /api/roles`, and it works immediately
  everywhere that permission is checked.
- **Function-level vs object-level authorization**:
  `require_permission()` only proves the user holds a permission in
  general. Object-level checks (e.g. "can THIS user access THIS specific
  expense") go through `app/core/permissions/object_policy.py`
  `authorize_object_access()`. The initial release has no per-object
  ownership restriction (any holder of `finance.expense.view` can view
  any expense) — this hook exists so a future restriction (e.g.
  department-scoped visibility) can be added in one place without
  touching route handlers.
- **The frontend is never the security boundary.** `usePermission()` in
  the React app only hides/shows UI — every backend endpoint
  independently re-verifies authentication and authorization regardless
  of what the client sends or omits.

## Audit log vs. security log

Two separate, append-only tables, each with a single service that is the
only way application code writes to it:

| | `audit_logs` (`AuditService`) | `security_logs` (`SecurityLogService`) |
|---|---|---|
| Purpose | Business actions | Authentication/security events |
| Examples | expense created/approved/restored, role modified | login success/failure, MFA failure, lockout, authorization failure |
| Who can view | `audit.view` permission | `security_logs.view` permission |

Neither table exposes an update or delete method anywhere in the service
layer, and the initial migration additionally revokes `UPDATE`/`DELETE`
grants on both tables (plus `expense_versions` and `expense_approvals`)
for the application's database role, where that role exists.

## File storage (attachments)

- Uploaded files are never stored under a path served by Nginx or any
  static file mechanism — there is no public or predictable URL for an
  attachment.
- The only way to retrieve a file is
  `GET /api/finance/expenses/{expense_id}/attachments/{attachment_id}`,
  which independently re-checks authentication and the
  `finance.attachment.download` permission before streaming the file
  (`app/modules/finance/attachments/routes.py`).
- `storage_key` (the internal filename) is always a server-generated
  random token (`uuid4().hex`) — never derived from the user-supplied
  filename. This eliminates path traversal and filename-collision risk at
  the source. The `LocalStorageBackend` additionally re-validates that
  any resolved path stays inside the configured storage root.
- Uploads are validated against an allowlist of content types AND the
  first bytes of the file are checked against known magic-byte signatures
  for that type (`app/modules/finance/attachments/service.py
  _sniff_content_type`), so a file claiming to be a PDF but containing
  arbitrary bytes is rejected — the declared `Content-Type` header alone
  is never trusted.
- File size is capped server-side (`MAX_UPLOAD_SIZE_MB`, default 15MB)
  before the file is written to storage.
- The storage layer is abstracted (`app/integrations/storage/base.py`)
  so moving from local disk to S3-compatible object storage later means
  implementing one new class and changing `STORAGE_BACKEND`, without
  touching any finance business logic.

## API security

- **CORS**: strict allowlist from `CORS_ORIGINS`, never a wildcard.
- **Rate limiting**: global default (`GLOBAL_RATE_LIMIT`, default
  100/min) plus a stricter limit specifically on `/auth/login` and
  `/auth/mfa/verify` (`LOGIN_RATE_LIMIT`, default 10/min) to blunt
  credential-stuffing attempts.
- **Security headers** on every response: `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security` (`app/middleware/security.py`).
- **Centralized error handling**: production responses never include
  stack traces, database error details, or filesystem paths — every
  unhandled exception is logged server-side with a generated `error_id`
  and the client receives only a generic message plus that ID for support
  correlation (`app/middleware/error_handlers.py`).
- **Structured logging**: every request is logged with a correlation ID
  (`X-Request-ID`, generated if not supplied), method, path, status,
  duration, and user ID when authenticated. Passwords, tokens, MFA
  secrets, and recovery codes are never logged.

## Secrets

- No secret is hard-coded anywhere in the codebase. Every credential
  comes from environment variables (`backend/.env`, never committed —
  see `backend/.env.example` for the full list with placeholders).
- Frontend environment variables (`VITE_*`) are treated as public by
  convention — never place a secret behind a `VITE_` prefix.
