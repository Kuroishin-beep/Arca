/**
 * The session cookie's name and lifetime, in a module with no imports, so the
 * request proxy (`proxy.ts`) can renew the cookie without pulling in the
 * repository behind `session.ts`.
 */
export const SESSION_COOKIE_NAME = "arca_user";

/** 30 days, restarted on every visit by `proxy.ts`. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
