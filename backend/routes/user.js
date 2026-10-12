import express from "express";

import { authRequired } from "../middleware/auth.js";
import { dbOne, dbQuery, dbMany } from "../utils/db.js";
import {
    isValidEmail,
    isProActive,
    saveHistoryRow
} from "../utils/helpers.js";

import bcrypt from "bcryptjs";

const router = express.Router();

router.get("/me", authRequired, (req, res) => {
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

router.put("/me", authRequired, async (req, res) => {

    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const sex = String(req.body?.sex || "").trim();

    if (!firstName) {
        return res.status(400).json({
            error: "First name is required"
        });
    }

    if (!lastName) {
        return res.status(400).json({
            error: "Last name is required"
        });
    }

    await dbQuery(
        `UPDATE users
         SET first_name = $1,
             last_name = $2,
             sex = $3
         WHERE id = $4`,
        [
            firstName,
            lastName,
            sex,
            req.user.id
        ]
    );

    res.json({
        ok: true
    });

});

router.put("/me/email", authRequired, async (req, res) => {

    const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();

    if (!isValidEmail(email)) {
        return res.status(400).json({
            error: "Invalid email"
        });
    }

    try {

        await dbQuery(
            "UPDATE users SET email = $1 WHERE id = $2",
            [
                email,
                req.user.id
            ]
        );

        res.json({
            ok: true
        });

    } catch {

        res.status(409).json({
            error: "Email already exists"
        });

    }

});

router.put("/me/password", authRequired, async (req, res) => {

    const currentPassword = String(
        req.body?.currentPassword || ""
    );

    const newPassword = String(
        req.body?.newPassword || ""
    );

    if (newPassword.length < 8) {
        return res.status(400).json({
            error: "New password must be at least 8 characters"
        });
    }

    const user = await dbOne(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user.id]
    );

    const ok = await bcrypt.compare(
        currentPassword,
        user?.password_hash || ""
    );

    if (!ok) {
        return res.status(401).json({
            error: "Current password is incorrect"
        });
    }

    const hash = await bcrypt.hash(
        newPassword,
        10
    );

    await dbQuery(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        [
            hash,
            req.user.id
        ]
    );

    res.json({
        ok: true
    });

});

router.get("/history", authRequired, async (req, res) => {

    const limit = Math.max(
        1,
        Math.min(100, Number(req.query.limit || 30))
    );

    const offset = Math.max(
        0,
        Number(req.query.offset || 0)
    );

    const items = await dbMany(
        `
        SELECT
            id,
            title,
            transcript,
            polished,
            translated,
            speech_lang,
            from_lang,
            to_lang,
            kind,
            created_at
        FROM history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        OFFSET $3
        `,
        [
            req.user.id,
            limit,
            offset
        ]
    );

    res.json({
        items
    });

});

router.post("/history", authRequired, async (req, res) => {

    const type = String(
        req.body?.type ||
        req.body?.kind ||
        "transcription"
    ).trim();

    const title = String(
        req.body?.title || ""
    ).trim();

    const transcript = String(
        req.body?.text ||
        req.body?.transcript ||
        ""
    ).trim();

    const resultText = String(
        req.body?.resultText || ""
    ).trim();

    if (!transcript) {
        return res.status(400).json({
            error: "Nothing to save."
        });
    }

    const kind =
        type === "polish"
            ? "polish"
            : type === "translate"
            ? "translation"
            : type === "translation"
            ? "translation"
            : "transcription";

    await saveHistoryRow({

        userId: req.user.id,

        transcript,

        polished:
            kind === "polish"
                ? resultText
                : null,

        translated:
            kind === "translation"
                ? resultText
                : null,

        kind,

        title

    });

    res.json({
        ok: true
    });

});

export default router;