/**
 * Vercel serverless function: every /api/... request lands here (see vercel.json)
 * and is answered by the same Express app used locally.
 */
import app from "../server/app.js";

export default app;
