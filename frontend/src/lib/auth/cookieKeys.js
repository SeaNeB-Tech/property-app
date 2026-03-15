export const REFRESH_COOKIE_KEYS = Object.freeze([
  "refresh_token_property",
  "refresh_token",
  "refreshToken",
  "refreshToken_property",
  "property_refresh_token",
  "refreshtoken",
  "refreshtoken_property",
]);

export const CSRF_COOKIE_KEYS = Object.freeze([
  "csrf_token_property",
  "csrf_token",
  "csrfToken",
  "csrfToken_property",
  "property_csrf_token",
  "csrf-token",
  "csrftoken",
  "XSRF-TOKEN",
  "xsrf-token",
  "XSRF_TOKEN",
  "X-XSRF-TOKEN",
  "x-xsrf-token",
  "_csrf",
]);

export const ACCESS_COOKIE_KEYS = Object.freeze([
  "access_token",
  "accessToken",
  "access_token_property",
]);

export const SESSION_COOKIE_KEYS = Object.freeze([
  "auth_session",
  "auth_session_start",
  "auth_redirect_in_progress",
]);

export const AUTH_COOKIE_KEYS = Object.freeze(
  Array.from(
    new Set([
      ...CSRF_COOKIE_KEYS,
      ...REFRESH_COOKIE_KEYS,
      ...ACCESS_COOKIE_KEYS,
      ...SESSION_COOKIE_KEYS,
    ])
  )
);
