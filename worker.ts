import { Worker } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { redis } from "./queue.js";
import { analyzeUrl, downloadMedia } from "./media.js";
import { jobDir, sanitizeFilename } from "./utils.js";
import type { DownloadJobData } from "./types.js";

export const worker = new Worker<DownloadJobData>(
  "video-processing",
  async (job) => {
    const dir = jobDir(job.id!);
    await fs.mkdir(dir, { recursive: true });

    await job.updateProgress(5);
    const meta = await analyzeUrl(job.data.url);
    await job.updateProgress(15);

    const output = await downloadMedia(
      job.data.url,
      dir,
      job.data.format,
      job.data.quality,
      job.data.startSeconds,
      job.data.endSeconds
    );

    await job.updateProgress(100);

    const ext = path.extname(output).slice(1) || job.data.format;
    const safeTitle = sanitizeFilename(meta.title || "videohub");
    const finalName = `${safeTitle}.${ext}`;
    const finalPath = path.join(dir, finalName);
    if (output !== finalPath) {
      await fs.rename(output, finalPath);
    }

    return {
      title: meta.title || "Untitled video",
      filename: finalName,
      thumbnail: meta.thumbnail,
    };
  },
  {
    connection: redis,
    concurrency: config.maxConcurrentJobs,
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] completed ${job.id}`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.id}: ${err.message}`);
});
