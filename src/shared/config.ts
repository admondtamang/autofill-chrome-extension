/** All named constants for ImmiFill. Change one constant here to update everywhere. */

export const API_BASE_URL = "https://api.successedu.com.au/success-crm";

// ASSUMPTION A1: auth header format — may be a raw token or custom header
export const AUTH_HEADER_NAME = "Authorization";
export const AUTH_HEADER_PREFIX = "Bearer";

// ASSUMPTION A2: pagination param name and base index
export const PAGINATION = { param: "page", base: 1 };

export const SEARCH_LIMIT = 25;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;

// ASSUMPTION A6: CRM timezone defaults to browser timezone
export const CRM_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const PICK_MODE_TIMEOUT_MS = 15_000;
export const DOM_SETTLE_QUIET_MS = 300;
export const DOM_SETTLE_HARD_TIMEOUT_MS = 3_000;
