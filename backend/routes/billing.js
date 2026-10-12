import express from "express";
import https from "https";

import { authRequired } from "../middleware/auth.js";
import {
    isProActive
} from "../utils/helpers.js";

import {
    dbOne,
    dbQuery
} from "../utils/db.js";

const router = express.Router();

function planToAmountKobo(plan) {

    const p = String(plan || "").toLowerCase();

    const monthly = Number(process.env.PAYSTACK_AMOUNT_MONTHLY_NGN || 0);
    const three = Number(process.env.PAYSTACK_AMOUNT_3MONTHS_NGN || 0);
    const yearly = Number(process.env.PAYSTACK_AMOUNT_YEARLY_NGN || 0);

    const amountNgn =
        p === "monthly"
            ? monthly
            : p === "3months"
            ? three
            : p === "quarterly"
            ? three
            : p === "yearly"
            ? yearly
            : monthly;

    if (!amountNgn || amountNgn <= 0) {
        return null;
    }

    return Math.round(amountNgn * 100);
}

const paystackAgent = new https.Agent({
    keepAlive: false,
    maxSockets: 10
});

function paystackRequestJson(
    method,
    pathName,
    secretKey,
    bodyObj
) {

    return new Promise((resolve, reject) => {

        const body = bodyObj
            ? JSON.stringify(bodyObj)
            : "";

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
                    "Content-Length": Buffer.byteLength(body)
                },
                timeout: 25000
            },
            (res) => {

                let data = "";

                res.on("data", chunk => {
                    data += chunk;
                });

                res.on("end", () => {

                    let json;

                    try {
                        json = JSON.parse(data || "{}");
                    } catch {
                        return reject(
                            new Error("Paystack returned non JSON response")
                        );
                    }

                    resolve({
                        statusCode: res.statusCode || 0,
                        json
                    });

                });

            }
        );

        req.on("timeout", () => {
            req.destroy(
                new Error("Paystack request timed out")
            );
        });

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();

    });

}

router.post("/paystack/initialize", authRequired, async (req, res) => {
    try {

        let plan = String(req.body?.plan || "monthly")
            .trim()
            .toLowerCase();

        if (plan === "quarter") plan = "quarterly";
        if (plan === "3months") plan = "quarterly";
        if (plan === "3-months") plan = "quarterly";
        if (plan === "3_months") plan = "quarterly";
        if (plan === "annual") plan = "yearly";
        if (plan === "year") plan = "yearly";

        const amount = planToAmountKobo(plan);

        if (!process.env.PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                error: "Missing PAYSTACK_SECRET_KEY in .env"
            });
        }

        if (!amount) {
            return res.status(400).json({
                error: "Invalid plan. Use monthly, quarterly, or yearly."
            });
        }

        const base =
            process.env.PUBLIC_BASE_URL ||
            "http://localhost:3000";

        const callbackUrl =
            `${base}/success.html?plan=${encodeURIComponent(plan)}`;

        const out = await paystackRequestJson(
            "POST",
            "/transaction/initialize",
            process.env.PAYSTACK_SECRET_KEY,
            {
                email: req.user.email,
                amount,
                callback_url: callbackUrl,
                metadata: {
                    userId: req.user.id,
                    plan
                }
            }
        );

        const data = out.json;

        if (
            out.statusCode < 200 ||
            out.statusCode > 299 ||
            !data.status
        ) {
            return res.status(400).json({
                error: data?.message || "Paystack initialize failed"
            });
        }

        return res.json({
            url: data.data.authorization_url
        });

    } catch (err) {

        console.error("PAYSTACK INIT ERROR:", err);

        return res.status(500).json({
            error: err.message || "Paystack init failed"
        });

    }
});

router.get("/paystack/verify", async (req, res) => {
    try {

        const reference = String(req.query.reference || "").trim();

        if (!reference) {
            return res.status(400).json({
                error: "Missing payment reference"
            });
        }

        const already = await dbOne(
            "SELECT id FROM payments WHERE reference = $1",
            [reference]
        );

        if (already) {
            return res.json({
                ok: true,
                message: "Payment already verified"
            });
        }

        const out = await paystackRequestJson(
            "GET",
            "/transaction/verify/" + encodeURIComponent(reference),
            process.env.PAYSTACK_SECRET_KEY
        );

        if (
            out.statusCode !== 200 ||
            !out.json.status
        ) {
            return res.status(400).json({
                error: out.json.message || "Verification failed"
            });
        }

        const trx = out.json.data;

        let plan = String(
    trx.metadata?.plan ||
    req.query.plan ||
    "monthly"
)
.trim()
.toLowerCase();

if (plan === "quarter") plan = "quarterly";
if (plan === "3months") plan = "quarterly";
if (plan === "3-months") plan = "quarterly";
if (plan === "3_months") plan = "quarterly";
if (plan === "annual") plan = "yearly";
if (plan === "year") plan = "yearly";

        if (trx.status !== "success") {
            return res.status(400).json({
                error: "Payment not successful"
            });
        }

        const userId = Number(trx.metadata?.userId);

        if (!userId) {
            return res.status(400).json({
                error: "Missing user id in payment metadata"
            });
        }

        const user = await dbOne(
            "SELECT plan, pro_expires_at FROM users WHERE id = $1",
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        let days = 30;

        if (plan === "quarterly") days = 90;
        if (plan === "yearly") days = 365;

        const base =
            isProActive(user)
                ? user.pro_expires_at
                : new Date().toISOString();

        const expiry = (() => {
            const d = new Date(base);
            d.setDate(d.getDate() + days);
            return d.toISOString();
        })();

        await dbQuery(
            `
            UPDATE users
            SET
                plan='pro',
                pro_expires_at=$1
            WHERE id=$2
            `,
            [
                expiry,
                userId
            ]
        );

        await dbQuery(
            `
            INSERT INTO payments
            (
                user_id,
                reference,
                amount,
                plan,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,'success'
            )
            `,
            [
                userId,
                reference,
                trx.amount,
                plan
            ]
        );

        return res.json({
            ok: true,
            expiresAt: expiry
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: err.message
        });

    }
});

export default router;