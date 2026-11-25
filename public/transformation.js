const dialog = document.querySelector("#transformation");
const open = document.querySelector("#open-replay");
const screen = document.querySelector("#replay-screen");
const ctx = screen.getContext("2d");
const slider = document.querySelector("#replay-time");
const play = document.querySelector("#replay-play");
const save = document.querySelector("#replay-save");
const status = document.querySelector("#replay-status");
const duration = Number(slider.max);
const formats = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const format = window.MediaRecorder && screen.captureStream &&
  formats.find(type => MediaRecorder.isTypeSupported(type));
let source, frames, loading, raf, recording;

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  play.textContent = "play";
}
function controls(ready) {
  slider.disabled = play.disabled = !ready;
  save.disabled = !ready || !format;
  save.hidden = !format;
}
function abandonRecording() {
  if (!recording) return;
  const old = recording;
  recording = null;
  if (old.recorder.state !== "inactive") old.recorder.stop();
  old.stream.getTracks().forEach(track => track.stop());
}
function cancel() {
  loading?.abort();
  stop();
  abandonRecording();
}
export function setReplaySource(next) {
  cancel();
  if (dialog.open) dialog.close();
  frames = null;
  source = next;
  open.hidden = !source;
}

// Rasterize on an opaque square so fades also work for transparent sketches.
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
    return frame;
  } finally { URL.revokeObjectURL(url); }
}

function ease(t, start, end) {
  const x = Math.max(0, Math.min(1, (t - start) / (end - start)));
  return x * x * (3 - 2 * x);
}
function mix(a, b, weight) {
  ctx.drawImage(a, 0, 0);
  ctx.globalAlpha = weight;
  ctx.drawImage(b, 0, 0);
  ctx.globalAlpha = 1;
}
function sequence(images, progress) {
  const index = progress * (images.length - 1);
  mix(images[Math.floor(index)], images[Math.ceil(index)], index % 1);
}
function draw(ms) {
  const t = ms / duration;
  const { sketch, art, particles, turn } = frames;
  if (t < .40) mix(sketch, art, ease(t, .13, .33));
  else if (t < .52) mix(art, particles[0], ease(t, .40, .52));
  else if (t < .78) sequence(particles, ease(t, .52, .78));
  else if (t < .85) mix(particles.at(-1), turn[0], ease(t, .78, .85));
  else sequence(turn, ease(t, .85, .98));
  slider.value = ms;
  const stage = t < .23 ? "sketch" : t < .48 ? "artwork" : t < .82 ? "particles" : "3d model";
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
    if (!frames) {
      status.textContent = "preparing transformation…";
      const size = matchMedia("(max-width: 640px), (pointer: coarse)").matches ? 360 : 512;
      screen.width = screen.height = size;
      const { sketch, art, model } = source;
      const [first, second] = await Promise.all([fitImage(sketch, size), fitImage(art, size)]);
      job.signal.throwIfAborted();
      ctx.drawImage(first, 0, 0);
      const { buildReplayFrames } = await import("./inline-dust.js");
      job.signal.throwIfAborted();
      const baked = await buildReplayFrames(model, size, job.signal);
      job.signal.throwIfAborted();
      frames = { sketch: first, art: second, ...baked };
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

save.addEventListener("click", () => {
  if (!frames || !format || recording) return;
  stop();
  let stream;
  try {
    draw(0);
    stream = screen.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: format });
    const job = { recorder, stream };
    recording = job;
    controls(false);
    status.textContent = "saving six-second video…";
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      if (recording !== job) return;
      recording = null;
      controls(true);
      if (!chunks.length) { status.textContent = "video export failed. try again."; return; }
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pixefy-transformation." + (blob.type.includes("mp4") ? "mp4" : "webm");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "video ready";
    };
    recorder.onerror = () => {
      if (recording !== job) return;
      stop(); abandonRecording(); controls(true);
      status.textContent = "video export failed. try again.";
    };
    recorder.start();
    animate(0, () => recorder.stop());
  } catch {
    stream?.getTracks().forEach(track => track.stop());
    abandonRecording();
    controls(true);
    status.textContent = "video export is unavailable in this browser.";
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
