import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { queue } from "./queue.js";
import { ensureDirs, jobDir } from "./utils.js";
import "./worker.js";

const app = Fastify({ logger: true });

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map(s => s.trim()),
});
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });

app.get("/api/health", async () => ({
  ok: true,
  service: "videohub-backend",
  time: new Date().toISOString(),
}))
const analyzeSchema = z.object({
  url: z.string().url()
});

app.post("/api/analyze", async (request, reply) => {
  const parsed = analyzeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "A valid http/https URL is required." });
  }

  // Import lazily so server startup does not need to analyze anything.
  const { analyzeUrl } = await import("./media.js");
  try {
    const meta = await analyzeUrl(parsed.data.url);
    return { ok: true, ...meta };
  } catch (error) {
    return reply.code(422).send({ error: error instanceof Error ? error.message : "Analysis failed." });
  }
});
const jobSchema = z.object({
  url: z.string().url(),
  format: z.enum(["mp4", "mp3"]).default("mp4"),
  quality: z.enum(["1080p", "720p", "480p", "360p"]).default("1080p"),
  startSeconds: z.number().min(0).optional(),
  endSeconds: z.number().positive().optional(),
});
app.post("/api/jobs", async (request, reply) => {
  const parsed = jobSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid download options.", details: parsed.error.flatten() });
  }

  if (
    parsed.data.startSeconds !== undefined &&
    parsed.data.endSeconds !== undefined &&
    parsed.data.endSeconds <= parsed.data.startSeconds
  ) {
    return reply.code(400).send({ error: "End time must be greater than start time." });
  }

  const job = await queue.add("download", parsed.data, {
    removeOnComplete: { age: config.jobTtlSeconds, count: 100 },
    removeOnFail: { age: config.jobTtlSeconds, count: 100 },
  });

  return reply.code(202).send({
    ok: true,
    id: job.id,
    state: "queued",
    statusUrl: `/api/jobs/${job.id}`,
    downloadUrl: `/api/jobs/${job.id}/download`,
  });
app.get("/api/jobs/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const job = await queue.getJob(id);

  if (!job) return reply.code(404).send({ error: "Job not found or expired." });

  const state = await job.getState();
  const result: any = job.returnvalue;
  const failedReason = job.failedReason || undefined;
  const progress = typeof job.progress === "number" ? job.progress : 0;

  return {
    ok: true,
    id,
    state,
    progress,
    title: result?.title,
    filename: result?.filename,
    downloadUrl: state === "completed" ? `/api/jobs/${id}/download` : undefined,
    error: failedReason,
  };
});

app.get("/api/jobs/:id/download", async (request, reply) => {
  const { id } = request.params as { id: string };
  const job = await queue.getJob(id);
  if (!job) return reply.code(404).send({ error: "Job not found or expired." });

  const state = await job.getState();
  if (state !== "completed") {
    return reply.code(409).send({ error: `Job is ${state}.` });
  }

  const result: any = job.returnvalue;
  if (!result?.filename) return reply.code(404).send({ error: "Output file not found." });

  const filePath = path.join(jobDir(id), result.filename);
  try {
    await fs.access(filePath);
  } catch {
    return reply.code(404).send({ error: "Output file has expired." });
  }

  reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
  reply.type("application/octet-stream");
  return reply.send(await fs.readFile(filePath));
});
    app.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await queue.getJob(id);
    if (!job) return reply.code(404).send({ error: "Job not found." });

    await job.remove();
    await fs.rm(jobDir(id), { recursive: true, force: true });
    return { ok: true, state: "cancelled" };
  });

  const start = async () => {
    try {
      await ensureDir();
      const port = Number(process.env.PORT) || Number(config.port) || 3000;
      await app.listen({ port, host: "0.0.0.0" });
      console.log(`Videohub backend listening on ${port}`);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  }

  start();
  
