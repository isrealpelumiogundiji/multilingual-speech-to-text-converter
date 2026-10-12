import jwt from "jsonwebtoken";
import crypto from "crypto";
import { dbOne, dbQuery } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is missing.");
}

export function isValidEmail(email) {
    return (
        typeof email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );
}

export function signToken(user) {
    return jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
}

export function sha256Hex(text) {
    return crypto
        .createHash("sha256")
        .update(String(text))
        .digest("hex");
}

export function addMinutesIso(minutes) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + Number(minutes));
    return d.toISOString();
}

export function addDaysIso(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days));
    return d.toISOString();
}

export function addDaysToIso(baseIso, days) {

    const d = baseIso
        ? new Date(baseIso)
        : new Date();

    if (Number.isNaN(d.getTime())) {
        const now = new Date();
        now.setDate(now.getDate() + Number(days));
        return now.toISOString();
    }

    d.setDate(d.getDate() + Number(days));

    return d.toISOString();
}

export function isProActive(user) {

    if (!user) return false;

    if ((user.plan || "").toLowerCase() !== "pro")
        return false;

    if (!user.pro_expires_at)
        return false;

    return (
        new Date(user.pro_expires_at).getTime() >
        Date.now()
    );
}

export function baseUrl() {

    const url = String(
        process.env.PUBLIC_BASE_URL ||
        "http://localhost:3000"
    ).trim();

    return url.endsWith("/")
        ? url.slice(0, -1)
        : url;
}

function makeHistoryTitle({
    transcript = "",
    kind = "transcription",
    fromLang = "",
    toLang = ""
}) {

    const cleaned = String(transcript)
        .replace(/\s+/g, " ")
        .trim();

    const words = cleaned
        .split(" ")
        .slice(0, 10)
        .join(" ");

    if (kind === "translation") {

        const pair = [
            fromLang || "Auto",
            toLang || ""
        ]
            .filter(Boolean)
            .join(" to ");

        return `${pair}: ${words || "Translation"}`;
    }

    if (kind === "polish") {
        return `Formatted: ${words || "Transcript"}`;
    }

    return words || "Transcript";
}

export async function saveHistoryRow({
    userId,
    transcript,
    polished = null,
    translated = null,
    speechLang = "",
    fromLang = "",
    toLang = "",
    kind = "transcription",
    title = ""
}) {

    const finalTitle =
        title ||
        makeHistoryTitle({
            transcript,
            kind,
            fromLang,
            toLang
        });

    await dbQuery(
        `
        INSERT INTO history
        (
            user_id,
            title,
            transcript,
            polished,
            translated,
            speech_lang,
            from_lang,
            to_lang,
            kind
        )
        VALUES
        (
            $1,$2,$3,$4,$5,$6,$7,$8,$9
        )
        `,
        [
            userId,
            finalTitle,
            transcript,
            polished,
            translated,
            speechLang,
            fromLang,
            toLang,
            kind
        ]
    );
}

export async function checkAndConsumeUsage({
    key,
    plan,
    chars
}) {

    const day = new Date()
        .toISOString()
        .slice(0, 10);

    const limits =
        plan === "pro"
            ? {
                  maxRequests: 500,
                  maxChars: 500000
              }
            : plan === "free"
            ? {
                  maxRequests: 80,
                  maxChars: 80000
              }
            : {
                  maxRequests: 30,
                  maxChars: 20000
              };

    const row = await dbOne(
        `
        SELECT
            requests,
            chars
        FROM usage_daily
        WHERE key=$1
        AND day=$2
        `,
        [
            key,
            day
        ]
    );

    const requests =
        (row?.requests || 0) + 1;

    const totalChars =
        (row?.chars || 0) + chars;

    if (requests > limits.maxRequests) {
        return {
            ok: false,
            reason: "Daily request limit reached"
        };
    }

    if (totalChars > limits.maxChars) {
        return {
            ok: false,
            reason: "Daily character limit reached"
        };
    }

    await dbQuery(
        `
        INSERT INTO usage_daily
        (
            key,
            day,
            requests,
            chars
        )
        VALUES
        (
            $1,$2,1,$3
        )
        ON CONFLICT(key,day)
        DO UPDATE SET
            requests=$4,
            chars=$5
        `,
        [
            key,
            day,
            chars,
            requests,
            totalChars
        ]
    );

    return {
        ok: true
    };

}