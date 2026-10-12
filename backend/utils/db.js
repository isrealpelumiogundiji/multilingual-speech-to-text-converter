import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is missing.");
}

const connectionString = process.env.DATABASE_URL;

const isRender =
    typeof connectionString === "string" &&
    (
        connectionString.includes("render.com") ||
        connectionString.includes("onrender.com") ||
        connectionString.includes("dpg-")
    );

export const pool = new Pool({
    connectionString,
    ssl: isRender
        ? { rejectUnauthorized: false }
        : false
});

export async function dbQuery(sql, params = []) {
    return pool.query(sql, params);
}

export async function dbOne(sql, params = []) {
    const result = await dbQuery(sql, params);
    return result.rows[0] || null;
}

export async function dbMany(sql, params = []) {
    const result = await dbQuery(sql, params);
    return result.rows;
}