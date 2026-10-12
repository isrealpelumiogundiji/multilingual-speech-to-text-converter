import bcrypt from "bcryptjs";
import { dbQuery, dbOne } from "./db.js";

export async function dbInit() {

    await dbQuery(`
        CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            first_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            sex TEXT NOT NULL DEFAULT '',
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            pro_expires_at TIMESTAMPTZ,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    await dbQuery(`
        CREATE TABLE IF NOT EXISTS usage_daily(
            key TEXT,
            day DATE,
            requests INTEGER DEFAULT 0,
            chars INTEGER DEFAULT 0,
            PRIMARY KEY(key,day)
        );
    `);

    await dbQuery(`
        CREATE TABLE IF NOT EXISTS history(
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title TEXT,
            transcript TEXT,
            polished TEXT,
            translated TEXT,
            speech_lang TEXT,
            from_lang TEXT,
            to_lang TEXT,
            kind TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    await dbQuery(`
        CREATE TABLE IF NOT EXISTS password_resets(
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            token_hash TEXT,
            expires_at TIMESTAMPTZ,
            used INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);

    const ownerEmail = "voxa.technology@gmail.com";

    const owner = await dbOne(
        "SELECT id FROM users WHERE lower(email)=lower($1)",
        [ownerEmail]
    );

    if (owner) {

        await dbQuery(
            "UPDATE users SET is_admin=2 WHERE id=$1",
            [owner.id]
        );

        console.log("Owner account verified.");
    }

    console.log("Database initialized.");
}