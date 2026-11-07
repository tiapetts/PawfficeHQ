# Client profiles and household checkout

The client name in Clients opens a profile with contact details, SMS consent, deposit settings, and linked animals (including clearly labelled archived pets).

Calendar and appointment-history checkout now review the same client's appointments for the selected date in the browser's local timezone. Choose the appointments to include, review pet/service labels and subtotal, and create a single invoice. Existing invoices are opened rather than merged or recreated. Already-billed, cancelled, no-show, and unconfirmed appointments are not included in a new combined invoice. Separate client records are not automatically treated as a shared household.

Invoice screens and receipts show all linked pets. Appointment history recognises the shared payment; refunds for a shared invoice are handled on the invoice screen. Staff earnings use services across all linked appointments, and rebooking remains available for each appointment.

## Deployment order — database approval required

The migration has **not** been applied to either hosted project. The code must not be deployed before its database migration.

1. Apply `supabase/migrations/20261107024142_household_checkout.sql` to **PawfficeHQ Staging** (`dlxxkfgbffogrsejdinw`) after approval.
2. Verify with synthetic appointments for one owner/two pets: two correctly priced service lines, one invoice, safe retry, both appointments linked, and one manual test payment reflected on both appointment histories. Verify existing single-appointment invoices, receipts, and staff earnings. Do not charge a real card for this test.
3. Run Supabase security advisories and verify anonymous callers cannot invoke checkout RPCs or read links, and another business cannot read/create these invoice links.
4. After approving production deployment, apply the same migration to **PawfficeHQ Production** (`kvplhxmgkgnnrdzuikkm`) before merging the frontend PR.
5. Merge/deploy and check the profile and checkout flow in the live UI. Existing invoices and payments are not combined retroactively.

The migration backfills invoice/appointment associations without changing invoice amounts or payment records. One active invoice link per appointment prevents duplicate billing. Voided invoice links remain as history while allowing a replacement invoice. The legacy single-appointment RPC delegates to the new group-aware checkout so older UI versions cannot create a second invoice for an included appointment.

## Validation

- `npm run check`: unit/component tests, messaging database tests, household checkout database tests, lint, TypeScript build, production build and public entry smoke checks.
- `npm run test:e2e`: existing desktop/mobile public browser smoke tests (CI).
- New local database tests use synthetic data in PGlite and cover totals, pet labels, retry/paid protection, legacy backfill, client/business isolation, RLS, void history and replacements.
- Hosted database/payment integration remains pending the staging approval and verification above.

Restoring the previous frontend is compatible with group invoice lookup, but its old receipt/earnings screens cannot display every linked appointment. Do not remove the association table or revert the single-appointment RPC after group invoices exist.
