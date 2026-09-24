import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, MapPin, Copy } from 'lucide-react';
import { api } from '../lib/api';
import { safeFormat } from '../lib/format';
import LoadingSpinner from '../components/LoadingSpinner';

// Manual UPI payment page — no payment gateway. The guest scans the QR (or pays the
// UPI ID directly) in their own UPI app, then clicks "I've Paid". That click is only a
// claim, not proof of payment: it flags the booking for staff to verify the actual
// transfer and confirm manually in the PMS (see server.js mark-paid endpoint and
// stay-nestura-pms's /api/public/bookings/:id/mark-payment-claimed).
const PaymentPage = () => {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/public/payment-sessions/${token}`)
      .then(res => { setSession(res.data); setClaimed(!!res.data.claimed); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleMarkPaid = async () => {
    setError('');
    setClaiming(true);
    try {
      await api.post(`/public/payment-sessions/${token}/mark-paid`);
      setClaimed(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record your payment. Please try again or contact us directly.');
    } finally {
      setClaiming(false);
    }
  };

  const copyUpiId = () => {
    if (!session?.upi_id) return;
    navigator.clipboard?.writeText(session.upi_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  if (loading) return <LoadingSpinner />;

  if (notFound || !session) {
    return (
      <div className="public-booking-page">
        <div className="card" style={{ padding: '24px' }}>
          <p>Payment link not found or no longer valid.</p>
        </div>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="public-booking-page">
        <div className="card payment-result-card">
          <CheckCircle size={48} color="#10b981" />
          <h2>Thanks — Payment Noted!</h2>
          <p>We've received your payment confirmation for <strong>{session.property_name}</strong>. Our team will verify the transfer and confirm your booking shortly.</p>
        </div>
      </div>
    );
  }

  const amount = session.amount || 0;
  const upiLink = `upi://pay?pa=${encodeURIComponent(session.upi_id)}&pn=${encodeURIComponent(session.upi_payee_name)}&am=${amount}&cu=${session.currency || 'INR'}&tn=${encodeURIComponent(`Stay Nestura booking ${token.slice(0, 8)}`)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiLink)}`;

  return (
    <div className="public-booking-page">
      <div className="public-booking-header">
        <h1>Complete Your Payment</h1>
        <p><MapPin size={14} /> {session.property_name}</p>
      </div>

      <div className="card payment-summary-card">
        <div className="payment-summary-row">
          <span>Check-in</span><span>{safeFormat(session.check_in, 'MMM dd, yyyy')}</span>
        </div>
        <div className="payment-summary-row">
          <span>Check-out</span><span>{safeFormat(session.check_out, 'MMM dd, yyyy')}</span>
        </div>
        <div className="payment-summary-row total">
          <span>Amount Due</span><span>₹{amount.toLocaleString()}</span>
        </div>

        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <img src={qrSrc} alt="UPI payment QR code" width={220} height={220} style={{ borderRadius: '8px' }} />
          <p style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>Scan with any UPI app to pay ₹{amount.toLocaleString()}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '6px' }}>
            <span style={{ fontWeight: 600 }}>{session.upi_id}</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={copyUpiId} title="Copy UPI ID">
              <Copy size={14} />
            </button>
            {copied && <span style={{ fontSize: '12px', color: '#10b981' }}>Copied!</span>}
          </div>
        </div>

        {error && <div className="availability-indicator conflict"><AlertCircle size={16} /> {error}</div>}

        <button type="button" className="btn btn-primary" disabled={claiming} style={{ width: '100%', marginTop: '10px' }} onClick={handleMarkPaid}>
          {claiming ? 'Recording...' : "I've Paid"}
        </button>
        <div className="payment-security-note">Only click this after you've completed the transfer. Our team verifies each payment before confirming your booking.</div>
      </div>
    </div>
  );
};

export default PaymentPage;
