import fs from "node:fs/promises";
import path from "node:path";
import { runCommand, sanitizeFilename, qualityHeight } from "./utils.js";

type Metadata = {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  webpage_url?: string;
};

function ytdlpBaseArgs() {
  return ["--no-playlist", "--no-warnings", "--ignore-config"];
}

export async function analyzeUrl(url: string): Promise<Metadata> {
  const result = await runCommand("yt-dlp", [...ytdlpBaseArgs(), "-J", url]);
  if (result.code !== 0) {
    throw new Error(extractYtError(result.stderr) || "Could not analyze this URL.");
  }
  let data: any;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error("The media service returned invalid metadata.");
  }
  return {
    id: data.id,
    title: data.title || "Untitled video",
    thumbnail: data.thumbnail,
    duration: typeof data.duration === "number" ? data.duration : undefined,
    uploader: data.uploader || data.channel,
    webpage_url: data.webpage_url || url
  };
}

export async function downloadMedia(
  url: string,
  outDir: string,
  format: "mp4" | "mp3",
  quality: "1080p" | "720p" | "480p" | "360p",
  startSeconds?: number,
  endSeconds?: number
) {
  await fs.mkdir(outDir, { recursive: true });

  const height = qualityHeight(quality);
  const outputTemplate = path.join(outDir, "source.%(ext)s");

  const args = [...ytdlpBaseArgs(), "-o", outputTemplate];

  if (format === "mp3") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push(
      "-f", `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/b[height<=${height}][ext=mp4]/bv*[height<=${height}]+ba/b[height<=${height}]`,
      "--merge-output-format", "mp4"
    );
  }

  args.push(url);

  const result = await runCommand("yt-dlp", args, outDir);
  if (result.code !== 0) {
    throw new Error(extractYtError(result.stderr) || "Media download failed.");
  }

  let output = await findFinal(outDir);

  if (startSeconds !== undefined || endSeconds !== undefined) {
    const trimmed = path.join(outDir, `trimmed.${format}`);
    const ss = String(Math.max(0, startSeconds ?? 0));
    const ffArgs = ["-y", "-ss", ss];
    if (endSeconds !== undefined) {
      ffArgs.push("-to", String(Math.max(0, endSeconds)));
    }
    ffArgs.push("-i", output);

    if (format === "mp3") {
      ffArgs.push("-vn", "-c:a", "libmp3lame", "-q:a", "2", trimmed);
    } else {
      ffArgs.push("-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", trimmed);
    }

    const ff = await runCommand("ffmpeg", ffArgs, outDir);
    if (ff.code !== 0) {
      throw new Error(ff.stderr.slice(-1000) || "Trim processing failed.");
    }
    if (output !== trimmed) await fs.rm(output, { force: true });
    output = trimmed;
  }

  return output;
}

async function findFinal(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => !n.endsWith(".part") && !n.endsWith(".ytdl") && !n.startsWith("source.") || /\\.(mp4|webm|mkv|m4a|mp3|mov)$/i.test(n));
  const media = files.filter(n => /\\.(mp4|webm|mkv|m4a|mp3|mov)$/i.test(n));
  if (!media.length) throw new Error("No final media file was produced.");
  return path.join(dir, media[0]);
}

function extractYtError(stderr: string) {
  const lines = stderr.split("\\n").map(s => s.trim()).filter(Boolean);
  return lines.filter(l => !l.startsWith("[debug]")).slice(-3).join(" ");
}
