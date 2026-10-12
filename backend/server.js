import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { dbInit } from "./utils/dbInit.js";
import { authOptional } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import aiRoutes from "./routes/ai.js";
import billingRoutes from "./routes/billing.js";
import adminRoutes from "./routes/admin.js";
import ownerRoutes from "./routes/owner.js";
import { cleanupExpiredSubscriptions } from "./utils/subscriptionCleanup.js";

const app = express();
const DEV = (process.env.NODE_ENV || "development") !== "production";

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

if (DEV) {
    app.use(cors({
        origin: ["http://localhost:3000"],
        methods: ["GET","POST","PUT","DELETE"],
        allowedHeaders: ["Content-Type","Authorization"]
    }));
}
app.use(authOptional);
app.use("/api/auth", authRoutes);
app.use("/api", userRoutes);
app.use("/api", aiRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/api/health", (req,res)=>{
    res.json({
        ok:true,
        message:"Voxa API running"
    });
});

const frontendDir = path.join(__dirname,"frontend");

app.use(express.static(frontendDir));

app.get("*",(req,res)=>{
    res.sendFile(path.join(frontendDir,"index.html"));
});

const PORT = process.env.PORT || 3000;

dbInit()
    .then(async () => {

        await cleanupExpiredSubscriptions();

        setInterval(cleanupExpiredSubscriptions, 60 * 60 * 1000);

        app.listen(PORT, () => {

            console.log("Voxa backend running on port", PORT);

        });

    })
    .catch(err => {

        console.error(err);

        process.exit(1);

    });