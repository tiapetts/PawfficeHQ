# PawfficeHQ reliability foundation

Every pull request and update to `master` must pass ESLint, unit tests, the production build, and a built-artifact smoke test. Run the complete gate locally with `npm run check`.

## Current lint budget

The repository inherited 41 React hook, hot-reload, generated-markup, and TypeScript-comment warnings. CI fixes that budget at 41: introducing another warning fails the gate. As warnings are corrected, lower `--max-warnings` in `package.json` so the improvement cannot regress.

## Next milestones

- Production error monitoring is integrated; finish the Sentry project and alert configuration in Vercel/Sentry.
- Add browser tests for sign-in, appointment creation, checkout, and rebooking.
- Exercise database restores and document recovery targets.
- Add tenant-isolation and role-permission regression tests.
- Measure API latency and failed background jobs from the admin dashboard.
