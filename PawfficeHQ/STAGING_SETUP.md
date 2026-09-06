# PawfficeHQ staging environment

PawfficeHQ staging is an isolated copy of the production schema with synthetic
test data only. It must never use production customer records, live payment
credentials, or production messaging credentials.

## Safety boundary

- Production Supabase project: never bootstrap, reset, or seed it.
- Staging Supabase project: schema snapshot and synthetic test records only.
- Vercel Production variables continue to point to production.
- Vercel Preview variables point to staging.
- The application refuses to start if staging points to the production project,
  or if `pawfficehq.com` points to the staging project.
- Stripe and Square must use test or sandbox credentials in staging.
- Email and SMS must remain disabled until restricted test recipients are set.

## Initial database bootstrap

The repository's historical migrations begin after PawfficeHQ's original core
tables were created. Generate a private schema-only snapshot from production
for the first staging setup. The generated snapshot is ignored by Git and must
not contain production table rows or credentials.

```powershell
npx supabase db dump --linked --schema public -f production-schema.sql
```

1. Open the new **PawfficeHQ Staging** project in Supabase.
2. Open **SQL Editor** and create a new query.
3. Load or paste the privately generated `production-schema.sql`.
4. Confirm the selected project is staging, then run the query once.
5. Do not run this snapshot against production.

After the snapshot succeeds, record the existing migration versions as applied
before using the normal migration workflow. This prevents older feature
migrations from being replayed over the current snapshot.

## Vercel Preview configuration

Preview deployments require staging values for:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_ENV=staging`

Production values must not be copied into Preview. Payment, messaging, and
server-side secrets are configured separately after the database boundary has
been verified.
