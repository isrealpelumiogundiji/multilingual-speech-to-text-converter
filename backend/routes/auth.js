import {
    buildGoogleAuthUrl,
    handleGoogleCallback
} from "../services/google.js";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

import { dbOne, dbQuery } from "../utils/db.js";

import {
    isValidEmail,
    signToken,
    sha256Hex,
    addMinutesIso,
    baseUrl
} from "../utils/helpers.js";

const router = express.Router();

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
/*
|--------------------------------------------------------------------------
| Signup
|--------------------------------------------------------------------------
*/

router.post("/signup", async (req, res) => {
    try {

        const firstName = String(req.body?.firstName || "").trim();
        const lastName = String(req.body?.lastName || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");

        if (!firstName)
            return res.status(400).json({ error: "First name is required" });

        if (!lastName)
            return res.status(400).json({ error: "Last name is required" });

        if (!isValidEmail(email))
            return res.status(400).json({ error: "Invalid email" });

        if (password.length < 8)
            return res.status(400).json({
                error: "Password must be at least 8 characters"
            });

        const hash = await bcrypt.hash(password, 10);

        try {

            const user = await dbOne(
                `
                INSERT INTO users
                (
                    first_name,
                    last_name,
                    email,
                    password_hash,
                    plan
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    'free'
                )
                RETURNING
                    id,
                    email,
                    first_name,
                    last_name,
                    sex,
                    plan,
                    pro_expires_at,
                    is_admin
                `,
                [
                    firstName,
                    lastName,
                    email,
                    hash
                ]
            );

            const token = signToken(user);

            return res.json({
                token
            });

        } catch {

            return res.status(409).json({
                error: "Email already exists"
            });

        }

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: "Signup failed"
        });

    }
});

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

router.post("/login", async (req, res) => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");

        const user = await dbOne(
            "SELECT * FROM users WHERE lower(email)=lower($1)",
            [email]
        );

        if (!user) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const ok = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!ok) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const token = signToken(user);

        return res.json({
            token,
            role: Number(user.is_admin) === 2 ? "owner" : "admin"
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);

        return res.status(500).json({
            error: "Login failed"
        });
    }
});

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
*/

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const user = await dbOne(
      "SELECT id, email, password_hash, is_admin FROM users WHERE lower(email)=lower($1)",
      [email]
    );

    // Don't reveal whether the email exists
    if (!user) {
      return res.json({ ok: true });
    }

    if (String(user.password_hash || "").startsWith("google:")) {
      return res.status(400).json({
        error: "This account uses Google sign in. Use Google login."
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = addMinutesIso(30);

    await dbQuery(
      `INSERT INTO password_resets(user_id, token_hash, expires_at, used)
       VALUES($1,$2,$3,0)`,
      [user.id, tokenHash, expiresAt]
    );

    const link =
      Number(user.is_admin) >= 1
        ? `${baseUrl()}/admin-reset.html?token=${encodeURIComponent(rawToken)}`
        : `${baseUrl()}/reset.html?token=${encodeURIComponent(rawToken)}`;

    const transport = smtpTransport();

    if (!transport) {
      return res.status(500).json({
        error: "Email sender not configured"
      });
    }

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER;

    await transport.sendMail({
      from,
      to: user.email,
      subject: "Reset your Voxa password",
      text:
`Use this link to reset your password.

${link}

This link expires in 30 minutes.`
    });

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Forgot password failed"
    });
  }
});

router.post("/reset-password", async (req, res) => {
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


/*
|--------------------------------------------------------------------------
| Admin Login
|--------------------------------------------------------------------------
*/

router.post("/admin/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await dbOne(
      "SELECT * FROM users WHERE lower(email)=lower($1)",
      [email]
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const ok = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!ok) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    if (Number(user.is_admin) < 1) {
      return res.status(403).json({
        error: "Admin access only"
      });
    }

    const token = signToken(user);

    return res.json({
      token,
      role: Number(user.is_admin) === 2 ? "owner" : "admin"
    });

  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);

    return res.status(500).json({
      error: "Login failed"
    });
  }
});

router.get("/google/start", (req, res) => {

    const mode =
        String(req.query.mode || "login").toLowerCase() === "signup"
            ? "signup"
            : "login";

    if (
        !process.env.GOOGLE_CLIENT_ID ||
        !process.env.GOOGLE_CLIENT_SECRET
    ) {
        return res.status(500).send(
            "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET"
        );
    }

    res.redirect(
        buildGoogleAuthUrl(mode)
    );

});

router.get(
    "/google/callback",
    handleGoogleCallback
);

export default router;