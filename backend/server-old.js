import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import https from "https";
import pg from "pg";

const { Pool } = pg;

export const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEV = (process.env.NODE_ENV || "development") !== "production";

if (DEV) {
  app.use(
    cors({
      origin: ["http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in environment variables");
}

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is missing. Postgres will not work without it.");
}

const connectionString = process.env.DATABASE_URL;

const isRender =
  typeof connectionString === "string" &&
  (connectionString.includes("render.com") ||
   connectionString.includes("onrender.com") ||
   connectionString.includes("dpg-"));

const pool = new Pool({
  connectionString,
  ssl: isRender ? { rejectUnauthorized: false } : false
});

function log(...args) {
  console.log(...args);
}

export async function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

export async function dbOne(sql, params = []) {
  const r = await dbQuery(sql, params);
  return r.rows[0] || null;
}

async function dbMany(sql, params = []) {
  const r = await dbQuery(sql, params);
  return r.rows || [];
}

/* -----------------------------
   DB schema init (Postgres)
   ----------------------------- */

async function dbInit() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      pro_expires_at TIMESTAMPTZ,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      key TEXT NOT NULL,
      day DATE NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      chars INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, day)
    );
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      transcript TEXT NOT NULL,
      polished TEXT,
      translated TEXT,
      speech_lang TEXT,
      from_lang TEXT,
      to_lang TEXT,
      kind TEXT NOT NULL DEFAULT 'transcription',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbQuery(`CREATE INDEX IF NOT EXISTS idx_history_user_created ON history(user_id, created_at DESC);`);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbQuery(`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);`);
  await dbQuery(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);`);

  /* -----------------------------
   Create Owner Account
----------------------------- */

const OWNER_EMAIL = "voxa.technology@gmail.com";

const owner = await dbOne(
  "SELECT id FROM users WHERE lower(email)=lower($1)",
  [OWNER_EMAIL]
);

if (owner) {
  await dbQuery(
    "UPDATE users SET is_admin = 2 WHERE id=$1",
    [owner.id]
  );

  console.log("Owner account verified.");
}
}

/* -----------------------------
   Helpers
   ----------------------------- */

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isProActive(userRow) {
  if (!userRow) return false;
  if ((userRow.plan || "").toLowerCase() !== "pro") return false;
  if (!userRow.pro_expires_at) return false;
  return new Date(userRow.pro_expires_at).getTime() > Date.now();
}

function baseUrl() {
  const b = String(process.env.PUBLIC_BASE_URL || "http://localhost:3000").trim();
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
}

export function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function addMinutesIso(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}

function getCallerKey(req) {
  if (req.user?.id) return `user:${req.user.id}`;
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return `ip:${ip}`;
}

async function checkAndConsumeUsage({ key, plan, chars }) {
  const day = new Date().toISOString().slice(0, 10);

  const limits =
    plan === "pro"
      ? { maxRequests: 500, maxChars: 500000 }
      : plan === "free"
      ? { maxRequests: 80, maxChars: 80000 }
      : { maxRequests: 30, maxChars: 20000 };

  const row = await dbOne("SELECT requests, chars FROM usage_daily WHERE key = $1 AND day = $2", [key, day]);

  const requests = (row?.requests || 0) + 1;
  const totalChars = (row?.chars || 0) + chars;

  if (requests > limits.maxRequests) return { ok: false, reason: "Daily request limit reached" };
  if (totalChars > limits.maxChars) return { ok: false, reason: "Daily character limit reached" };

  await dbQuery(
    `
      INSERT INTO usage_daily(key, day, requests, chars)
      VALUES($1, $2, 1, $3)
      ON CONFLICT(key, day)
      DO UPDATE SET requests = $4, chars = $5
    `,
    [key, day, chars, requests, totalChars]
  );

  return { ok: true };
}

function makeHistoryTitle({ transcript = "", kind = "transcription", fromLang = "", toLang = "" }) {
  const cleaned = String(transcript).replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").slice(0, 10).join(" ");
  if (kind === "translation") {
    const pair = [fromLang || "Auto", toLang || ""].filter(Boolean).join(" to ");
    return `${pair}: ${words || "Translation"}`;
  }
  if (kind === "polish") return `Formatted: ${words || "Transcript"}`;
  return words || "Transcript";
}

async function saveHistoryRow({
  userId,
  transcript,
  polished = null,
  translated = null,
  speechLang = "",
  fromLang = "",
  toLang = "",
  kind = "transcription",
  title = "",
}) {
  const finalTitle = title || makeHistoryTitle({ transcript, kind, fromLang, toLang });

  await dbQuery(
    `
      INSERT INTO history (user_id, title, transcript, polished, translated, speech_lang, from_lang, to_lang, kind)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [userId, finalTitle, transcript, polished, translated, speechLang, fromLang, toLang, kind]
  );
}

