import bcrypt from "bcryptjs";

import { dbOne } from "../utils/db.js";

import {
    signToken,
    isValidEmail,
    baseUrl
} from "../utils/helpers.js";

function googleRedirectUri() {

    return `${baseUrl()}/api/auth/google/callback`;

}

export function buildGoogleAuthUrl(mode = "login") {

    const clientId =
        process.env.GOOGLE_CLIENT_ID || "";

    const redirectUri =
        googleRedirectUri();

    const state = Buffer
        .from(
            JSON.stringify({
                mode
            })
        )
        .toString("base64url");

    const params =
        new URLSearchParams({

            client_id: clientId,

            redirect_uri: redirectUri,

            response_type: "code",

            scope:
                "openid email profile",

            access_type: "online",

            prompt: "select_account",

            state

        });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

}

async function exchangeCodeForTokens(code) {

    const clientId =
        process.env.GOOGLE_CLIENT_ID || "";

    const clientSecret =
        process.env.GOOGLE_CLIENT_SECRET || "";

    const redirectUri =
        googleRedirectUri();

    const body =
        new URLSearchParams({

            code,

            client_id: clientId,

            client_secret: clientSecret,

            redirect_uri: redirectUri,

            grant_type:
                "authorization_code"

        });

    const response =
        await fetch(
            "https://oauth2.googleapis.com/token",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body

            }
        );

    const data =
        await response
            .json()
            .catch(() => ({}));

    if (!response.ok) {

        throw new Error(

            data.error_description ||

            data.error ||

            "Google token exchange failed"

        );

    }

    return data;

}

async function fetchGoogleUserInfo(accessToken) {

    const response =
        await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            {

                headers: {

                    Authorization:
                        `Bearer ${accessToken}`

                }

            }
        );

    const data =
        await response
            .json()
            .catch(() => ({}));

    if (!response.ok) {

        throw new Error(
            "Google userinfo failed"
        );

    }

    return data;

}
export async function handleGoogleCallback(req, res) {

    try {

        if (
            !process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET
        ) {

            return res.redirect(
                `${baseUrl()}/login.html?gerr=missing_google_env`
            );

        }

        const code =
            String(req.query.code || "").trim();

        const rawState =
            String(req.query.state || "");

        let mode = "login";

        try {

            const parsed = JSON.parse(
                Buffer
                    .from(rawState, "base64url")
                    .toString("utf8")
            );

            mode =
                String(parsed.mode || "login")
                    .toLowerCase() === "signup"
                    ? "signup"
                    : "login";

        } catch {}

        if (!code) {

            return res.redirect(

                `${baseUrl()}/${
                    mode === "signup"
                        ? "signup"
                        : "login"
                }.html?gerr=no_code`

            );

        }

        const tokenData =
            await exchangeCodeForTokens(code);

        const accessToken =
            String(
                tokenData.access_token || ""
            );

        if (!accessToken) {

            return res.redirect(

                `${baseUrl()}/${
                    mode === "signup"
                        ? "signup"
                        : "login"
                }.html?gerr=no_access_token`

            );

        }

        const info =
            await fetchGoogleUserInfo(
                accessToken
            );

        const email =
            String(info.email || "")
                .trim()
                .toLowerCase();

        const givenName =
            String(info.given_name || "")
                .trim();

        const familyName =
            String(info.family_name || "")
                .trim();

        if (
            !email ||
            !isValidEmail(email)
        ) {

            return res.redirect(

                `${baseUrl()}/${
                    mode === "signup"
                        ? "signup"
                        : "login"
                }.html?gerr=no_email`

            );

        }

        let existing =
            await dbOne(

               ` SELECT *
                 FROM users
                 WHERE lower(email)=lower($1)`,

                [email]

            );

        if (
            mode === "login" &&
            !existing
        ) {

            return res.redirect(

                `${baseUrl()}/login.html?gerr=no_account`

            );

        }

        if (
            mode === "signup" &&
            existing
        ) {

            return res.redirect(

                `${baseUrl()}/signup.html?gerr=account_exists`

            );

        }

        let userRow = existing;
        if (!userRow) {
    const firstName = givenName || "User";
    const lastName = familyName || "Google";

    const randomPassword =
        `google:${email}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const hash = await bcrypt.hash(randomPassword, 10);

    const inserted = await dbOne(
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
        ($1,$2,$3,$4,'free')
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
        [firstName, lastName, email, hash]
    );

    userRow = inserted;

} else {

    userRow = await dbOne(
        `SELECT id,email,first_name,last_name,sex,plan,pro_expires_at,is_admin
         FROM users
         WHERE id=$1`,
        [userRow.id]
    );
}

const jwtToken = signToken(userRow);

return res.redirect(
    `${baseUrl()}/oauth.html#token=${encodeURIComponent(jwtToken)}`
);

} catch (err) {

    console.error("GOOGLE CALLBACK ERROR:", err);

    const msg = encodeURIComponent(
        err?.message || "google_failed"
    );

    return res.redirect(
        `${baseUrl()}/login.html?gerr=${msg}`
    );
}

};