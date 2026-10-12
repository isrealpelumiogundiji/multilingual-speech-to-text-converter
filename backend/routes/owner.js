import express from "express";

import {
    authRequired,
    authOwner
} from "../middleware/auth.js";

import {
    dbOne,
    dbMany,
    dbQuery
} from "../utils/db.js";

const router = express.Router();

router.get("/stats", authRequired, authOwner, async (req, res) => {

    const totalUsers = await dbOne(
        "SELECT COUNT(*)::int AS total FROM users"
    );

    const totalAdmins = await dbOne(
        "SELECT COUNT(*)::int AS total FROM users WHERE is_admin >= 1"
    );

    const totalPro = await dbOne(
        `
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE LOWER(plan)='pro'
        AND pro_expires_at > NOW()
        `
    );

    const totalFree = await dbOne(
        `
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE LOWER(plan)='free'
        OR pro_expires_at IS NULL
        OR pro_expires_at <= NOW()
        `
    );

    const totalPayments = await dbOne(
        "SELECT COUNT(*)::int AS total FROM payments"
    );

    const revenue = await dbOne(
        `
        SELECT COALESCE(SUM(amount),0)::bigint AS total
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

router.get("/users", authRequired, authOwner, async (req, res) => {

    const q = String(req.query.q || "").trim();

    let items;

    if (q) {

        items = await dbMany(`
            
            SELECT
                id,
                first_name,
                last_name,
                email,
                plan,
                is_admin,
                pro_expires_at
            FROM users
            WHERE
                LOWER(first_name) LIKE LOWER($1)
                OR LOWER(last_name) LIKE LOWER($1)
                OR LOWER(email) LIKE LOWER($1)
            ORDER BY id DESC
            `,
            [`%${q}%`]
        );

    } else {

        items = await dbMany(`
            
            SELECT
                id,
                first_name,
                last_name,
                email,
                plan,
                is_admin,
                pro_expires_at
            FROM users
            ORDER BY id DESC
            `
        );

    }

    res.json({ items });

});

router.post("/users/set-admin", authRequired, authOwner, async (req, res) => {

    const userId = Number(req.body.userId);
    const isAdmin = Number(req.body.isAdmin);

    const user = await dbOne(
        "SELECT email,is_admin FROM users WHERE id=$1",
        [userId]
    );

    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    // Never allow owner account to be modified
    if (
        user.email.toLowerCase() ===
        "voxa.technology@gmail.com"
    ) {
        return res.status(403).json({
            error: "Owner account cannot be modified."
        });
    }

    await dbQuery(
        `
        UPDATE users
        SET is_admin=$1
        WHERE id=$2
        `,
        [isAdmin, userId]
    );

    res.json({
        ok: true
    });

});

export default router;