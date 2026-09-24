import { isValidPhoneNumber, parsePhoneNumberFromString, getCountries, getCountryCallingCode } from 'libphonenumber-js';

// International phone number helpers — E.164 storage, no hardcoded country.
// Legacy data (plain digits with no country code, e.g. old Indian guest records)
// is assumed India for backward compatibility only when no '+' prefix is present.
export const isPhoneValid = (phone) => {
  if (!phone) return false;
  const trimmed = String(phone).trim();
  try {
    return trimmed.startsWith('+') ? isValidPhoneNumber(trimmed) : isValidPhoneNumber(trimmed, 'IN');
  } catch { return false; }
};

export const toE164 = (phone, defaultCountry = 'IN') => {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  try {
    const p = parsePhoneNumberFromString(trimmed, trimmed.startsWith('+') ? undefined : defaultCountry);
    return p && p.isValid() ? p.number : trimmed;
  } catch { return trimmed; }
};

// Digits-only, country-code-included number for wa.me links — derived from the
// guest's own selected country, never a hardcoded prefix.
export const toWhatsAppNumber = (phone) => toE164(phone).replace(/[^\d]/g, '');

export const countryDisplayNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
export const toFlagEmoji = (iso2) => iso2.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
export const PRIORITY_COUNTRIES = ['IN', 'AE', 'US', 'GB'];
export const countryOptions = (() => {
  const all = getCountries();
  const rest = all.filter(c => !PRIORITY_COUNTRIES.includes(c))
    .sort((a, b) => (countryDisplayNames ? countryDisplayNames.of(a) : a).localeCompare(countryDisplayNames ? countryDisplayNames.of(b) : b));
  return [...PRIORITY_COUNTRIES, ...rest].map(iso2 => ({
    iso2,
    name: countryDisplayNames ? countryDisplayNames.of(iso2) : iso2,
    callingCode: getCountryCallingCode(iso2),
    flag: toFlagEmoji(iso2)
  }));
})();
