import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PublicBooking from './pages/PublicBooking';
import PaymentPage from './pages/PaymentPage';

// Standalone customer-facing booking + payment app. No admin login, no PMS UI —
// just the booking form and the UPI payment hand-off. Property/availability data and
// booking creation go through the PMS's /api/public/* endpoints, proxied by this app's
// own server.js (see server.js for the payment-session + UPI QR side, which lives
// entirely in this service).
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<PublicBooking />} />
        <Route path="/:propertyId" element={<PublicBooking />} />
        <Route path="/pay/:token" element={<PaymentPage />} />
      </Routes>
    </Router>
  );
}

export default App;
