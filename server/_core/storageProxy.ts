import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { Readable } from "stream";

async function getPresignedUrl(key: string): Promise<string> {
  const base = ENV.forgeApiUrl.replace(/\/+$/, "");
  const url = `${base}/v1/storage/presign/get?path=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Forge presign failed: ${resp.status} ${body}`);
  }
  const data = (await resp.json()) as { url?: string };
  if (!data.url) throw new Error("Empty presigned URL from Forge");
  return data.url;
}

async function streamFileToResponse(signedUrl: string, key: string, res: Response): Promise<void> {
  const fileResp = await fetch(signedUrl);
  if (!fileResp.ok) {
    throw new Error(`S3 fetch failed: ${fileResp.status}`);
  }

  const contentType = fileResp.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = fileResp.headers.get("content-length");
  const rawFilename = key.split("/").pop() ?? "download";
  const cleanFilename = rawFilename.replace(/^\d{10,}-/, "");

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}"`);
  if (contentLength) res.setHeader("Content-Length", contentLength);

  if (fileResp.body) {
    const nodeStream = Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]);
    await new Promise<void>((resolve, reject) => {
      nodeStream.pipe(res);
      nodeStream.on("end", resolve);
      nodeStream.on("error", reject);
      res.on("error", reject);
    });
  } else {
    const buffer = await fileResp.arrayBuffer();
    res.end(Buffer.from(buffer));
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req: Request, res: Response) => {
    const key = (req.params as Record<string, string>)[0];

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage not configured");
      return;
    }

    try {
      const signedUrl = await getPresignedUrl(key);
      await streamFileToResponse(signedUrl, key, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[StorageProxy] error for key="${key}": ${message}`);
      if (!res.headersSent) {
        res.status(502).send(`Storage error: ${message}`);
      }
    }
  });
}
