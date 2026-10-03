import { Queue } from "bullmq";
import Redis from "ioredis";
import { config } from "./config.js";
import type { DownloadJobData } from "./types.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const queue = new Queue<DownloadJobData>("video-processing", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
