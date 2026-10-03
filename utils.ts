import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";

export async function ensureDirs() {
  await fs.mkdir(path.join(config.dataDir, "jobs"), { recursive: true });
}

export function jobDir(id: string) {
  return path.join(config.dataDir, "jobs", id);
}

export async function runCommand(command: string, args: string[], cwd?: string) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

export function sanitizeFilename(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, "_")
    .replace(/\\s+/g, " ")
    .trim()
    .slice(0, 150) || "videohub";
}

export function qualityHeight(q: string) {
  return ({ "1080p": 1080, "720p": 720, "480p": 480, "360p": 360 } as Record<string, number>)[q] || 720;
}

export async function findOutputFile(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = entries.filter(e => e.isFile() && !e.name.endsWith(".part") && !e.name.endsWith(".ytdl"));
  if (!candidates.length) throw new Error("Downloaded file was not created.");
  const stat = await Promise.all(candidates.map(async e => ({ name: e.name, mtime: (await fs.stat(path.join(dir, e.name))).mtimeMs })));
  stat.sort((a,b) => b.mtime - a.mtime);
  return path.join(dir, stat[0].name);
}
