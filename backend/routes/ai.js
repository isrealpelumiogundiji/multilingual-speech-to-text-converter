import express from "express";
import OpenAI from "openai";

import { authRequired } from "../middleware/auth.js";
import { dbOne } from "../utils/db.js";
import {
    isProActive,
    saveHistoryRow,
    checkAndConsumeUsage
} from "../utils/helpers.js";

const router = express.Router();

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function detectLanguageName(text) {

    const prompt = [
        "Detect the language of the text.",
        "Return only the language name in English.",
        "Examples: English, French, Spanish, Yoruba, Hausa, Arabic, Chinese, Japanese.",
        "Do not add extra words."
    ].join("\n");

    const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: prompt
            },
            {
                role: "user",
                content: String(text || "").slice(0, 2000)
            }
        ]
    });

    const out = String(
        response.output_text || ""
    ).trim();

    return out || "";

}

router.post("/polish", authRequired, async (req, res) => {
    try {

        const freshUser = await dbOne(
            "SELECT plan, pro_expires_at FROM users WHERE id = $1",
            [req.user.id]
        );

        if (!isProActive(freshUser)) {
            return res.status(402).json({
                error: "VIP feature. Upgrade to Pro to use this feature."
            });
        }

        const text = String(req.body?.text || "").trim();
        const style = String(req.body?.style || "neutral").trim();
        const language = String(req.body?.language || "").trim();

        if (!text) {
            return res.status(400).json({
                error: "Missing text"
            });
        }

        if (text.length > 12000) {
            return res.status(413).json({
                error: "Text too long"
            });
        }

        const systemPrompt = [
            "You are a transcription editor.",
            "Rewrite the transcript so it reads naturally.",
            "Correct grammar, capitalization, spelling, and word choice only when obviously wrong.",
            "Add punctuation correctly.",
            "Split into paragraphs when appropriate.",
            "Keep the meaning the same.",
            "Return only the corrected text.",
            language ? `Language hint: ${language}` : "",
            `Style: ${style}`
        ].filter(Boolean).join("\n");

        const response = await client.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            input: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });

        const out = String(response.output_text || "").trim();

        if (!out) {
            return res.status(500).json({
                error: "AI returned empty result."
            });
        }

        await saveHistoryRow({
            userId: req.user.id,
            transcript: text,
            polished: out,
            speechLang: language,
            kind: "polish"
        });

        res.json({
            text: out
        });

    } catch (err) {

        console.error("POLISH ERROR:", err);

        res.status(500).json({
            error: err.message || "Polish failed"
        });

    }
});

router.post("/translate", authRequired, async (req, res) => {
    try {

        const freshUser = await dbOne(
            "SELECT plan, pro_expires_at FROM users WHERE id = $1",
            [req.user.id]
        );

        if (!isProActive(freshUser)) {
            return res.status(402).json({
                error: "VIP feature. Upgrade to Pro to use this feature."
            });
        }

        const text = String(req.body?.text || "").trim();
        const to = String(req.body?.to || "").trim();
        const from = String(req.body?.from || "").trim();

        if (!text) {
            return res.status(400).json({
                error: "Missing text"
            });
        }

        if (!to) {
            return res.status(400).json({
                error: "Missing target language"
            });
        }

        if (text.length > 12000) {
            return res.status(413).json({
                error: "Text too long"
            });
        }

        let fromFinal = from;

        if (!fromFinal) {
            fromFinal = await detectLanguageName(text);
        }

        const systemPrompt = [
            "You are a professional translator.",
            "Translate accurately and naturally.",
            "Preserve meaning, tone, names, numbers, and formatting.",
            "Return only the translation."
        ].join("\n");

        const userPrompt = fromFinal
            ? `Translate from ${fromFinal} to ${to}:\n\n${text}`
            : `Translate to ${to}:\n\n${text}`;

        const response = await client.responses.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            input: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        });

        const out = String(response.output_text || "").trim();

        if (!out) {
            return res.status(500).json({
                error: "AI returned empty result."
            });
        }

        await saveHistoryRow({
            userId: req.user.id,
            transcript: text,
            translated: out,
            fromLang: fromFinal,
            toLang: to,
            kind: "translation"
        });

        res.json({
            text: out
        });

    } catch (err) {

        console.error("TRANSLATE ERROR:", err);

        res.status(500).json({
            error: err.message || "Translate failed"
        });

    }
});

export default router;