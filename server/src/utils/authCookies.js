const isProduction = process.env.NODE_ENV === 'production';
const parseDurationMs = (value, fallbackMs) => {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (!match) return fallbackMs;
  return Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()]);
};
export const ACCESS_TOKEN_COOKIE = 'sb_access_token';
export const REFRESH_TOKEN_COOKIE = 'sb_refresh_token';
const options = maxAge => ({ httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/api/v1', ...(maxAge ? { maxAge } : {}) });
export const setAuthCookies = (res, tokens, extended = false) => {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, options(parseDurationMs(extended ? '30d' : process.env.JWT_EXPIRES_IN || process.env.ACCESS_TOKEN_EXPIRY, extended ? 30 * 86400000 : 900000)));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, options(parseDurationMs(extended ? '90d' : process.env.JWT_REFRESH_EXPIRES_IN || process.env.REFRESH_TOKEN_EXPIRY, extended ? 90 * 86400000 : 7 * 86400000)));
};
export const clearAuthCookies = res => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, options());
  res.clearCookie(REFRESH_TOKEN_COOKIE, options());
};
