// Render into large physical pixels, then enlarge without interpolation.
// A separate ink layer keeps each droplet's colour after its rings disappear.
export function mountShaderBackground(host, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.dataset.effect = 'pixel-ripples';
    canvas.dataset.phase = 'loading';
    let generation = options.generation || 1;
    canvas.dataset.generation = String(generation);
    canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
    const context = canvas.getContext('2d', { alpha: false });
    const ink = document.createElement('canvas');
    const inkContext = ink.getContext('2d', { alpha: false });
    if (!context || !inkContext) return () => {};
    host.appendChild(canvas);

    const pixelSize = 1;
    const palette = [[177, 132, 99], [136, 153, 124], [198, 163, 108], [157, 143, 167]];
    const positions = [[0.82, 0.74], [0.16, 0.82], [0.64, 0.12], [0.94, 0.38]];
    const ripples = [];
    let width = 1, height = 1, elapsed = 0, nextDrop = 650, drops = 0;
    let lastFrame, frame, paused = false, settled = false, disposed = false;
    let settling = false, settleElapsed = 0;
    const settleDuration = 1600;
    const clamp = value => Math.max(0, Math.min(1, value));
    const noise = seed => {
        const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return value - Math.floor(value);
    };

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

    function nextColour() {
        if (generation === 1) return palette[drops % palette.length];
        // Shift each new generation's hues while keeping muted saturation/lightness.
        const baseHue = [30, 100, 44, 285][drops % palette.length];
        const hue = (baseHue + (generation - 1) * 47) % 360;
        const saturation = 0.26;
        const lightness = 0.61;
        const amplitude = saturation * Math.min(lightness, 1 - lightness);
        const channel = offset => {
            const position = (offset + hue / 30) % 12;
            return Math.round(255 * (lightness - amplitude
                * Math.max(-1, Math.min(position - 3, 9 - position, 1))));
        };
        return [channel(0), channel(8), channel(4)];
    }

    function drop() {
        const position = positions[drops % positions.length];
        ripples.push({
            x: Math.min(0.97, Math.max(0.03, position[0] + (Math.random() - 0.5) * 0.08)),
            y: Math.min(0.97, Math.max(0.03, position[1] + (Math.random() - 0.5) * 0.08)),
            color: nextColour(), born: elapsed, duration: 8500,
            radius: Math.min(700, Math.max(240, Math.min(width, height) * 0.65)),
        });
        drops += 1;
    }

    function draw(time) {
        if (disposed || paused || settled) return;
        frame = requestAnimationFrame(draw);
        const delta = lastFrame === undefined ? 0 : time - lastFrame;
        if (lastFrame !== undefined && delta < 1000 / 60 - 1) return;
        lastFrame = time;
        const step = Math.min(delta, 100);
        // Slow the remaining wave while its edge dissolves; do not spawn more drops.
        elapsed += step * (settling ? 0.3 : 1);
        if (settling) settleElapsed += step;
        const transition = clamp(settleElapsed / settleDuration);
        if (!settling && elapsed >= nextDrop) {
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
            const absorption = step / 33.33 * (1 - transition) ** 2;
            const stain = inkContext.createRadialGradient(x, y, 0, x, y, radius);
            stain.addColorStop(0, tint(0.025 * absorption));
            stain.addColorStop(0.65, tint(0.012 * absorption));
            stain.addColorStop(1, tint(0));
            inkContext.fillStyle = stain;
            inkContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            rings.push({ x, y, radius, tint,
                breakup: Math.max(clamp((age - 0.6) / 0.4), transition),
                strength: Math.min(1, age / 0.07) * (1 - age) });
        }

        paintInk();
        for (const ring of rings) {
            for (const ratio of [0.9, 0.65]) {
                const strength = (ratio === 0.9 ? 0.48 : 0.2) * ring.strength;
                context.beginPath();
                context.arc(ring.x, ring.y, ring.radius * ratio, 0, Math.PI * 2);
                context.strokeStyle = ring.tint(strength * (1 - ring.breakup) ** 2);
                context.lineWidth = (ratio === 0.9 ? 10 : 7) * (1 - ring.breakup * 0.7);
                context.stroke();

                // Stable per-pixel seeds avoid flicker as the ring becomes drifting dust.
                const fragments = Math.min(180, Math.max(24, Math.round(ring.radius * ratio * 0.7)));
                const dustFade = Math.sin(Math.PI * ring.breakup);
                if (dustFade < 0.001) continue;
                for (let n = 0; n < fragments; n += 1) {
                    const seed = n + ring.x * 0.13 + ring.y * 0.17 + ratio * 100;
                    const angle = n / fragments * Math.PI * 2;
                    const spread = ring.breakup * (12 + noise(seed) * 32);
                    const distance = ring.radius * ratio + spread;
                    const x = ring.x + Math.cos(angle) * distance;
                    const y = ring.y + Math.sin(angle) * distance - ring.breakup * noise(seed + 5) * 12;
                    const size = Math.max(pixelSize, 2) * (0.75 + noise(seed + 2));
                    context.fillStyle = ring.tint(strength * dustFade * (0.35 + noise(seed + 1) * 0.65));
                    context.fillRect(Math.round(x / pixelSize) * pixelSize,
                        Math.round(y / pixelSize) * pixelSize, size, size);
                }
            }
        }
        if (settling && transition >= 1) finishSettle();
    }

    function finishSettle() {
        settled = true;
        settling = false;
        cancelAnimationFrame(frame);
        ripples.length = 0;
        paintInk();
        canvas.dataset.phase = 'settled';
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
    dispose.settle = (immediate = false) => {
        if (disposed || settled) return;
        if (immediate || ripples.length === 0) { finishSettle(); return; }
        if (settling) return;
        settling = true;
        paused = false;
        settleElapsed = 0;
        canvas.dataset.phase = 'dissolving';
        cancelAnimationFrame(frame);
        lastFrame = undefined;
        frame = requestAnimationFrame(draw);
    };
    dispose.setGeneration = nextGeneration => {
        generation = nextGeneration;
        canvas.dataset.generation = String(generation);
    };
    dispose.restart = (nextGeneration, animate = true) => {
        if (disposed) return;
        cancelAnimationFrame(frame);
        dispose.setGeneration(nextGeneration);
        // Keep the ink canvas intact: this is the saved background from earlier runs.
        ripples.length = 0;
        settled = false;
        settling = false;
        paused = !animate;
        settleElapsed = 0;
        lastFrame = undefined;
        nextDrop = elapsed + 350;
        canvas.dataset.phase = 'loading';
        paintInk();
        if (animate) frame = requestAnimationFrame(draw);
    };
    return dispose;
}
