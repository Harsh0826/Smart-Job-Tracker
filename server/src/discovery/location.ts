import { WorkArrangement } from "./types";

const CANADA_PROVINCES =
  /\b(ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories)\b/i;
const CANADA_PROVINCE_CODES = /,\s*(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NU|NT)\b/;
const CANADA_CITIES =
  /\b(toronto|ottawa|waterloo|kitchener|mississauga|brampton|markham|vaughan|oakville|burlington|hamilton|guelph|london, on|richmond hill|montreal|montréal|vancouver|calgary|edmonton|winnipeg|halifax|victoria, bc|quebec city|gatineau|saskatoon|regina)\b/i;
const CANADA_WORD = /\b(canada|canadian)\b/i;

// Only "CAN" counts as a country code here. A bare "CA" in a location is usually California.
const CANADA_COUNTRY_CODE = /\bCAN\b/;

// GTA and nearby cities within commuting range of Brampton.
export const GTA_CITIES = [
  "brampton",
  "toronto",
  "mississauga",
  "vaughan",
  "markham",
  "richmond hill",
  "oakville",
  "burlington",
  "milton",
  "caledon",
  "etobicoke",
  "north york",
  "scarborough",
  "pickering",
  "ajax",
  "whitby",
  "oshawa",
  "newmarket",
  "aurora",
  "concord",
  "woodbridge",
  "bolton",
  "georgetown",
  "halton hills",
  "gta",
  "greater toronto",
];

export const ONTARIO_COMMUTE_CITIES = ["hamilton", "guelph", "kitchener", "waterloo", "cambridge"];

export function mentionsCanada(location: string): boolean {
  return (
    CANADA_WORD.test(location) ||
    CANADA_PROVINCES.test(location) ||
    CANADA_PROVINCE_CODES.test(location) ||
    CANADA_CITIES.test(location) ||
    CANADA_COUNTRY_CODE.test(location)
  );
}

export function isCanadaJob(locations: string[], country: string | null): boolean {
  if (country && /^(ca|can|canada)$/i.test(country.trim())) {
    return true;
  }

  return locations.some(mentionsCanada);
}

export function isOntario(location: string): boolean {
  const lower = location.toLowerCase();

  return (
    /\bontario\b/i.test(location) ||
    /,\s*ON\b/.test(location) ||
    GTA_CITIES.some((city) => lower.includes(city)) ||
    ONTARIO_COMMUTE_CITIES.some((city) => lower.includes(city)) ||
    /\b(ottawa|london, on)\b/i.test(location)
  );
}

export function isGta(location: string): boolean {
  const lower = location.toLowerCase();
  return GTA_CITIES.some((city) => lower.includes(city));
}

export function inferWorkArrangement(...hints: (string | null | undefined)[]): WorkArrangement {
  const text = hints.filter(Boolean).join(" ").toLowerCase();

  if (!text) return "unknown";

  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\bremote\b|work from home|distributed team|\bwfh\b/.test(text)) return "remote";
  if (/\bon[- ]?site\b|in[- ]office|in person/.test(text)) return "onsite";

  return "unknown";
}