/* -----------------------------
   Auth middleware
   ----------------------------- */

async function authOptional(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await dbOne(
      `SELECT id, email, first_name, last_name, sex, plan, pro_expires_at, is_admin FROM users WHERE id = $1`,
      [payload.id]
    );

    if (user) req.user = user;
  } catch {}
  next();
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await dbOne(
      `SELECT id, email, first_name, last_name, sex, plan, pro_expires_at, is_admin FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function authAdmin(req, res, next) {

  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  if (Number(req.user.is_admin) < 1) {
    return res.status(403).json({
      error: "Admin only"
    });
  }
  next();
}

function authOwner(req, res, next) {
  if (
    !req.user ||
    req.user.email.toLowerCase() !== "voxa.technology@gmail.com" ||
    Number(req.user.is_admin) !== 2
  ) {
    return res.status(403).json({ error: "Owner only" });
  }

  next();
}
/* -----------------------------
   Google OAuth helpers + routes
   ----------------------------- */

function googleRedirectUri() {
  return `${baseUrl()}/api/auth/google/callback`;
}

function buildGoogleAuthUrl(mode) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri = googleRedirectUri();
  const state = Buffer.from(JSON.stringify({ mode })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = googleRedirectUri();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error_description || data?.error || "Google token exchange failed";
    throw new Error(msg);
  }
  return data;
}

async function fetchGoogleUserInfo(accessToken) {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google userinfo failed");
  return data;
}

// Start Google auth
app.get("/api/auth/google/start", (req, res) => {
  const mode = String(req.query?.mode || "login").toLowerCase() === "signup" ? "signup" : "login";

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).send("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  }

  const url = buildGoogleAuthUrl(mode);
  res.redirect(url);
});

// Callback from Google
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${baseUrl()}/login.html?gerr=missing_google_env`);
    }

    const code = String(req.query?.code || "").trim();
    const rawState = String(req.query?.state || "");

    let mode = "login";
    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
      mode = String(parsed.mode || "login").toLowerCase() === "signup" ? "signup" : "login";
    } catch {}

    if (!code) {
      return res.redirect(`${baseUrl()}/${mode === "signup" ? "signup" : "login"}.html?gerr=no_code`);
    }

    const tokenData = await exchangeCodeForTokens(code);
    const accessToken = String(tokenData.access_token || "");
    if (!accessToken) {
      return res.redirect(`${baseUrl()}/${mode === "signup" ? "signup" : "login"}.html?gerr=no_access_token`);
    }

    const info = await fetchGoogleUserInfo(accessToken);

    const email = String(info.email || "").trim().toLowerCase();
    const givenName = String(info.given_name || "").trim();
    const familyName = String(info.family_name || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.redirect(`${baseUrl()}/${mode === "signup" ? "signup" : "login"}.html?gerr=no_email`);
    }

    const existing = await dbOne("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);

    if (mode === "login" && !existing) {
      return res.redirect(`${baseUrl()}/login.html?gerr=no_account`);
    }

    if (mode === "signup" && existing) {
      return res.redirect(`${baseUrl()}/signup.html?gerr=account_exists`);
    }

    let userRow = existing;

    if (!userRow) {
      const firstName = givenName || "User";
      const lastName = familyName || "Google";

      const randomPassword = `google:${email}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const hash = await bcrypt.hash(randomPassword, 10);

      const inserted = await dbOne(
        `
          INSERT INTO users(first_name, last_name, email, password_hash, plan)
          VALUES($1,$2,$3,$4,'free')
          RETURNING id, email, first_name, last_name, sex, plan, pro_expires_at, is_admin
        `,
        [firstName, lastName, email, hash]
      );
      userRow = inserted;
    } else {
      userRow = await dbOne(
        `SELECT id, email, first_name, last_name, sex, plan, pro_expires_at, is_admin FROM users WHERE id = $1`,
        [userRow.id]
      );
    }

    const jwtToken = signToken(userRow);
    return res.redirect(`${baseUrl()}/oauth.html#token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    console.error("GOOGLE CALLBACK ERROR:", err);
    const msg = encodeURIComponent(err?.message || "google_failed");
    return res.redirect(`${baseUrl()}/login.html?gerr=${msg}`);
  }
});

