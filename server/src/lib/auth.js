import jwt from "jsonwebtoken";
import { unauthorized } from "./errors.js";

export const COOKIE_NAME = "bubbleup_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function signToken(config, user) {
  return jwt.sign({ sub: String(user.id), v: user.token_version ?? 0 }, config.jwtSecret, {
    expiresIn: MAX_AGE_SECONDS,
  });
}

export function setSessionCookie(req, res, config, user) {
  res.cookie(COOKIE_NAME, signToken(config, user), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure ?? req.secure,
    maxAge: MAX_AGE_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(req, res, config) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: config.cookieSecure ?? req.secure, path: "/" });
}

/** Returns the user row for a token, or null when invalid / revoked. */
export function userFromToken(db, config, token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.get("SELECT * FROM users WHERE id = ?", Number(payload.sub));
    if (!user || user.token_version !== payload.v) return null;
    return user;
  } catch {
    return null;
  }
}

/** Minimal cookie header parser for socket handshakes. */
export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function requireAuth(db, config) {
  return (req, res, next) => {
    const user = userFromToken(db, config, req.cookies?.[COOKIE_NAME]);
    if (!user) return next(unauthorized());
    req.user = user;
    next();
  };
}
