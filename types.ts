export type JobState = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type DownloadJobData = {
  url: string;
  format: "mp4" | "mp3";
  quality: "1080p" | "720p" | "480p" | "360p";
  startSeconds?: number;
  endSeconds?: number;
};

export type JobResult = {
  id: string;
  state: JobState;
  title?: string;
  filename?: string;
  downloadUrl?: string;
  error?: string;
  progress?: number;
};