/* -----------------------------
   Core API
   ----------------------------- */

app.use(authOptional);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/admin/make-me-admin", authRequired, async (req, res) => {

  app.get("/api/owner/users", authRequired, authOwner, async (_req, res) => {

  const users = await dbMany(`
    SELECT
      id,
      first_name,
      last_name,
      email,
      plan,
      is_admin,
      created_at
    FROM users
    ORDER BY created_at DESC
  `);

  res.json(users);

});

app.get("/api/owner/stats", authRequired, authOwner, async (_req, res) => {

  const totalUsers = await dbOne(
    "SELECT COUNT(*)::int AS count FROM users"
  );

  const admins = await dbOne(
    "SELECT COUNT(*)::int AS count FROM users WHERE is_admin = 1"
  );

  const owners = await dbOne(
    "SELECT COUNT(*)::int AS count FROM users WHERE is_admin = 2"
  );

  const proUsers = await dbOne(
    "SELECT COUNT(*)::int AS count FROM users WHERE plan='pro'"
  );

  const freeUsers = await dbOne(
    "SELECT COUNT(*)::int AS count FROM users WHERE plan='free'"
  );

  res.json({
    totalUsers: totalUsers.count,
    admins: admins.count,
    owners: owners.count,
    proUsers: proUsers.count,
    freeUsers: freeUsers.count
  });

});

app.post("/api/owner/admin/add", authRequired, authOwner, async (req, res) => {
  const userId = Number(req.body.userId);

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = await dbOne(
    "SELECT id, email, is_admin FROM users WHERE id = $1",
    [userId]
  );

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.email.toLowerCase() === "voxa.technology@gmail.com") {
    return res.status(400).json({ error: "Owner already exists" });
  }

  await dbQuery(
    "UPDATE users SET is_admin = 1 WHERE id = $1",
    [userId]
  );

  res.json({ ok: true });
});

app.post("/api/owner/admin/remove", authRequired, authOwner, async (req, res) => {
  const userId = Number(req.body.userId);

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = await dbOne(
    "SELECT id, email FROM users WHERE id = $1",
    [userId]
  );

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.email.toLowerCase() === "voxa.technology@gmail.com") {
    return res.status(400).json({ error: "You cannot remove the Owner." });
  }

  await dbQuery(
    "UPDATE users SET is_admin = 0 WHERE id = $1",
    [userId]
  );

  res.json({ ok: true });
});

app.post("/api/owner/make-admin", authRequired, authOwner, async (req, res) => {

  const userId = Number(req.body.userId);

  if (!userId) {
    return res.status(400).json({
      error: "Missing userId"
    });
  }

  const user = await dbOne(
    "SELECT id,email,is_admin FROM users WHERE id=$1",
    [userId]
  );

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  if (Number(user.is_admin) === 2) {
    return res.status(400).json({
      error: "Owner cannot be modified"
    });
  }

  await dbQuery(
    "UPDATE users SET is_admin=1 WHERE id=$1",
    [userId]
  );

  res.json({
    ok: true,
    message: `${user.email} is now an admin`
  });

});

app.post("/api/owner/remove-admin", authRequired, authOwner, async (req, res) => {

  const userId = Number(req.body.userId);

  if (!userId) {
    return res.status(400).json({
      error: "Missing userId"
    });
  }

  const user = await dbOne(
    "SELECT id,email,is_admin FROM users WHERE id=$1",
    [userId]
  );

  if (!user) {
    return res.status(404).json({
      error: "User not found"
    });
  }

  // Never allow removing the owner
  if (Number(user.is_admin) === 2) {
    return res.status(400).json({
      error: "Owner cannot be removed"
    });
  }

  await dbQuery(
    "UPDATE users SET is_admin=0 WHERE id=$1",
    [userId]
  );

  res.json({
    ok: true,
    message: `${user.email} is no longer an admin`
  });

});

  await dbQuery("UPDATE users SET is_admin = 1 WHERE id = $1", [req.user.id]);
  res.json({ ok: true });
});

