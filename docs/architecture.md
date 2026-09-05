# Architecture

## Layered design

```
Frontend (React)
    ↓ HTTPS
Nginx (reverse proxy)
    ↓
FastAPI routes  (app/**/routes.py)
    ↓
Service layer   (app/**/service.py)   — business logic lives here
    ↓
Repository layer (app/**/repository.py) — SQLAlchemy queries only
    ↓
PostgreSQL
```

Business logic never lives in route handlers. Route handlers only:
validate the request (via Pydantic schemas), call a service method, and
shape the response. Services never construct raw SQL/ORM queries directly
- they call into a repository.

## Backend module layout

```
backend/app/
  core/                  Cross-cutting, shared by every module
    auth/                Login, MFA, sessions, tokens
    users/                User CRUD + Role/Permission repositories
    roles/                Role management service (custom roles)
    permissions/          require_permission() dependency, permission registry, object-level policy hook
    dashboards/            Widget registry (permission-aware)
    audit/                 Business audit log (append-only)
    security/              Security event log (append-only) + password/MFA/token utilities
    notifications/         In-app notifications
    settings/               Environment-driven configuration
  database/               SQLAlchemy Base, async session factory
  integrations/
    storage/                Storage abstraction (local disk today, S3-ready)
  health/                  /health, /ready
  middleware/              CORS, security headers, rate limiting, error handling
  modules/
    finance/               First business module
      categories/          Hierarchical expense categories (soft-delete)
      expenses/             Expense CRUD, versioning, snapshot logic
      approvals/            Centralized expense state machine
      attachments/          Secure file upload/download
      reports/               Dashboard/report aggregation queries
```

## Adding a new module (e.g. Marketing)

1. Create `app/modules/marketing/` with the same shape as `finance/`
   (models.py, repository.py, service.py, schemas.py, routes.py per sub-domain).
2. Add permission constants + seed entries to
   `app/core/permissions/registry.py` (e.g. `marketing.campaign.view`).
3. Register the new router(s) in `app/main.py`.
4. Add an Alembic migration for the new tables (`alembic revision --autogenerate -m "add marketing tables"`).
5. If the module needs dashboard widgets, register them in
   `app/core/dashboards/registry.py` — no core dashboard code changes needed.
6. On the frontend, add `frontend/src/modules/marketing/` mirroring
   `finance/`'s structure, and add nav items to `AppLayout.tsx` gated by
   the new permission constants (add them to `permissions/constants.ts` too).

No existing module's code needs to change. This is the extensibility the
original specification requires (Marketing, Customer Support, HR, Sales,
Operations can all be added the same way).

## Adding a new dashboard widget

Add a `WidgetDef` entry to `app/core/dashboards/registry.py`:

```python
WidgetDef(
    key="marketing.spend_summary",
    title="Ad Spend Summary",
    required_permission=MARKETING_REPORT_VIEW,
    data_endpoint="/api/marketing/reports/summary",
    category="marketing",
)
```

The `/api/dashboards/widgets` endpoint automatically filters by the
current user's permissions - no other backend change is needed. The
frontend widget-rendering component (not yet built beyond the finance
charts in `DashboardPage.tsx`) should fetch `data_endpoint` and render
based on `category`.

## Adding a new permission

Add a constant and a `PermissionDef` entry to
`app/core/permissions/registry.py`. Run the seed script
(`python -m scripts.seed_initial_data`) to insert it into the database
and sync default system roles - existing custom roles are left untouched
(the Admin must explicitly grant the new permission to any custom role
that should have it).

## Adding a new role

Roles are NOT hard-coded. Any user holding `roles.create` can create a
custom role via `POST /api/roles` with an arbitrary name and any
combination of existing permission codes. There is no code change
required to add a role - see `app/core/roles/service.py`.

## Adding a language

The frontend's i18n layer (`frontend/src/i18n/`) is a flat key→string
dictionary per locale. Arabic (`ar.ts`) is authoritative; `en.ts` mirrors
its keys. To add a third language, create `frontend/src/i18n/<locale>.ts`
with the same keys, add it to the `dictionaries` map in
`frontend/src/i18n/index.ts`, and extend the `Locale` type. `translate()`
falls back to Arabic for any missing key, so a partial translation never
breaks the UI.

## Frontend module layout

```
frontend/src/
  app/                 (reserved for app-level composition beyond App.tsx)
  auth/                AuthContext, LoginPage, MfaVerifyForm, ProtectedRoute, tokenStorage
  components/          Shared UI primitives (currently minimal - extend as needed)
  layouts/             AppLayout (permission-filtered sidebar nav)
  permissions/         usePermission hook + permission constants (UI-only, never a security boundary)
  dashboard/           DashboardPage (finance widgets)
  modules/
    finance/
      pages/           ExpensesListPage, ExpenseDetailPage, ExpenseFormPage, CategoriesPage, ReportsPage, UsersPage, RolesPage, AuditLogPage, SecurityLogPage
      hooks/           React Query hooks wrapping financeApi
      services/        financeApi.ts, adminApi.ts, logsApi.ts (all HTTP calls go through these)
      components/      StatusBadge and other finance-specific UI pieces
  i18n/                Arabic/English dictionaries + translate()
  lib/                 apiClient.ts (axios instance with auto token refresh)
```

## Frontend/backend security boundary

The frontend filters navigation and buttons by permission for UX only
(`usePermission`, `useAnyPermission`). This is explicitly NOT a security
boundary — every single backend endpoint independently re-checks
authentication and authorization via `require_permission(...)`
(`app/core/permissions/dependencies.py`), regardless of what the frontend
shows or hides. Bypassing the frontend (e.g. calling the API directly)
grants no additional access.
