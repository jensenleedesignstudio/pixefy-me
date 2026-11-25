import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from "mediabunny";

const fps = 60;

// Render on a fixed clock. A slow GPU may take longer to save, but no frame is skipped.
export async function encodeReplay(canvas, duration, draw, signal) {
  const bitrate = Math.max(3_000_000, canvas.width * canvas.height * 20);
  const config = { width: canvas.width, height: canvas.height, bitrate, frameRate: fps };
  if (!await canEncodeVideo("avc", config)) return null;
  signal.throwIfAborted();
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new CanvasSource(canvas, { codec: "avc", bitrate });
  output.addVideoTrack(video, { frameRate: fps });
  try {
    await output.start();
    const count = Math.round(duration * fps / 1000);
    for (let frame = 0; frame < count; frame++) {
      signal.throwIfAborted();
      draw(duration * frame / (count - 1));
      await video.add(frame / fps, 1 / fps);
      if (frame % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    await output.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
  }
}
