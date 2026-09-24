// BookingSession — standalone customer-facing booking + UPI payment service.
//
// Owns nothing about property/booking data itself: it proxies reads (properties,
// availability) and booking creation to the PMS's /api/public/* API (see PMS_API_URL),
// which stays the single source of truth. It owns only the short-lived payment-session
// token that bridges the booking form and the UPI payment page, and the "guest says
// they paid" flag that gets relayed back to the PMS for staff to verify manually.
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const PMS_API_URL = (process.env.PMS_API_URL || '').replace(/\/$/, '');
if (!PMS_API_URL) {
  console.error('FATAL: PMS_API_URL is not set — this service has nothing to book against.');
  process.exit(1);
}

const UPI_ID = process.env.UPI_ID || 'staynestura77@idfcbank';
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'Stay Nestura';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes to complete a manual UPI transfer

// Generous timeout: on Render's free plan the PMS service can be asleep and take
// ~30-60s to cold-start on its first request after being idle.
const pms = axios.create({ baseURL: PMS_API_URL, timeout: 60000 });

// Payment sessions are short-lived and low-stakes (a claim, not a real transaction), so
// an in-memory map is fine — losing them on a restart just means the guest re-submits
// the booking form, no money or data is at risk.
const sessions = new Map();
const genToken = () => crypto.randomBytes(24).toString('base64url');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.json());

const bookingLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many booking requests from this device. Please try again later or contact us directly.' } });
const sessionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please wait a moment and try again.' } });

// Logs enough to tell "PMS is unreachable/asleep" apart from "PMS returned an error" apart
// from "PMS returned something unexpected" — the three failure modes that actually came up
// while first deploying this service, and that a bare 502 to the browser can't distinguish.
const logProxyError = (label, err) => {
  if (err.response) console.error(`${label}: PMS responded ${err.response.status} — ${JSON.stringify(err.response.data)}`);
  else if (err.request) console.error(`${label}: no response from PMS at ${PMS_API_URL} — ${err.message}`);
  else console.error(`${label}: ${err.message}`);
};

// Reports this service's own commit/branch (Render sets these automatically) plus a live
// reachability check against the PMS, so "is BookingSession broken or is PMS broken or are
// they just out of sync" is one curl away instead of a multi-step investigation.
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    system: 'BookingSession',
    commit: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    pms_api_url: PMS_API_URL,
    uptime_seconds: Math.round(process.uptime()),
  };
  try {
    const start = Date.now();
    const { data } = await pms.get('/api/health', { timeout: 10000 });
    health.pms_reachable = true;
    health.pms_latency_ms = Date.now() - start;
    health.pms = data;
  } catch (err) {
    health.pms_reachable = false;
    health.pms_error = err.response ? `HTTP ${err.response.status}` : err.message;
  }
  res.json(health);
});

// --- Proxy reads straight through to the PMS ---
app.get('/api/public/properties', async (req, res) => {
  try {
    const { data } = await pms.get('/api/public/properties');
    res.json(data);
  } catch (err) {
    logProxyError('GET /api/public/properties', err);
    res.status(502).json({ error: 'Could not load properties right now. Please try again shortly.' });
  }
});

app.get('/api/public/properties/:id', async (req, res) => {
  try {
    const { data } = await pms.get(`/api/public/properties/${req.params.id}`);
    res.json(data);
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Not found' });
    logProxyError(`GET /api/public/properties/${req.params.id}`, err);
    res.status(502).json({ error: 'Could not load this property right now. Please try again shortly.' });
  }
});

app.get('/api/public/properties/:id/availability', async (req, res) => {
  try {
    const { data } = await pms.get(`/api/public/properties/${req.params.id}/availability`, { params: req.query });
    res.json(data);
  } catch (err) {
    logProxyError(`GET /api/public/properties/${req.params.id}/availability`, err);
    res.status(502).json({ error: 'Could not load availability right now. Please try again shortly.' });
  }
});

// --- Create booking (proxied to PMS), then hand the browser an opaque payment-session token ---
app.post('/api/public/bookings', bookingLimiter, async (req, res) => {
  try {
    const { data: booking } = await pms.post('/api/public/bookings', req.body);
    const token = genToken();
    sessions.set(token, {
      booking_id: booking.id,
      property_name: booking.property_name,
      check_in: booking.check_in,
      check_out: booking.check_out,
      amount: booking.amount,
      currency: booking.currency || 'INR',
      claimed: false,
      expires_at: Date.now() + SESSION_TTL_MS,
    });
    console.log(`Booking #${booking.id} created (${booking.property_name}, ₹${booking.amount}) — session ${token.slice(0, 8)}...`);
    res.status(201).json({ payment_session_token: token });
  } catch (err) {
    logProxyError('POST /api/public/bookings', err);
    if (err.response) return res.status(err.response.status).json(err.response.data);
    res.status(502).json({ error: 'Could not create your booking right now. Please try again shortly.' });
  }
});

app.get('/api/public/payment-sessions/:token', sessionLimiter, (req, res) => {
  const s = sessions.get(req.params.token);
  if (!s || s.expires_at < Date.now()) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
  res.json({
    property_name: s.property_name,
    check_in: s.check_in,
    check_out: s.check_out,
    amount: s.amount,
    currency: s.currency,
    claimed: s.claimed,
    upi_id: UPI_ID,
    upi_payee_name: UPI_PAYEE_NAME,
  });
});

// Guest clicks "I've Paid" — relay the claim to the PMS so staff see it against the
// booking and can verify the actual UPI transfer before confirming.
app.post('/api/public/payment-sessions/:token/mark-paid', sessionLimiter, async (req, res) => {
  const s = sessions.get(req.params.token);
  if (!s || s.expires_at < Date.now()) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
  try {
    await pms.post(`/api/public/bookings/${s.booking_id}/mark-payment-claimed`);
    s.claimed = true;
    console.log(`Payment claimed for booking #${s.booking_id}`);
    res.json({ status: 'ok' });
  } catch (err) {
    logProxyError(`POST /api/public/payment-sessions/${req.params.token}/mark-paid (booking #${s.booking_id})`, err);
    res.status(502).json({ error: 'Could not record your payment right now. Please try again or contact us directly.' });
  }
});

// --- Serve the React build ---
app.use(express.static(path.join(__dirname, 'frontend', 'build')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`BookingSession running on port ${PORT}`);
  console.log(`Proxying property/booking data to ${PMS_API_URL}`);
});
