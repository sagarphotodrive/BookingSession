import { format as fnsFormat } from 'date-fns';

export const format = fnsFormat;
export const safeFormat = (dateStr, fmt) => {
  if (!dateStr) return '-';
  try { const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')); return isNaN(d.getTime()) ? '-' : fnsFormat(d, fmt); }
  catch { return '-'; }
};

// Currency-safe money helpers (work in paise/cents to avoid float drift)
export const toPaise = (v) => Math.round((parseFloat(v) || 0) * 100);
export const paiseToRupees = (p) => (p / 100);
export const computeNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const n = Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return n > 0 ? n : 0;
};
