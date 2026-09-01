# PawfficeHQ

**One workspace for the business of pet care.**

PawfficeHQ is a modular SaaS platform for grooming salons, pet sitters, boarding and daycare facilities, and veterinary teams. It combines client and pet records, calendars, care workflows, communication, payments, staffing, and reporting in one responsive application.

## What PawfficeHQ can do

- Manage searchable client households, pet profiles, photos, vaccinations, and care history
- Schedule grooming appointments with staff and service assignments
- Send ready-for-pickup messages and automatic appointment reminders by text
- Let clients confirm appointments by replying `C`
- Create grooming report cards and searchable visit histories
- Manage pet-sitting bookings, care plans, visits, photos, and reports
- Run boarding and daycare reservations, occupancy, care logs, check-in, and checkout
- Create appointment-based or standalone invoices for scheduled and walk-in clients
- Accept Stripe, Square, cash, check, and gift-card payments
- Process refunds and allocate staff tips and earnings
- Configure business branding, hours, modules, notifications, subscriptions, and access

## Built with

- React 19, TypeScript, and Vite
- Supabase Postgres, Authentication, Row Level Security, Storage, and Edge Functions
- Stripe and Square for payments
- Twilio for SMS
- Resend for email
- Progressive Web App support and responsive layouts

## Modules

| Module | Highlights |
| --- | --- |
| Grooming | Calendar, services, report cards, appointment history, invoicing |
| Pet sitting | Bookings, care plans, visit logs, photos, reports, dedicated calendar |
| Boarding & daycare | Reservations, spaces, occupancy, care logs, billing, stay calendar |
| Veterinary | Module access foundation with veterinary workflows in active development |

## Project status

PawfficeHQ is under active development. Its core grooming, pet-sitting, boarding/daycare, client management, invoicing, subscription, payment, messaging, and appointment-reminder workflows are implemented.

## Documentation

The application source is in the [`PawfficeHQ`](PawfficeHQ) directory.

See the [complete development and deployment guide](PawfficeHQ/README.md) for:

- Local installation
- Environment variables
- Supabase migrations and Edge Functions
- Integration configuration
- Multi-tenant security guidance
- Available npm scripts

Appointment reminder deployment details are available in [`APPOINTMENT_REMINDERS_INSTALL.md`](PawfficeHQ/APPOINTMENT_REMINDERS_INSTALL.md).

## Author

Created by [Tia Petts](https://github.com/tiapetts).
