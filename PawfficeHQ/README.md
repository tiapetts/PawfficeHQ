# PawfficeHQ

PawfficeHQ is an all-in-one business management platform for pet-care professionals. It brings client and pet records, scheduling, service delivery, payments, messaging, staff operations, and business reporting into one modular application.

The platform is designed for grooming salons, pet sitters, boarding and daycare facilities, and veterinary teams. Businesses can enable only the modules they need while managing everything from a shared dashboard.

## Features

### Client and pet management

- Create a client and one or more pets in a single household workflow
- Search, edit, archive, restore, import, and export client and pet records
- Store profile photos, contact details, care notes, and SMS consent
- Track vaccination requirements, expiration dates, proof documents, and alerts
- Maintain grooming report cards and report-card history

### Scheduling and appointments

- Weekly and mobile-friendly grooming calendar
- Create, reschedule, and manage appointments
- Assign pets, services, and staff members
- Prevent scheduling conflicts with optional double-booking controls
- Track requested, confirmed, checked-in, in-progress, ready-for-pickup, completed, cancelled, and no-show statuses
- View searchable appointment history

### Text and email communication

- Send ready-for-pickup notifications by email, text, or both
- Send configurable appointment reminders 24 or 48 hours in advance
- Optionally send a second reminder one hour before an appointment
- Allow clients to reply `C` to confirm their appointment
- Record confirmation status and prevent duplicate automatic reminders
- Enforce stored SMS consent and monthly plan limits

### Grooming operations

- Create and manage grooming services, prices, and durations
- Generate editable pet report cards
- Track service history and staff assignments
- Create invoices directly from appointments

### Pet sitting

- Manage bookings and household care plans
- Record home-entry, emergency, medication, and care instructions
- Log individual visits with check-in and check-out times
- Create searchable visit reports with notes and photos
- Use a dedicated pet-sitting calendar

### Boarding and daycare

- Manage reservations, lodging spaces, capacity, and occupancy
- Support boarding and daycare pricing models
- Check pets in and out and undo accidental checkouts
- Record feeding, medication, activity, potty, water, and general care logs
- Generate invoices based on nights or days of service
- Use a dedicated stay calendar

### Billing and payments

- Create appointment-based or standalone invoices
- Support walk-in customers without calendar appointments
- Record cash, check, and gift-card payments
- Process online payments and refunds through Stripe or Square
- Connect each business to its own Square seller account
- Track invoice, payment, and refund statuses

### Staff and business management

- Invite and manage staff accounts
- Assign appointments and services to staff
- Track staff revenue and tip allocations
- Configure branding, colors, business hours, scheduling rules, and notifications
- Enable modules per business with controlled access requests
- Support trials, subscriptions, complimentary access, and plan limits
- Provide a read-only platform-admin support view

## Technology

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Supabase Postgres, Authentication, Row Level Security, Storage, and Edge Functions
- **Payments:** Stripe and Square
- **Messaging:** Twilio SMS and Resend email
- **App support:** Progressive Web App service worker and responsive layouts

## Repository layout

The application is located inside the repository's `PawfficeHQ` directory:

```text
PawfficeHQ/
├── public/                 Static assets
├── src/
│   ├── components/         Application modules and UI
│   └── lib/                Shared client configuration
├── supabase/
│   ├── functions/          Supabase Edge Functions
│   └── migrations/         Database migrations
├── package.json
└── vite.config.ts
```

## Local development

### Prerequisites

- Node.js 20 or later
- npm
- A Supabase project
- Supabase CLI for migrations and Edge Function deployment

### Installation

```bash
git clone https://github.com/tiapetts/PawfficeHQ.git
cd PawfficeHQ/PawfficeHQ
npm install
```

Create a `.env.local` file in the inner `PawfficeHQ` directory:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
```

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Supabase setup

Link the local project to Supabase:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Apply migrations in chronological order from `supabase/migrations`. For a new development project, the Supabase CLI can apply pending migrations with:

```bash
npx supabase db push
```

Deploy an Edge Function with:

```bash
npx supabase functions deploy FUNCTION_NAME
```

Webhook functions that authenticate provider signatures internally may require `--no-verify-jwt`. Review the function and its installation notes before deployment.

## Server-side configuration

PawfficeHQ integrations rely on secrets stored in Supabase Edge Function secrets. Depending on the features being deployed, these include credentials for:

- Stripe subscriptions and connected payments
- Square OAuth, checkout, payments, refunds, and webhooks
- Twilio SMS delivery
- Resend email delivery
- Web Push/VAPID notifications
- Appointment-reminder scheduling and Twilio reply verification

Never commit secret keys, access tokens, service-role keys, webhook secrets, or production credentials to GitHub. Use Supabase secrets and local environment files excluded by `.gitignore`.

Appointment reminder deployment details are documented in [`APPOINTMENT_REMINDERS_INSTALL.md`](APPOINTMENT_REMINDERS_INSTALL.md).

## Database security

PawfficeHQ is multi-tenant. Business-owned records include a `business_id`, and Supabase Row Level Security policies restrict access to authorized business staff. Server-side payment, subscription, messaging, and administrative operations are handled through protected database functions or Edge Functions.

When adding a new tenant-owned table:

1. Include and index `business_id`.
2. Enable Row Level Security.
3. Add business-membership and subscription-access policies.
4. Validate business ownership again in privileged server-side operations.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build |
| `npm run lint` | Run ESLint across the project |
| `npm run preview` | Preview the production build locally |

## Project status

PawfficeHQ is under active development. Core grooming, pet-sitting, boarding/daycare, client management, invoicing, subscriptions, payment processing, messaging, and appointment-reminder workflows are implemented. Veterinary-specific workflows and additional mobile refinements remain in development.

## Author

Created by [Tia Petts](https://github.com/tiapetts).
