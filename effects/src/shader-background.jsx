// Render into large physical pixels, then enlarge without interpolation.
// A separate ink layer keeps each droplet's colour after its rings disappear.
export function mountShaderBackground(host) {
    const canvas = document.createElement('canvas');
    canvas.dataset.effect = 'pixel-ripples';
    canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
    const context = canvas.getContext('2d', { alpha: false });
    const ink = document.createElement('canvas');
    const inkContext = ink.getContext('2d', { alpha: false });
    if (!context || !inkContext) return () => {};
    host.appendChild(canvas);

    const pixelSize = 4;
    const palette = [[177, 132, 99], [136, 153, 124], [198, 163, 108], [157, 143, 167]];
    const positions = [[0.82, 0.74], [0.16, 0.82], [0.64, 0.12], [0.94, 0.38]];
    const ripples = [];
    let width = 1, height = 1, elapsed = 0, nextDrop = 650, drops = 0;
    let lastFrame, frame, paused = false, settled = false, disposed = false;

    function paintInk() {
        context.imageSmoothingEnabled = false;
        context.drawImage(ink, 0, 0, width, height);
    }

    function resize() {
        const previous = document.createElement('canvas');
        previous.width = ink.width;
        previous.height = ink.height;
        const previousContext = previous.getContext('2d');
        if (ink.width && ink.height) previousContext.drawImage(ink, 0, 0);
        width = Math.max(1, host.clientWidth);
        height = Math.max(1, host.clientHeight);
        canvas.width = ink.width = Math.max(1, Math.ceil(width / pixelSize));
        canvas.height = ink.height = Math.max(1, Math.ceil(height / pixelSize));
        inkContext.imageSmoothingEnabled = false;
        inkContext.fillStyle = '#fcfbf8';
        inkContext.fillRect(0, 0, ink.width, ink.height);
        if (drops && previous.width && previous.height) {
            inkContext.drawImage(previous, 0, 0, ink.width, ink.height);
        }
        const scaleX = canvas.width / width;
        const scaleY = canvas.height / height;
        inkContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        paintInk();
    }

    function drop() {
        const position = positions[drops % positions.length];
        ripples.push({
            x: Math.min(0.97, Math.max(0.03, position[0] + (Math.random() - 0.5) * 0.08)),
            y: Math.min(0.97, Math.max(0.03, position[1] + (Math.random() - 0.5) * 0.08)),
            color: palette[drops % palette.length], born: elapsed, duration: 8500,
            radius: Math.min(700, Math.max(240, Math.min(width, height) * 0.65)),
        });
        drops += 1;
    }

    function draw(time) {
        if (disposed || paused || settled) return;
        frame = requestAnimationFrame(draw);
        const delta = lastFrame === undefined ? 0 : time - lastFrame;
        if (lastFrame !== undefined && delta < 1000 / 30) return;
        lastFrame = time;
        elapsed += Math.min(delta, 100);
        if (elapsed >= nextDrop) {
            drop();
            nextDrop = elapsed + 1250;
        }

        const rings = [];
        for (let i = ripples.length - 1; i >= 0; i -= 1) {
            const ripple = ripples[i];
            const age = (elapsed - ripple.born) / ripple.duration;
            if (age >= 1) { ripples.splice(i, 1); continue; }
            const radius = 4 + ripple.radius * (1 - (1 - age) ** 1.5);
            const x = ripple.x * width, y = ripple.y * height;
            const tint = alpha => `rgba(${ripple.color.join(',')},${alpha})`;

            // Repeated translucent stamps stain the paper instead of clearing it.
            const absorption = Math.min(delta, 100) / 33.33;
            const stain = inkContext.createRadialGradient(x, y, 0, x, y, radius);
            stain.addColorStop(0, tint(0.025 * absorption));
            stain.addColorStop(0.65, tint(0.012 * absorption));
            stain.addColorStop(1, tint(0));
            inkContext.fillStyle = stain;
            inkContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            rings.push({ x, y, radius, tint, strength: Math.min(1, age / 0.07) * (1 - age) });
        }

        paintInk();
        for (const ring of rings) {
            for (const ratio of [0.9, 0.65]) {
                context.beginPath();
                context.arc(ring.x, ring.y, ring.radius * ratio, 0, Math.PI * 2);
                context.strokeStyle = ring.tint((ratio === 0.9 ? 0.48 : 0.2) * ring.strength);
                context.lineWidth = ratio === 0.9 ? 10 : 7;
                context.stroke();
            }
        }
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    frame = requestAnimationFrame(draw);

    function dispose() {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.remove();
        ripples.length = 0;
    }
    dispose.pause = () => { paused = true; cancelAnimationFrame(frame); };
    dispose.resume = () => {
        if (!disposed && !settled && paused) {
            paused = false; lastFrame = undefined;
            frame = requestAnimationFrame(draw);
        }
    };
    dispose.settle = () => {
        settled = true;
        cancelAnimationFrame(frame);
        ripples.length = 0;
        paintInk();
    };
    return dispose;
}
