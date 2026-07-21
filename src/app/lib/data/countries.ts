// Country registry for leaderboard regions. Codes are ISO 3166-1 alpha-2,
// grouped by continent for the account-page picker. Display names come from
// Intl.DisplayNames so we never maintain a 250-entry name table ourselves.

export const COUNTRY_REGIONS: Record<string, string[]> = {
  Africa: [
    "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
    "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
    "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
    "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
    "TZ", "TG", "TN", "UG", "ZM", "ZW",
  ],
  Americas: [
    "AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU",
    "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI",
    "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE", "PR",
  ],
  Asia: [
    "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "GE", "HK", "IN",
    "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MO",
    "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA",
    "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ",
    "VN", "YE",
  ],
  Europe: [
    "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
    "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT",
    "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU",
    "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA",
  ],
  Oceania: [
    "AU", "FJ", "KI", "MH", "FM", "NR", "NZ", "PW", "PG", "WS", "SB", "TO",
    "TV", "VU",
  ],
};

export const ALL_COUNTRY_CODES: string[] = Object.values(COUNTRY_REGIONS).flat();

const CODE_SET = new Set(ALL_COUNTRY_CODES);

export function isValidCountryCode(code: unknown): code is string {
  return typeof code === "string" && CODE_SET.has(code.toUpperCase());
}

export function regionOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  for (const [region, codes] of Object.entries(COUNTRY_REGIONS)) {
    if (codes.includes(upper)) return region;
  }
  return null;
}

// "GB" -> 🇬🇧 via regional-indicator codepoints; empty string for unknowns.
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(
    ...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

const displayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return displayNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
