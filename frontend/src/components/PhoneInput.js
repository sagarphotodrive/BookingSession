import React, { useState, useEffect } from 'react';
import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js';
import { isPhoneValid, countryOptions } from '../lib/phone';

// Country + local-number input that stores/returns a normalized E.164 string.
const PhoneInput = ({ value, onChange, required, placeholder }) => {
  const deriveFromValue = (v) => {
    if (v && String(v).trim().startsWith('+')) {
      try {
        const p = parsePhoneNumberFromString(String(v).trim());
        if (p) return { country: p.country || 'IN', national: p.nationalNumber };
      } catch {}
    }
    return { country: 'IN', national: (v || '').replace(/\D/g, '') };
  };
  const [country, setCountry] = useState(() => deriveFromValue(value).country);
  const [national, setNational] = useState(() => deriveFromValue(value).national);
  const lastExternal = React.useRef(value);

  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      const d = deriveFromValue(value);
      setCountry(d.country);
      setNational(d.national);
    }
  }, [value]);

  const emit = (c, n) => {
    const digits = (n || '').replace(/\D/g, '');
    if (!digits) { onChange(''); return; }
    try {
      const full = `+${getCountryCallingCode(c)}${digits}`;
      const p = parsePhoneNumberFromString(full, c);
      if (p) { onChange(p.number); return; }
    } catch {}
    onChange(digits);
  };

  const valid = !national || isPhoneValid(value);

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <select
          value={country}
          onChange={e => { setCountry(e.target.value); lastExternal.current = value; emit(e.target.value, national); }}
          style={{ maxWidth: '150px', flexShrink: 0 }}
        >
          {countryOptions.map(c => <option key={c.iso2} value={c.iso2}>{c.flag} +{c.callingCode} {c.name}</option>)}
        </select>
        <input
          required={required}
          type="tel"
          value={national}
          onChange={e => { const v = e.target.value.replace(/[^\d\s]/g, ''); setNational(v); lastExternal.current = value; emit(country, v); }}
          placeholder={placeholder || 'Phone number'}
          style={{ flex: 1, borderColor: valid ? undefined : '#ef4444' }}
        />
      </div>
      {!valid && <span style={{ color: '#ef4444', fontSize: '12px' }}>Enter a valid phone number for the selected country</span>}
    </div>
  );
};

export default PhoneInput;
