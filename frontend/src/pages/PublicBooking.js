import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { computeNights } from '../lib/format';
import { isPhoneValid } from '../lib/phone';
import PhoneInput from '../components/PhoneInput';
import LoadingSpinner from '../components/LoadingSpinner';

const todayStr = () => new Date().toISOString().split('T')[0];
const emptyForm = { check_in: '', check_out: '', adults: 2, children: 0, first_name: '', last_name: '', phone: '', email: '', special_requests: '' };

// Public, no-login booking page — the entry point of this standalone booking+payment
// service. Talks to the PMS's /api/public/* endpoints (proxied by this app's own
// server.js) for property/availability data and to create the booking itself.
const PublicBooking = () => {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [unavailable, setUnavailable] = useState({ bookedRanges: [], blockedDates: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    if (!propertyId) {
      api.get('/public/properties').then(res => setProperties(res.data || [])).catch(() => {}).finally(() => setLoading(false));
      return;
    }
    api.get(`/public/properties/${propertyId}`)
      .then(res => setProperty(res.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    const start = todayStr();
    const end = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    api.get(`/public/properties/${propertyId}/availability`, { params: { start, end } })
      .then(res => setUnavailable(res.data || { bookedRanges: [], blockedDates: [] }))
      .catch(() => {});
  }, [propertyId]);

  const nights = computeNights(form.check_in, form.check_out);
  const total = property ? nights * (property.base_price || 0) : 0;
  const datesValid = !!(form.check_in && form.check_out && form.check_in < form.check_out);
  const datesUnavailable = datesValid && (
    unavailable.bookedRanges.some(r => form.check_in < r.check_out && form.check_out > r.check_in) ||
    unavailable.blockedDates.some(d => d >= form.check_in && d < form.check_out)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!datesValid) { setError('Please select a valid check-in and check-out date.'); return; }
    if (datesUnavailable) { setError('These dates are not available. Please pick different dates.'); return; }
    if (!isPhoneValid(form.phone)) { setError('Please enter a valid phone number.'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/public/bookings', {
        property_id: property.id,
        check_in: form.check_in, check_out: form.check_out,
        adults: parseInt(form.adults) || 1, children: parseInt(form.children) || 0,
        first_name: form.first_name, last_name: form.last_name, phone: form.phone, email: form.email,
        special_requests: form.special_requests,
      });
      // The booking is created as 'pending' server-side and only confirmed once
      // payment is verified — hand off to the payment page now via its opaque
      // session token (never the raw booking id/amount in the URL).
      navigate(`/pay/${res.data.payment_session_token}`);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!propertyId) {
    return (
      <div className="public-booking-page">
        <div className="public-booking-header">
          <h1>Stay Nestura</h1>
          <p>Book directly with us.</p>
        </div>
        <div className="public-property-grid">
          {properties.map(p => (
            <div key={p.id} className="public-property-card" onClick={() => navigate(`/${p.id}`)}>
              <h3>{p.name}</h3>
              <p className="public-property-location"><MapPin size={14} /> {p.city}, {p.state}</p>
              <p className="public-property-price">₹{(p.base_price || 0).toLocaleString()} / night</p>
              <button type="button" className="btn btn-primary">Book Now</button>
            </div>
          ))}
          {properties.length === 0 && <p>No properties available right now.</p>}
        </div>
      </div>
    );
  }

  if (notFound || !property) {
    return (
      <div className="public-booking-page">
        <div className="card" style={{ padding: '24px' }}>
          <p>Property not found.</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>See all properties</button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-booking-page">
      <button type="button" className="public-booking-back" onClick={() => navigate('/')}><ArrowLeft size={16} /> All properties</button>
      <div className="public-booking-header">
        <h1>{property.name}</h1>
        <p><MapPin size={14} /> {property.address}, {property.city}, {property.state}</p>
        {property.amenities?.length > 0 && (
          <div className="public-property-amenities">
            {property.amenities.map(a => <span key={a} className="expense-cat-badge">{a}</span>)}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="card public-booking-form">
        <div className="form-row">
          <div className="form-group"><label>Check-in *</label><input required type="date" min={todayStr()} value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} /></div>
          <div className="form-group"><label>Check-out *</label><input required type="date" min={form.check_in || todayStr()} value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} /></div>
        </div>

        {datesValid && (
          <div className={`availability-indicator ${datesUnavailable ? 'conflict' : 'available'}`}>
            {datesUnavailable
              ? <><AlertCircle size={16} /> These dates aren't available.</>
              : <><CheckCircle size={16} /> {nights} night{nights > 1 ? 's' : ''} — ₹{total.toLocaleString()} total</>}
          </div>
        )}

        <div className="form-row">
          <div className="form-group"><label>Adults</label><input type="number" min="1" value={form.adults} onChange={e => setForm({ ...form, adults: e.target.value })} /></div>
          <div className="form-group"><label>Children</label><input type="number" min="0" value={form.children} onChange={e => setForm({ ...form, children: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>First Name *</label><input required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
          <div className="form-group"><label>Last Name</label><input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Phone *</label><PhoneInput required value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="Mobile number" /></div>
        <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="form-group"><label>Special Requests</label><textarea rows="2" value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} /></div>

        <div className="public-booking-payment-notice">
          Payment is required to confirm this booking. After you submit, you'll be redirected to a secure payment page to pay the amount below.
        </div>

        {error && <div className="availability-indicator conflict"><AlertCircle size={16} /> {error}</div>}

        <button type="submit" className="btn btn-primary" disabled={submitting || !datesValid || datesUnavailable} style={{ width: '100%' }}>
          {submitting ? 'Submitting...' : `Continue to Payment${total ? ` — ₹${total.toLocaleString()}` : ''}`}
        </button>
      </form>
    </div>
  );
};

export default PublicBooking;
