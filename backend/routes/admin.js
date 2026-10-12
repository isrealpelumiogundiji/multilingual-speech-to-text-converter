import express from "express";

import {
    authRequired,
    authAdmin
} from "../middleware/auth.js";

import {
    dbOne,
    dbMany,
    dbQuery
} from "../utils/db.js";
import {
    addDaysToIso
} from "../utils/helpers.js";

const router = express.Router();

router.get("/stats", authRequired, authAdmin, async (req, res) => {

    const totalUsers = await dbOne(
        "SELECT COUNT(*)::int AS total FROM users"
    );

    const totalAdmins = await dbOne(
        "SELECT COUNT(*)::int AS total FROM users WHERE is_admin = 1"
    );

    const totalPro = await dbOne(
        `
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE
            LOWER(plan)='pro'
            AND pro_expires_at > NOW()
        `
    );

    const totalFree = await dbOne(
        `
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE
            LOWER(plan)='free'
            OR pro_expires_at IS NULL
            OR pro_expires_at <= NOW()
        `
    );

    const totalPayments = await dbOne(
        "SELECT COUNT(*)::int AS total FROM payments"
    );

    const revenue = await dbOne(
        `
        SELECT
            COALESCE(SUM(amount),0)::bigint AS total
        FROM payments
        WHERE status='success'
        `
    );

    res.json({
        totalUsers: totalUsers.total,
        totalAdmins: totalAdmins.total,
        totalPro: totalPro.total,
        totalFree: totalFree.total,
        totalPayments: totalPayments.total,
        revenue: Number(revenue.total) / 100
    });

});

router.get("/users", authRequired, authAdmin, async (req, res) => {

    const q = String(req.query.q || "").trim();

    let items;

    if (q) {

        items = await dbMany(
            `
            SELECT
                id,
                first_name,
                last_name,
                email,
                plan,
                pro_expires_at,
                is_admin,
                created_at
            FROM users
            WHERE
                LOWER(first_name) LIKE LOWER($1)
                OR LOWER(last_name) LIKE LOWER($1)
                OR LOWER(email) LIKE LOWER($1)
            ORDER BY id DESC
            LIMIT 200
            `,
            [`%${q}%`]
        );

    } else {

        items = await dbMany(
            `
            SELECT
                id,
                first_name,
                last_name,
                email,
                plan,
                pro_expires_at,
                is_admin,
                created_at
            FROM users
            ORDER BY id DESC
            LIMIT 200
            `
        );

    }

    res.json({ items });

});

router.post("/make-me-admin", authRequired, async (req, res) => {
    await dbQuery(
        "UPDATE users SET is_admin = 1 WHERE id = $1",
        [req.user.id]
    );

    res.json({ ok: true });
});

router.post("/users/set-plan", authRequired, authAdmin, async (req, res) => {

    const userId = Number(req.body?.userId || 0);
    const plan = String(req.body?.plan || "")
        .trim()
        .toLowerCase();
    const days = Number(req.body?.days || 0);

    if (!userId) {
        return res.status(400).json({
            error: "Missing userId"
        });
    }

    if (plan !== "free" && plan !== "pro") {
        return res.status(400).json({
            error: "Plan must be free or pro"
        });
    }

    const user = await dbOne(
        "SELECT id, plan, pro_expires_at FROM users WHERE id = $1",
        [userId]
    );

    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    if (plan === "free") {

        await dbQuery(
            "UPDATE users SET plan='free', pro_expires_at=NULL WHERE id=$1",
            [userId]
        );

        return res.json({
            ok: true,
            userId,
            plan: "free",
            proExpiresAt: null
        });

    }

    const add = days > 0 ? days : 30;

    const now = Date.now();

    const currentExpiry = user.pro_expires_at
        ? new Date(user.pro_expires_at).getTime()
        : 0;

    const baseIso =
        currentExpiry > now
            ? user.pro_expires_at
            : new Date().toISOString();

    const expiresAt = addDaysToIso(baseIso, add);

    await dbQuery(
        "UPDATE users SET plan='pro', pro_expires_at=$1 WHERE id=$2",
        [expiresAt, userId]
    );

    res.json({
        ok: true,
        userId,
        plan: "pro",
        proExpiresAt: expiresAt
    });

});

router.get("/payments", authRequired, authAdmin, async (req, res) => {

    const items = await dbMany(
        `
        SELECT
            p.id,
            p.reference,
            p.amount,
            p.plan,
            p.status,
            p.created_at,

            u.id AS user_id,
            u.first_name,
            u.last_name,
            u.email

        FROM payments p

        LEFT JOIN users u
        ON u.id = p.user_id

        ORDER BY p.created_at DESC

        LIMIT 500
        `
    );

    res.json({
        items
    });

});

router.get("/analytics", authRequired, authAdmin, async (req, res) => {

    const todayUsers = await dbOne(`
        SELECT COUNT(*)::int total
        FROM users
        WHERE DATE(created_at)=CURRENT_DATE
    `);

    const todayRevenue = await dbOne(`
        SELECT COALESCE(SUM(amount),0)::bigint total
        FROM payments
        WHERE
            status='success'
            AND DATE(created_at)=CURRENT_DATE
    `);

    const transcripts = await dbOne(`
        SELECT COUNT(*)::int total
        FROM history
        WHERE kind='transcription'
    `);

    const translations = await dbOne(`
        SELECT COUNT(*)::int total
        FROM history
        WHERE kind='translation'
    `);

    const formatting = await dbOne(`
        SELECT COUNT(*)::int total
        FROM history
        WHERE kind='polish'
    `);

    res.json({
        todayUsers: todayUsers.total,
        todayRevenue: Number(todayRevenue.total) / 100,
        transcripts: transcripts.total,
        translations: translations.total,
        formatting: formatting.total
    });

});

router.get("/charts", authRequired, authAdmin, async (req, res) => {

    const users = await dbMany(`
        SELECT
            DATE(created_at) AS day,
            COUNT(*)::int AS total
        FROM users
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
    `);

    const revenue = await dbMany(`
        SELECT
            DATE(created_at) AS day,
            COALESCE(SUM(amount),0)/100 AS total
        FROM payments
        WHERE status='success'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
    `);

    res.json({
        users,
        revenue
    });

});

export default router;