# BookingSession

Customer-facing direct-booking + UPI payment site for Stay Nestura. Deliberately
separate from the [stay-nestura-pms](https://github.com/sagarphotodrive/stay-nestura-pms)
admin app — this service has no login and no admin data of its own.

## How it fits together

- **stay-nestura-pms** owns properties, availability and bookings, and exposes a small
  public API (`/api/public/*`) for reading them and creating a booking.
- **BookingSession** (this repo) is the guest-facing site: a booking form, then a UPI
  QR/payment page. It proxies property/availability reads and booking creation straight
  through to the PMS's public API (`PMS_API_URL`) — it has no database of its own.
- Payment is **manual UPI**, not a gateway: the guest scans a QR (or pays the UPI ID
  directly) in their own UPI app, then clicks "I've Paid". That click only flags the
  booking — it calls back into the PMS (`POST /api/public/bookings/:id/mark-payment-claimed`)
  so staff can verify the actual transfer and confirm the booking from the PMS's admin
  Bookings page, same as any other pending request.

## Environment variables

```env
PORT=5001
PMS_API_URL=https://stay-nestura-pms.onrender.com   # required — no trailing slash
UPI_ID=staynestura77@idfcbank
UPI_PAYEE_NAME=Stay Nestura
```

## Running locally

```bash
npm install
cd frontend && npm install && cd ..
PMS_API_URL=http://localhost:5000 npm run dev
```

The React app is built into `frontend/build` and served by this Express server at `/`.

## Deploying

See `render.yaml`. Point `PMS_API_URL` at the deployed PMS service's URL. Because both
services can spin down on Render's free plan after 15 minutes idle, keep them warm with
an external uptime pinger (e.g. cron-job.org or UptimeRobot) hitting both URLs every
~10 minutes — otherwise the first request after idle can take 30-60s to wake the PMS.
