import "dotenv/config";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT || 10000),
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  dataDir: process.env.DATA_DIR || path.resolve("data"),
  jobTtlSeconds: Number(process.env.JOB_TTL_SECONDS || 3600),
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS || 1),
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
