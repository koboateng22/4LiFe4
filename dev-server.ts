/**
 * Run 4Life on your own computer or server.
 *   npm run dev   → the app with live reload (Vite) and the API, on one port (default 3000)
 *   npm start     → the built app (dist/) and the API
 * On Vercel this file is not used: api/index.ts serves the API and Vercel serves dist/.
 * (It is not called server.ts on purpose: Vercel treats a root server.ts/app.ts/index.ts
 * that imports Express as a whole Express app, which would hide the Vite front end.)
 */
import http from "http";
import path from "path";
import express from "express";
import app from "./server/app.js";
import { aiConfig } from "./server/core/ai.js";

/** Reads "--port 3001" style flags. The last one wins, so `npm run dev -- --port 3001` works. */
function getArg(flag: string): string | null {
  const idx = process.argv.lastIndexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}
// AI Studio dev environment runs an internal proxy on port 8080, so the server must bind to port 3000.
const PORT = Number(getArg("--port")) || (process.env.PORT && process.env.PORT !== "8080" ? Number(process.env.PORT) : 3000);
const HOST = getArg("--host") || process.env.HOST || "0.0.0.0";
const AI = aiConfig((name) => process.env[name]);

// Start Server with Vite
async function startServer() {
  // One HTTP server for the app, the API and Vite's live reload, so everything
  // works on a single port (also behind AI Studio's proxy, tunnels and Codespaces).
  const httpServer = http.createServer(app);

  // The built server (dist/server.mjs, used by "npm start") always serves the built app
  const isBuilt = import.meta.url.endsWith("/dist/server.mjs");
  if (process.env.NODE_ENV !== "production" && !isBuilt) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // A missing built file is a real 404 (not the app page), so an old tab can recover cleanly
    app.use("/assets", (_req, res) => {
      res.status(404).end();
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${PORT} is already in use. Close the other server (or the other terminal running "npm run dev"), or start on another port:\n  npm run dev -- --port ${PORT + 1}\n`);
    } else {
      console.error("The server could not start:", err);
    }
    process.exit(1);
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`4Life Server running on http://${HOST}:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log(
      AI.providers.length
        ? `AI: ${AI.providers.map((p) => `${p.name} (${p.model})`).join(", then ")}`
        : "AI: off — add GROQ_API_KEY (and GEMINI_API_KEY as backup) to .env.local; until then the chat says it isn't set up"
    );
  });
}

startServer();
