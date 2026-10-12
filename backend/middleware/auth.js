import jwt from "jsonwebtoken";
import { dbOne } from "../utils/db.js";

const JWT_SECRET = process.env.JWT_SECRET;

export async function authOptional(req, _res, next) {

    const header = req.headers.authorization || "";

    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    if (!token) {
        return next();
    }

    try {

        const payload = jwt.verify(token, JWT_SECRET);

        const user = await dbOne(
            `SELECT
                id,
                email,
                first_name,
                last_name,
                sex,
                plan,
                pro_expires_at,
                is_admin
            FROM users
            WHERE id = $1`,
            [payload.id]
        );

        if (user) {
            req.user = user;
        }

    } catch {
        // Ignore invalid token
    }

    next();
}

export async function authRequired(req, res, next) {

    const header = req.headers.authorization || "";

    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    if (!token) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    try {

        const payload = jwt.verify(token, JWT_SECRET);

        const user = await dbOne(
            `SELECT
                id,
                email,
                first_name,
                last_name,
                sex,
                plan,
                pro_expires_at,
                is_admin
            FROM users
            WHERE id = $1`,
            [payload.id]
        );

        if (!user) {
            return res.status(401).json({
                error: "Unauthorized"
            });
        }

        req.user = user;

        next();

    } catch {

        return res.status(401).json({
            error: "Unauthorized"
        });

    }

}

export function authAdmin(req, res, next) {

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

export function authOwner(req, res, next) {

    if (!req.user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    if (
        req.user.email.toLowerCase() !==
        "voxa.technology@gmail.com"
    ) {
        return res.status(403).json({
            error: "Owner only"
        });
    }

    if (Number(req.user.is_admin) !== 2) {
        return res.status(403).json({
            error: "Owner only"
        });
    }

    next();
}