const dialog = document.querySelector("#transformation");
const open = document.querySelector("#open-replay");
const poster = document.querySelector("#replay-screen");
const ctx = poster.getContext("2d");
const slider = document.querySelector("#replay-time");
const play = document.querySelector("#replay-play");
const save = document.querySelector("#replay-save");
const status = document.querySelector("#replay-status");
const duration = Number(slider.max);
const formats = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const format = window.MediaRecorder && poster.captureStream &&
  formats.find(type => MediaRecorder.isTypeSupported(type));
const canExport = Boolean(format || window.VideoEncoder);
let source, replay, loading, raf, recording;

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  play.textContent = "play";
}
function controls(ready) {
  slider.disabled = play.disabled = !ready;
  save.disabled = !ready || !canExport;
  save.hidden = !canExport;
}
function abandonRecording() {
  if (!recording) return;
  const old = recording;
  recording = null;
  old.controller.abort();
  if (old.recorder && old.recorder.state !== "inactive") old.recorder.stop();
  old.stream?.getTracks().forEach(track => track.stop());
}
function cancel() {
  loading?.abort();
  stop();
  abandonRecording();
  if (replay) {
    replay.canvas.replaceWith(poster);
    replay.dispose();
  }
  replay = null;
}
export function setReplaySource(next) {
  cancel();
  if (dialog.open) dialog.close();
  source = next;
  open.hidden = !source;
}

// Keep the source bounds so letterboxing does not count as part of the silhouette.
async function fitImage(blob, size) {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    image.src = url;
    await image.decode();
    const frame = document.createElement("canvas");
    frame.width = frame.height = size;
    const paint = frame.getContext("2d");
    paint.fillStyle = "#fdf5ec";
    paint.fillRect(0, 0, size, size);
    const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    paint.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    return { canvas: frame, bounds: [(size-w)/(2*size), (size-h)/(2*size), w/size, h/size] };
  } finally { URL.revokeObjectURL(url); }
}

function draw(ms) {
  const t = ms / duration;
  replay.draw(t);
  slider.value = ms;
  const stage = t < .24 ? "sketch" : t < .60 ? "artwork" : t < .83 ? "particles" : "3d model";
  slider.setAttribute("aria-valuetext", stage + ", " + (ms / 1000).toFixed(1) + " seconds");
  if (!recording && status.textContent !== stage) status.textContent = stage;
}

function animate(from, onEnd) {
  stop();
  const start = performance.now() - from;
  play.textContent = "pause";
  function frame(now) {
    const ms = Math.min(duration, Math.max(0, now - start));
    draw(ms);
    if (ms < duration) raf = requestAnimationFrame(frame);
    else { stop(); onEnd?.(); }
  }
  raf = requestAnimationFrame(frame);
}
open.addEventListener("click", async () => {
  if (!source || dialog.open) return;
  dialog.showModal();
  controls(false);
  stop();
  loading?.abort();
  const job = new AbortController();
  loading = job;
  try {
    if (!replay) {
      status.textContent = "preparing transformation…";
      const size = matchMedia("(max-width: 640px), (pointer: coarse)").matches ? 360 : 512;
      poster.width = poster.height = size;
      const { sketch, art, model } = source;
      const [first, second] = await Promise.all([fitImage(sketch, size), fitImage(art, size)]);
      job.signal.throwIfAborted();
      ctx.drawImage(first.canvas, 0, 0);
      const { buildReplay } = await import("./inline-dust.js");
      job.signal.throwIfAborted();
      const prepared = await buildReplay(first, second, model, size, job.signal);
      if (job.signal.aborted) { prepared.dispose(); return; }
      replay = prepared;
      replay.canvas.id = poster.id;
      replay.canvas.setAttribute("aria-label", poster.getAttribute("aria-label"));
      poster.replaceWith(replay.canvas);
    }
    draw(0);
    controls(true);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) animate(0);
  } catch (error) {
    if (!job.signal.aborted) {
      console.warn("Transformation replay unavailable", error);
      status.textContent = "couldn’t prepare this replay. close it to return to your model.";
    }
  }
});
dialog.addEventListener("close", () => { if (!dialog.open) cancel(); });
play.addEventListener("click", () => {
  if (raf) stop();
  else animate(Number(slider.value) >= duration ? 0 : Number(slider.value));
});
slider.addEventListener("input", () => { stop(); draw(Number(slider.value)); });

function downloadVideo(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pixefy-transformation." + (blob.type.includes("mp4") ? "mp4" : "webm");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Older browsers can still record the visible canvas in real time.
function recordLive(job) {
  draw(0);
  job.stream = replay.canvas.captureStream(60);
  const recorder = new MediaRecorder(job.stream, { mimeType: format, videoBitsPerSecond: 5_000_000 });
  job.recorder = recorder;
  return new Promise((resolve, reject) => {
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => reject(event.error);
    recorder.onstop = () => {
      if (chunks.length) resolve(new Blob(chunks, { type: recorder.mimeType }));
      else reject(new Error("Empty recording"));
    };
    recorder.start();
    animate(0, () => recorder.stop());
  });
}

save.addEventListener("click", async () => {
  if (!replay || !canExport || recording) return;
  stop();
  const job = { controller: new AbortController() };
  recording = job;
  controls(false);
  status.textContent = "saving video…";
  try {
    let blob;
    if (window.VideoEncoder) {
      try {
        const { encodeReplay } = await import("./replay-export.js");
        job.controller.signal.throwIfAborted();
        blob = await encodeReplay(replay.canvas, duration, draw, job.controller.signal);
      } catch (error) {
        if (job.controller.signal.aborted || !format) throw error;
      }
    }
    job.controller.signal.throwIfAborted();
    if (!blob && format) blob = await recordLive(job);
    job.controller.signal.throwIfAborted();
    if (!blob) throw new Error("No compatible video encoder");
    downloadVideo(blob);
    status.textContent = "video ready";
  } catch {
    if (recording === job) status.textContent = "video export failed. try again.";
  } finally {
    if (recording === job) {
      stop();
      abandonRecording();
      controls(true);
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden || !dialog.open) return;
  stop();
  if (recording) {
    abandonRecording(); controls(true);
    status.textContent = "export paused when you left the tab. select save video to restart.";
  }
});
