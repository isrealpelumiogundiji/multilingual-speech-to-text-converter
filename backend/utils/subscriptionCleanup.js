import { dbQuery } from "./db.js";

export async function cleanupExpiredSubscriptions() {
    try {

        const result = await dbQuery(
            `
            UPDATE users
            SET
                plan = 'free',
                pro_expires_at = NULL
            WHERE
                LOWER(plan) = 'pro'
                AND pro_expires_at IS NOT NULL
                AND pro_expires_at <= NOW()
            `
        );

        console.log(
            `Expired subscriptions cleaned: ${result.rowCount || 0}`
        );

    } catch (err) {

        console.error(
            "Subscription cleanup failed:",
            err
        );

    }
}