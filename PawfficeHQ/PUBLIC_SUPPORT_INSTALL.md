# Public support form activation

After this branch is merged, run the following from the `PawfficeHQ` project folder.

## 1. Apply the database migration

Open the Supabase SQL Editor, paste the contents of:

`supabase/migrations/202609040002_public_support_requests.sql`

Run it once. A successful run may report `Success. No rows returned`.

## 2. Deploy the public form function

```powershell
npx supabase functions deploy submit-support-request --no-verify-jwt
```

The `--no-verify-jwt` flag is required because people must be able to contact PawfficeHQ before signing in. The function does not expose database credentials; it validates fields, uses a honeypot, limits each network address to five requests per hour, and writes through the server-side service role.

## 3. Verify the complete flow

1. Open `https://pawfficehq.com/contact.html` after the production deployment finishes.
2. Submit a test request.
3. Sign in to the PawfficeHQ Platform Admin dashboard.
4. Confirm the request appears in **Customer support → Support inbox**.
5. Test **Start working**, **Mark resolved**, and **Reopen**.
