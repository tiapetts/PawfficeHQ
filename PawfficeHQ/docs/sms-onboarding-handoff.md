# SMS onboarding handoff (paused pending carrier funding)

Branch: `feature/automated-sms-onboarding` / PR #64. **Do not merge or deploy as a complete SMS activation feature.**

## Implemented
- `sms_onboarding_job` migration: one job per submitted onboarding request, tenant-scoped read policy, no browser mutation.
- `process-sms-onboarding` Edge Function: requires `SMS_ONBOARDING_WORKER_SECRET` and service role, validates submitted applications and marks them `validated` or `action_required`. **No Twilio API calls, charges, brand registration, number purchase, or activation.**
- UI: displays queue status without exposing Twilio credentials or implying carrier approval.

## Not implemented / release blockers
1. Secure, idempotent provisioning of a Twilio subaccount (or linking an existing one), including durable external identifiers and secret management. Hauser's Groom Room already has a manually created subaccount: never create a duplicate.
2. ISV/reseller eligibility and correct A2P brand/campaign submission under each customer's legal identity; handle consent, errors, carrier review and status polling.
3. Explicit cost authorization, spending caps, usage enforcement and plan allowances before any paid Twilio operation.
4. Phone-number purchase only after authorization; configure inbound/status webhooks and tenant routing; verify signatures and isolate tenant credentials.
5. Worker scheduling and retry/recovery (the current worker processes queued jobs only; a crash may leave a job in processing).
6. Automated tests for concurrency, validation, RLS, authorization, error recovery and full two-way texting; deployment and production verification.

## Deploying the current validation-only stage
- Apply migration to staging first and verify RLS and existing submissions. Do not apply blindly to production.
- Configure `SMS_ONBOARDING_WORKER_SECRET` securely; set Edge Function JWT verification appropriately for the scheduler authentication approach. Never expose the secret in frontend code.
- Deploy worker to staging only, then invoke with a trusted server-side scheduler. It is not currently scheduled.
- Review checks and migrations before merging.

## Twilio discovery (2026-11-23)
- Existing Grooming Pawffice campaign approved on parent account.
- Hauser's Groom Room: manually created active subaccount, no A2P brand/campaign and no purchased number.
- Console showed $4.50 brand registration; standard vetting $41.50 where applicable; candidate local number $1.15/month. Campaign fees are additional and not yet confirmed.
- Parent available balance was $8.55 at inspection. **Do not register/purchase automatically.**
- Obtain Sarah's permission and required business details before carrier submission; never paste EIN or Twilio Auth Tokens into source control.
