// VideoHub frontend connected to the VideoHub backend.
const API_BASE_URL = "https://videohub-complete-2.onrender.com";

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.style.display = "none", 3500);
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function timeToSeconds(value) {
  if (!value) return undefined;
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN) || parts.length > 3) return undefined;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function secondsToTime(total) {
  total = Math.max(0, Math.round(total));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

async function api(path, options = {}) {
  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`Backend returned an invalid response (${response.status}).`);
  }

  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function analyze() {
  const url = $("videoUrl").value.trim();

  if (!url) return showToast("Please paste a video link first.");
  if (!isValidUrl(url)) return showToast("Please enter a valid http/https video link.");

  $("resultPanel").classList.remove("hidden");
  $("resultPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  $("analyzedUrl").textContent = url;
  $("previewTitle").textContent = "Analyzing...";
  $("previewMeta").textContent = "Please wait while the backend reads the media information.";
  $("previewThumb").textContent = "…";
  showToast("Analyzing link...");

  try {
    const data = await api("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url })
    });

    $("previewTitle").textContent = data.title || "Untitled video";
    $("previewMeta").textContent =
      [data.uploader, data.duration ? secondsToTime(data.duration) : null]
        .filter(Boolean).join(" · ") || "Media information loaded.";

    if (data.thumbnail) {
      $("previewThumb").style.backgroundImage = `url("${data.thumbnail.replace(/"/g, '\\"')}")`;
      $("previewThumb").style.backgroundSize = "cover";
      $("previewThumb").style.backgroundPosition = "center";
      $("previewThumb").textContent = "";
    } else {
      $("previewThumb").style.backgroundImage = "";
      $("previewThumb").textContent = "▶";
    }

    showToast("Analysis complete. Choose format and quality.");
  } catch (error) {
    $("previewTitle").textContent = "Analysis failed";
    $("previewMeta").textContent = error.message;
    $("previewThumb").style.backgroundImage = "";
    $("previewThumb").textContent = "!";
    showToast(error.message);
  }
}

async function downloadVideo() {
  const url = $("videoUrl").value.trim();
  const format = $("format").value;
  const quality = $("quality").value;
  const startSeconds = timeToSeconds($("startTime").value);
  const endSeconds = timeToSeconds($("endTime").value);

  if (!url || !isValidUrl(url)) return showToast("Please enter a valid video URL first.");
  if ($("startTime").value && startSeconds === undefined) return showToast("Start time format should be HH:MM:SS.");
  if ($("endTime").value && endSeconds === undefined) return showToast("End time format should be HH:MM:SS.");
  if (startSeconds !== undefined && endSeconds !== undefined && endSeconds <= startSeconds) {
    return showToast("End time must be greater than start time.");
  }

  const button = $("downloadBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "⏳ Processing...";

  try {
    showToast("Download job started...");
    const job = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ url, format, quality, startSeconds, endSeconds })
    });

    let finished;
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const status = await api(`/api/jobs/${encodeURIComponent(job.id)}`);
      if (status.state === "completed") {
        finished = status;
        break;
      }
      if (status.state === "failed" || status.state === "cancelled") {
        throw new Error(status.error || `Job ${status.state}.`);
      }
      button.textContent = `⏳ ${status.progress || 0}%`;
    }

    showToast("Ready — starting download...");
    const response = await fetch(API_BASE_URL + `/api/jobs/${encodeURIComponent(job.id)}/download`);
    if (!response.ok) {
      let message = `Download failed (${response.status}).`;
      try { const d = await response.json(); message = d.error || message; } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = finished.filename || `${format === "mp3" ? "videohub" : "video"}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    saveHistory(finished.title || "Video", format);
    showToast("Download started.");
  } catch (error) {
    showToast(error.message || "Download failed.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function resetResult() {
  $("resultPanel").classList.add("hidden");
  $("videoUrl").value = "";
  $("startTime").value = "";
  $("endTime").value = "";
  $("durationText").textContent = "Duration: —";
  $("previewThumb").style.backgroundImage = "";
  $("previewThumb").textContent = "▶";
  $("previewTitle").textContent = "Video preview";
  $("previewMeta").textContent = "Analyze a link to load title, thumbnail and duration.";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateDuration() {
  const start = timeToSeconds($("startTime").value);
  const end = timeToSeconds($("endTime").value);
  $("durationText").textContent =
    start !== undefined && end !== undefined && end > start
      ? `Duration: ${secondsToTime(end - start)}`
      : "Duration: —";
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem("videohub_history") || "[]");
  const list = $("historyList");
  if (!history.length) {
    list.innerHTML = `<div class="history-item"><div class="history-left"><div class="history-icon">⌁</div><div><div class="history-title">No downloads yet</div><div class="history-meta">Completed downloads will appear here.</div></div></div></div>`;
    return;
  }
  list.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-left">
        <div class="history-icon">${item.format === "mp3" ? "♫" : "▶"}</div>
        <div>
          <div class="history-title">${escapeHtml(item.title)}</div>
          <div class="history-meta">${item.format.toUpperCase()} · ${new Date(item.time).toLocaleString()}</div>
        </div>
      </div>
      <span class="status-pill">✓</span>
    </div>`).join("");
}

function saveHistory(title, format) {
  const history = JSON.parse(localStorage.getItem("videohub_history") || "[]");
  history.unshift({ title, format, time: Date.now() });
  localStorage.setItem("videohub_history", JSON.stringify(history.slice(0, 20)));
  loadHistory();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

$("analyzeForm").addEventListener("submit", event => {
  event.preventDefault();
  analyze();
});
$("downloadBtn").addEventListener("click", downloadVideo);
$("resetBtn").addEventListener("click", resetResult);
$("clearTrimBtn").addEventListener("click", () => {
  $("startTime").value = "";
  $("endTime").value = "";
  updateDuration();
});
$("startTime").addEventListener("input", updateDuration);
$("endTime").addEventListener("input", updateDuration);
$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("videohub_theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("videohub_theme") === "dark") document.body.classList.add("dark");
$("clearHistoryBtn").addEventListener("click", () => {
  localStorage.removeItem("videohub_history");
  loadHistory();
  showToast("Download history cleared.");
});
document.querySelectorAll(".tool-card").forEach(button => {
  button.addEventListener("click", () => {
    document.getElementById("downloader").scrollIntoView({ behavior: "smooth" });
    showToast(`${button.dataset.tool} selected. Choose a media link to continue.`);
  });
});
$("premiumBtn").addEventListener("click", () => showToast("Premium section is ready for your future payment integration."));
loadHistory();
window.analyze = analyze;
window.downloadVideo = downloadVideo;
