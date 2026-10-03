# VideoHub Frontend

This folder contains:
- index.html
- style.css
- script.js

## Render backend
The frontend is configured with:

https://backend-file-pahadi99.onrender.com

## Important
The backend code supplied so far exposes:
- POST /api/upload — upload an actual media file
- POST /api/jobs — process an existing inputPath
- GET /api/jobs/:id — check job status
- GET /api/jobs/:id/download — download completed output

The frontend currently uses a pasted URL. A real URL-to-media download endpoint is still required before the Analyze/Download flow can actually download a YouTube/Instagram/etc. URL.

This frontend does not fake a successful backend download. Once that endpoint exists, the request can be connected in script.js.
