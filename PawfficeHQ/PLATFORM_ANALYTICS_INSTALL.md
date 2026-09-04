# Platform usage analytics activation

After merging this feature, open the Supabase SQL Editor and run:

`supabase/migrations/202609040003_platform_usage_analytics.sql`

The migration creates the first-party activity log and two protected functions. Only authenticated active staff can record their own activity, and only a PawfficeHQ Platform Admin can read the cross-business activity feed.

No Edge Function or new secret is required.

After the production deployment completes, sign into a normal business account, visit a few modules, then sign into Platform Admin and open **Customer activity → Usage analytics**.
