# VideoHub Backend

Backend for the supplied VideoHub frontend.

## API
- `GET /api/health`
- `POST /api/analyze` `{ "url": "https://..." }`
- `POST /api/jobs` `{ "url", "format", "quality", "startSeconds?", "endSeconds?" }`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/download`
- `DELETE /api/jobs/:id`

The backend uses yt-dlp for supported public media URLs, FFmpeg for conversion/trimming, and BullMQ + Redis for background jobs.

Use only content you are authorized to download.

## Render
The included Dockerfile installs Python, yt-dlp and FFmpeg. The included `render.yaml` creates a web service and a persistent disk for job output.

Set `REDIS_URL` to your Render Key Value/Redis connection string. Render's filesystem is ephemeral by default, so persistent storage is used for generated files. A persistent disk is attached under `/var/data` in the sample blueprint.
