import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function int(value, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * JWT secret: required in production. In development we generate one and keep
 * it in the data dir so logins survive server restarts.
 */
function resolveJwtSecret(dataDir, isProd) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (isProd) {
    throw new Error("JWT_SECRET must be set in production (any long random string).");
  }
  const file = path.join(dataDir, ".jwt-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret);
    return secret;
  }
}

export function loadConfig(overrides = {}) {
  const env = overrides.env ?? process.env.NODE_ENV ?? "development";
  const isProd = env === "production";
  const dataDir = path.resolve(ROOT_DIR, overrides.dataDir ?? process.env.DATA_DIR ?? "data");

  const config = {
    env,
    isProd,
    isTest: env === "test",
    port: int(process.env.PORT, 3000),
    host: process.env.HOST || "0.0.0.0",
    dataDir,
    dbFile: overrides.dbFile ?? path.join(dataDir, "bubbleup.db"),
    uploadDir: overrides.uploadDir ?? path.join(dataDir, "uploads"),
    maxUploadMb: int(process.env.MAX_UPLOAD_MB, 25),
    clientDist: path.join(ROOT_DIR, "client", "dist"),
    corsOrigin: process.env.CORS_ORIGIN || null,
    // Set TRUST_PROXY=1 when running behind a reverse proxy / PaaS (Render, Railway, nginx).
    trustProxy: process.env.TRUST_PROXY ? int(process.env.TRUST_PROXY, 1) : 0,
    // null = decide per request (Secure cookie only when the request came over HTTPS).
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : null,
    pexelsApiKey: process.env.PEXELS_API_KEY || process.env.IMAGE_API_KEY || null,
    httpsKey: process.env.HTTPS_KEY_FILE || null,
    httpsCert: process.env.HTTPS_CERT_FILE || null,
    rateLimit: !(overrides.disableRateLimit ?? false),
    // Weekly awards: day 0=Sunday … 5=Friday; hour in server local time. AWARDS_ENABLED=false turns them off.
    awardsEnabled: process.env.AWARDS_ENABLED !== "false",
    awardsDay: int(process.env.AWARDS_DAY, 5),
    awardsHour: int(process.env.AWARDS_HOUR, 15),
    ...overrides,
  };
  config.jwtSecret = overrides.jwtSecret ?? resolveJwtSecret(dataDir, isProd);
  return config;
}