app.get("/api/admin/users", authRequired, authOwner, async (_req, res) => {
  const items = await dbMany(
    `SELECT id, email, first_name, last_name, plan, pro_expires_at, created_at, is_admin
     FROM users
     ORDER BY id DESC
     LIMIT 300`
  );
  res.json({ items });
});

app.post("/api/owner/admin/add", authRequired, authOwner, async (req, res) => {

  const userId = Number(req.body.userId);

  if (!userId)
    return res.status(400).json({ error: "Missing userId" });

  await dbQuery(
    "UPDATE users SET is_admin = 1 WHERE id = $1",
    [userId]
  );

  res.json({ ok: true });

});

app.post("/api/owner/admin/remove", authRequired, authOwner, async (req, res) => {

  const userId = Number(req.body.userId);

  if (!userId)
    return res.status(400).json({ error: "Missing userId" });

  if (userId === req.user.id) {
    return res.status(400).json({
      error: "Owner cannot remove himself."
    });
  }

  await dbQuery(
    "UPDATE users SET is_admin = 0 WHERE id = $1",
    [userId]
  );

  res.json({ ok: true });

});

function addDaysToIso(baseIso, days) {
  const d = baseIso ? new Date(baseIso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date();
    d2.setDate(d2.getDate() + days);
    return d2.toISOString();
  }
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

app.post("/api/admin/users/set-plan", authRequired, authAdmin, async (req, res) => {
  const userId = Number(req.body?.userId || 0);
  const plan = String(req.body?.plan || "").trim().toLowerCase();
  const days = Number(req.body?.days || 0);

  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (plan !== "free" && plan !== "pro") return res.status(400).json({ error: "Plan must be free or pro" });

  const user = await dbOne("SELECT id, plan, pro_expires_at FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (plan === "free") {
    await dbQuery("UPDATE users SET plan = 'free', pro_expires_at = NULL WHERE id = $1", [userId]);
    return res.json({ ok: true, userId, plan: "free", proExpiresAt: null });
  }

  const add = days > 0 ? days : 30;

  const now = Date.now();
  const currentExpiry = user.pro_expires_at ? new Date(user.pro_expires_at).getTime() : 0;

  const baseIso =
    currentExpiry && currentExpiry > now ? user.pro_expires_at : new Date().toISOString();

  const expiresAt = addDaysToIso(baseIso, add);

  await dbQuery("UPDATE users SET plan = 'pro', pro_expires_at = $1 WHERE id = $2", [expiresAt, userId]);

  res.json({ ok: true, userId, plan: "pro", proExpiresAt: expiresAt });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!firstName) return res.status(400).json({ error: "First name is required" });
    if (!lastName) return res.status(400).json({ error: "Last name is required" });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const hash = await bcrypt.hash(password, 10);

    try {
      const user = await dbOne(
        `
          INSERT INTO users(first_name, last_name, email, password_hash, plan)
          VALUES($1,$2,$3,$4,'free')
          RETURNING id, email, first_name, last_name, sex, plan, pro_expires_at, is_admin
        `,
        [firstName, lastName, email, hash]
      );

      const token = signToken(user);
      return res.json({ token });
    } catch {
      return res.status(409).json({ error: "Email already exists" });
    }
  } catch {
    return res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await dbOne("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);

return res.json({
  token,
  role: Number(user.is_admin) === 2 ? "owner" : "admin"
});
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await dbOne(
      "SELECT * FROM users WHERE lower(email) = lower($1)",
      [email]
    );

    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok)
      return res.status(401).json({ error: "Invalid email or password" });

    if (Number(user.is_admin) < 1)
      return res.status(403).json({ error: "Admin access only" });

    const token = signToken(user);

    return res.json({
      token,
      role: Number(user.is_admin) === 2 ? "owner" : "admin"
    });

  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

/* -----------------------------
   Password reset
   ----------------------------- */

function smtpTransport() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });

    const user = await dbOne(
      "SELECT id, email, password_hash, is_admin FROM users WHERE lower(email) = lower($1)",
      [email]
    );

    if (!user) return res.json({ ok: true });

    if (String(user.password_hash || "").startsWith("google:")) {
      return res.status(400).json({ error: "This account uses Google sign in. Use Google login." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = addMinutesIso(30);

    await dbQuery(
      "INSERT INTO password_resets(user_id, token_hash, expires_at, used) VALUES($1,$2,$3,0)",
      [user.id, tokenHash, expiresAt]
    );

    const base = baseUrl();
    const isAdmin = Number(user.is_admin) === 1;

    const link = isAdmin
      ? `${base}/admin-reset.html?token=${encodeURIComponent(rawToken)}`
      : `${base}/reset.html?token=${encodeURIComponent(rawToken)}`;

    const transport = smtpTransport();
    if (!transport) return res.status(500).json({ error: "Email sender not configured in .env" });

    const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim() || "Voxa Support";
    await transport.sendMail({
      from,
      to: user.email,
      subject: "Reset your Voxa password",
      text: `Use this link to reset your password (valid for 30 minutes):\n\n${link}\n\nIf you did not request this, ignore this email.`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ error: err?.message || "Forgot password failed" });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Valid email is required" });
    if (message.length < 10) return res.status(400).json({ error: "Message is too short" });

    const transport = smtpTransport();
    if (!transport) return res.status(500).json({ error: "Email sender not configured" });

    const to = String(process.env.CONTACT_TO || process.env.SMTP_USER || "").trim();
    const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim() || "Voxa Support";

    await transport.sendMail({
      from,
      to,
      replyTo: email,
      subject: `Voxa Contact: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n`
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("CONTACT ERROR:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token) return res.status(400).json({ error: "Missing token" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const tokenHash = sha256Hex(token);

    const row = await dbOne(
      `
        SELECT id as reset_id, user_id, expires_at, used
        FROM password_resets
        WHERE token_hash = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [tokenHash]
    );

    if (!row) return res.status(400).json({ error: "Invalid or expired token" });
    if (Number(row.used) === 1) return res.status(400).json({ error: "Token already used" });

    if (new Date(row.expires_at).getTime() <= Date.now()) return res.status(400).json({ error: "Token expired" });

    const hash = await bcrypt.hash(newPassword, 10);

    await dbQuery("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, row.user_id]);
    await dbQuery("UPDATE password_resets SET used = 1 WHERE id = $1", [row.reset_id]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ error: err?.message || "Reset password failed" });
  }
});

/* -----------------------------
   Profile and history
   ----------------------------- */

app.get("/api/me", authRequired, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    sex: req.user.sex,
    plan: isProActive(req.user) ? "pro" : req.user.plan || "free",
    proExpiresAt: req.user.pro_expires_at || null,
    is_admin: Number(req.user.is_admin) || 0,
  });
});

app.get("/api/owner/me", authRequired, authOwner, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    is_admin: req.user.is_admin
  });
});


app.put("/api/me", authRequired, async (req, res) => {
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const sex = String(req.body?.sex || "").trim();

  if (!firstName) return res.status(400).json({ error: "First name is required" });
  if (!lastName) return res.status(400).json({ error: "Last name is required" });

  await dbQuery("UPDATE users SET first_name = $1, last_name = $2, sex = $3 WHERE id = $4", [
    firstName,
    lastName,
    sex,
    req.user.id,
  ]);

  res.json({ ok: true });
});

app.put("/api/me/email", authRequired, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });

  try {
    await dbQuery("UPDATE users SET email = $1 WHERE id = $2", [email, req.user.id]);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Email already exists" });
  }
});

app.put("/api/me/password", authRequired, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const user = await dbOne("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  const ok = await bcrypt.compare(currentPassword, user?.password_hash || "");
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(newPassword, 10);
  await dbQuery("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);

  res.json({ ok: true });
});

app.get("/api/history", authRequired, async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const items = await dbMany(
    `
      SELECT id, title, transcript, polished, translated, speech_lang, from_lang, to_lang, kind, created_at
      FROM history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [req.user.id, limit, offset]
  );

  res.json({ items });
});

app.post("/api/history", authRequired, async (req, res) => {
  const type = String(req.body?.type || req.body?.kind || "transcription").trim();
  const title = String(req.body?.title || "").trim();

  const transcript = String(req.body?.text || req.body?.transcript || "").trim();
  const resultText = String(req.body?.resultText || "").trim();

  if (!transcript) return res.status(400).json({ error: "Nothing to save." });

  const kind =
    type === "polish" ? "polish" :
    type === "translate" ? "translation" :
    type === "translation" ? "translation" :
    "transcription";

  await saveHistoryRow({
    userId: req.user.id,
    transcript,
    polished: kind === "polish" ? resultText : null,
    translated: kind === "translation" ? resultText : null,
    kind,
    title,
  });

  res.json({ ok: true });
});

/* -----------------------------
   AI endpoints
   ----------------------------- */

async function detectLanguageName(text) {
  const prompt = [
    "Detect the language of the text.",
    "Return only the language name in English.",
    "Examples: English, French, Spanish, Yoruba, Hausa, Arabic, Chinese, Japanese.",
    "Do not add extra words.",
  ].join("\n");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      { role: "system", content: prompt },
      { role: "user", content: String(text || "").slice(0, 2000) },
    ],
  });

  const out = String(response.output_text || "").trim();
  return out || "";
}

app.post("/api/polish", authRequired, async (req, res) => {
  try {
    const freshUser = await dbOne("SELECT plan, pro_expires_at FROM users WHERE id = $1", [req.user.id]);
    if (!isProActive(freshUser)) return res.status(402).json({ error: "VIP feature. Upgrade to Pro to use this feature." });

    const text = String(req.body?.text || "").trim();
    const style = String(req.body?.style || "neutral").trim();
    const language = String(req.body?.language || "").trim();

    if (!text) return res.status(400).json({ error: "Missing text" });
    if (text.length > 12000) return res.status(413).json({ error: "Text too long" });

    const usage = await checkAndConsumeUsage({ key: getCallerKey(req), plan: "pro", chars: text.length });
    if (!usage.ok) return res.status(429).json({ error: usage.reason });

    const systemPrompt = [
      "You are a transcription editor.",
      "Rewrite the transcript so it reads naturally.",
      "Correct grammar, capitalization, spelling, and word choice only when obviously wrong.",
      "Add punctuation such as commas, full stops, question marks, and exclamation marks correctly.",
      "Detect questions and add question marks.",
      "Split into paragraphs when a new idea starts or when there is a topic shift.",
      "Keep the meaning the same. Do not add new facts. Do not remove important details.",
      "Return only the corrected text.",
      language ? `Language hint: ${language}` : "",
      `Style: ${style}`,
    ].filter(Boolean).join("\n");

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    const out = String(response.output_text || "").trim();
    if (!out) return res.status(500).json({ error: "AI returned empty result." });

    await saveHistoryRow({
      userId: req.user.id,
      transcript: text,
      polished: out,
      speechLang: language || "",
      kind: "polish",
    });

    res.json({ text: out });
  } catch (err) {
    console.error("POLISH ERROR:", err);
    res.status(500).json({ error: err?.message || "Polish failed" });
  }
});

app.post("/api/translate", authRequired, async (req, res) => {
  try {
    const freshUser = await dbOne("SELECT plan, pro_expires_at FROM users WHERE id = $1", [req.user.id]);
    if (!isProActive(freshUser)) return res.status(402).json({ error: "VIP feature. Upgrade to Pro to use this feature." });

    const text = String(req.body?.text || "").trim();
    const to = String(req.body?.to || "").trim();
    const from = String(req.body?.from || "").trim();

    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!to) return res.status(400).json({ error: "Missing target language" });
    if (text.length > 12000) return res.status(413).json({ error: "Text too long" });

    const usage = await checkAndConsumeUsage({ key: getCallerKey(req), plan: "pro", chars: text.length });
    if (!usage.ok) return res.status(429).json({ error: usage.reason });

    let fromFinal = from;
    if (!fromFinal) fromFinal = await detectLanguageName(text);

    const systemPrompt = [
      "You are a professional translator.",
      "Translate accurately and naturally.",
      "Preserve meaning, tone, names, numbers, and formatting.",
      "Return only the translation.",
    ].join("\n");

    const userPrompt = fromFinal
      ? `Translate from ${fromFinal} to ${to}:\n\n${text}`
      : `Translate to ${to}:\n\n${text}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const out = String(response.output_text || "").trim();
    if (!out) return res.status(500).json({ error: "AI returned empty result." });

    await saveHistoryRow({
      userId: req.user.id,
      transcript: text,
      translated: out,
      fromLang: fromFinal || "",
      toLang: to || "",
      kind: "translation",
    });

    res.json({ text: out });
  } catch (err) {
    console.error("TRANSLATE ERROR:", err);
    res.status(500).json({ error: err?.message || "Translate failed" });
  }
});

/* -----------------------------
   Paystack
   ----------------------------- */

function planToAmountKobo(plan) {
  const p = String(plan || "").toLowerCase();

  const monthly = Number(process.env.PAYSTACK_AMOUNT_MONTHLY_NGN || 0);
  const three = Number(process.env.PAYSTACK_AMOUNT_3MONTHS_NGN || 0);
  const yearly = Number(process.env.PAYSTACK_AMOUNT_YEARLY_NGN || 0);

  const amountNgn =
    p === "monthly" ? monthly :
    p === "3months" ? three :
    p === "quarterly" ? three :
    p === "yearly" ? yearly :
    monthly;

  if (!amountNgn || amountNgn <= 0) return null;
  return Math.round(amountNgn * 100);
}

const paystackAgent = new https.Agent({
  keepAlive: false,
  maxSockets: 10,
});

function paystackRequestJson(method, pathName, secretKey, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : "";

    const req = https.request(
      {
        hostname: "api.paystack.co",
        servername: "api.paystack.co",
        path: pathName,
        method,
        agent: paystackAgent,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 25000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(data || "{}");
          } catch {
            return reject(new Error("Paystack returned non JSON response"));
          }
          resolve({ statusCode: res.statusCode || 0, json });
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("Paystack request timed out")));
    req.on("error", (err) => reject(err));

    if (body) req.write(body);
    req.end();
  });
}

app.post("/api/billing/paystack/initialize", authRequired, async (req, res) => {
  try {
    let plan = String(req.body?.plan || "monthly").trim().toLowerCase();

    if (plan === "quarter") plan = "quarterly";
    if (plan === "3months") plan = "quarterly";
    if (plan === "3-months") plan = "quarterly";
    if (plan === "3_months") plan = "quarterly";
    if (plan === "annual") plan = "yearly";
    if (plan === "year") plan = "yearly";

    const amount = planToAmountKobo(plan);

    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(500).json({ error: "Missing PAYSTACK_SECRET_KEY in .env" });
    if (!amount) return res.status(400).json({ error: "Invalid plan. Use monthly, quarterly, or yearly." });

    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const callbackUrl = `${base}/success.html?plan=${encodeURIComponent(plan)}`;

    log("PAYSTACK INIT:", { plan, amount, email: req.user.email });

    let out;
    try {
      out = await paystackRequestJson("POST", "/transaction/initialize", process.env.PAYSTACK_SECRET_KEY, {
        email: req.user.email,
        amount,
        callback_url: callbackUrl,
        metadata: { userId: req.user.id, plan },
      });
    } catch (e) {
      log("PAYSTACK INIT HTTPS ERROR:", e);
      return res.status(502).json({ error: "Cannot reach Paystack from backend." });
    }

    const data = out.json;
    log("PAYSTACK INIT RESPONSE:", data);

    if (out.statusCode < 200 || out.statusCode > 299 || !data.status) {
      return res.status(400).json({ error: data?.message || "Paystack initialize failed" });
    }

    res.json({ url: data.data.authorization_url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Paystack init failed" });
  }
});

app.get("/api/billing/paystack/verify", async (req, res) => {
  try {
    const reference = String(req.query?.reference || "").trim();
    let plan = String(req.query?.plan || "").trim().toLowerCase();

    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(500).json({ error: "Missing PAYSTACK_SECRET_KEY in .env" });
    if (!reference) return res.status(400).json({ error: "Missing reference" });

    if (plan === "quarter") plan = "quarterly";
    if (plan === "3months") plan = "quarterly";
    if (plan === "3-months") plan = "quarterly";
    if (plan === "3_months") plan = "quarterly";
    if (plan === "annual") plan = "yearly";
    if (plan === "year") plan = "yearly";

    log("PAYSTACK VERIFY HIT:", { reference, plan });

    let out;
    try {
      out = await paystackRequestJson(
        "GET",
        `/transaction/verify/${encodeURIComponent(reference)}`,
        process.env.PAYSTACK_SECRET_KEY
      );
    } catch (e) {
      log("PAYSTACK VERIFY HTTPS ERROR:", e);
      return res.status(502).json({ error: "Cannot reach Paystack from backend." });
    }

    const data = out.json;
    log("PAYSTACK VERIFY RESPONSE:", data);

    if (out.statusCode < 200 || out.statusCode > 299 || !data.status) {
      return res.status(400).json({ error: data?.message || "Paystack verify failed" });
    }

    const status = data?.data?.status;
    if (status !== "success") {
      return res.status(402).json({ error: `Payment not successful: ${status}` });
    }

    const metaUserIdRaw = data?.data?.metadata?.userId;
    const metaUserId = Number(metaUserIdRaw);

    if (!plan) {
      plan = String(data?.data?.metadata?.plan || "monthly").trim().toLowerCase();
      if (plan === "quarter") plan = "quarterly";
      if (plan === "3months") plan = "quarterly";
      if (plan === "3-months") plan = "quarterly";
      if (plan === "3_months") plan = "quarterly";
      if (plan === "annual") plan = "yearly";
      if (plan === "year") plan = "yearly";
    }

    const days = plan === "monthly" ? 30 : plan === "quarterly" ? 90 : plan === "yearly" ? 365 : 30;
    const expiresAt = addDaysIso(days);

    if (Number.isFinite(metaUserId) && metaUserId > 0) {
      const user = await dbOne("SELECT id, email FROM users WHERE id = $1", [metaUserId]);
      if (!user) return res.status(404).json({ error: `No user found for metadata.userId=${metaUserId}` });

      await dbQuery("UPDATE users SET plan = 'pro', pro_expires_at = $1 WHERE id = $2", [expiresAt, user.id]);
      return res.json({ ok: true, plan: "pro", proExpiresAt: expiresAt, upgradedUserId: user.id, email: user.email });
    }

    const paidEmail = String(data?.data?.customer?.email || data?.data?.email || "").trim().toLowerCase();
    if (!paidEmail) {
      return res.status(400).json({ error: "No metadata.userId and could not read customer email from Paystack verify response." });
    }

    const user = await dbOne("SELECT id, email FROM users WHERE lower(email) = lower($1)", [paidEmail]);
    if (!user) return res.status(404).json({ error: `No user found with email ${paidEmail}.` });

    await dbQuery("UPDATE users SET plan = 'pro', pro_expires_at = $1 WHERE id = $2", [expiresAt, user.id]);
    return res.json({ ok: true, plan: "pro", proExpiresAt: expiresAt, upgradedUserId: user.id, email: user.email });
  } catch (err) {
    log("PAYSTACK VERIFY ERROR:", err);
    res.status(500).json({ error: err.message || "Paystack verify failed" });
  }
});

/* -----------------------------
   Serve frontend from backend
   ----------------------------- */

const frontendDir = path.join(__dirname, "frontend");

app.get("/", (_req, res) => res.sendFile(path.join(frontendDir, "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(frontendDir, "admin.html")));
app.get("/admin-login", (_req, res) => res.sendFile(path.join(frontendDir, "admin-login.html")));
app.get("/admin-forgot", (_req, res) => res.sendFile(path.join(frontendDir, "admin-forgot.html")));
app.get("/admin-reset", (_req, res) => res.sendFile(path.join(frontendDir, "admin-reset.html")));

app.use(express.static(frontendDir));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDir, "index.html")));

/* -----------------------------
   Start server
   ----------------------------- */

const port = Number(process.env.PORT || 3000);

dbInit()
  .then(() => {
    app.listen(port, () => {
      console.log(`Voxa backend running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("DB INIT FAILED:", err);
    process.exit(1);
  });