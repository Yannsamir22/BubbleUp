import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { COOKIE_NAME, clearSessionCookie, requireAuth, setSessionCookie, userFromToken } from "../lib/auth.js";
import { publicUser } from "../services/users.js";

export function authRoutes({ db, config, services, rt }) {
  const r = Router();
  const auth = requireAuth(db, config);

  // A whole class may share one public IP, so only *failed* attempts count.
  const limiter = config.rateLimit
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        skipSuccessfulRequests: true,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Too many failed attempts. Please wait a few minutes and try again.", code: "rate_limited" },
      })
    : (req, res, next) => next();

  r.post("/auth/register", limiter, async (req, res) => {
    const user = await services.users.register(req.body ?? {});
    setSessionCookie(req, res, config, user);
    res.status(201).json({ user: me(user) });
  });

  r.post("/auth/login", limiter, async (req, res) => {
    const user = await services.users.login(req.body ?? {});
    setSessionCookie(req, res, config, user);
    res.json({ user: me(user) });
  });

  r.post("/auth/logout", (req, res) => {
    clearSessionCookie(req, res, config);
    res.status(204).end();
  });

  // Returns { user: null } (not 401) when logged out, so the app's boot check is quiet.
  r.get("/auth/me", (req, res) => {
    const user = userFromToken(db, config, req.cookies?.[COOKIE_NAME]);
    res.json({ user: user ? me(user) : null });
  });

  r.patch("/me", auth, (req, res) => {
    const user = services.users.updateProfile(req.user.id, req.body ?? {});
    for (const { id } of services.classes.listForUser(user.id)) {
      rt.toClass(id, "user:updated", { user: publicUser(user) });
    }
    res.json({ user: me(user) });
  });

  r.post("/me/password", auth, async (req, res) => {
    const user = await services.users.changePassword(req.user.id, req.body ?? {});
    rt.disconnectUser(user.id); // other devices lose their session
    setSessionCookie(req, res, config, user);
    res.json({ user: me(user) });
  });

  return r;
}

const me = (u) => ({ ...publicUser(u), createdAt: u.created_at });
