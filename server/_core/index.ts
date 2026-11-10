import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { Readable } from "stream";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerPdfExportRoute } from "../pdfExport";
import { registerSlackRoutes } from "../slack";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Slack verifies exact form bytes before decoding the payload field. Mount
  // these routes before app-wide parsers so they cannot consume/re-encode it.
  registerSlackRoutes(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({
    limit: "50mb",
    extended: true,
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: string }).rawBody = buffer.toString("utf8");
    },
  }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPdfExportRoute(app);

  // Direct file download route — streams file bytes server-side to avoid
  // CloudFront IP-restriction issues with browser-side redirects.
  app.get("/api/download/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) { res.status(400).send("Missing key"); return; }
    try {
      const base = ENV.forgeApiUrl.replace(/\/+$/, "");
      const presignUrl = `${base}/v1/storage/presign/get?path=${encodeURIComponent(key)}`;
      const presignResp = await fetch(presignUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!presignResp.ok) { res.status(502).send("Presign failed"); return; }
      const { url: signedUrl } = await presignResp.json() as { url: string };
      if (!signedUrl) { res.status(502).send("Empty signed URL"); return; }
      const fileResp = await fetch(signedUrl);
      if (!fileResp.ok) { res.status(fileResp.status).send("File not found"); return; }
      const ct = fileResp.headers.get("content-type") ?? "application/octet-stream";
      const cl = fileResp.headers.get("content-length");
      const raw = key.split("/").pop() ?? "download";
      const filename = raw.replace(/^\d{10,}-/, "");
      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      if (cl) res.setHeader("Content-Length", cl);
      if (fileResp.body) {
        Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
      } else {
        res.end(Buffer.from(await fileResp.arrayBuffer()));
      }
    } catch (err) {
      console.error("[Download] error:", err);
      if (!res.headersSent) res.status(502).send("Download error");
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
