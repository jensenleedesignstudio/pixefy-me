// One shared effect handles overlapping art and 3D requests without flicker.
const host = document.getElementById('generation-background');
const status = document.getElementById('generation-status');
const shaderHost = host.querySelector('.shader-host');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pending = new Map();
let sequence = 0;
let generationCount = 0;
let loadedModule;
let dispose;
let fadeTimer;
let readyTimer;
let visible = false;
let settled = false;

async function showRenderer() {
    if (!visible || motion.matches || document.hidden || dispose) return;
    try {
        loadedModule ||= import('./shader-background.js');
        const module = await loadedModule;
        if (visible && !motion.matches && !document.hidden && !dispose) {
            dispose = module.mountShaderBackground(shaderHost, { generation: generationCount });
            if (settled) dispose.settle?.(true);
        }
    } catch {
        // The static grain remains visible if the optional ripple renderer fails.
        loadedModule = undefined;
    }
}

function stopRenderer() {
    if (dispose) dispose();
    dispose = undefined;
}

function show(message) {
    clearTimeout(fadeTimer);
    clearTimeout(readyTimer);
    visible = true;
    host.classList.add('is-visible');
    status.hidden = false;
    status.textContent = message;
    showRenderer();
}

function hide() {
    settled = false;
    visible = false;
    host.classList.remove('is-visible');
    status.hidden = true;
    fadeTimer = setTimeout(stopRenderer, 350);
}

function pendingMessage() {
    return pending.size > 1 ? 'Creating artwork and 3D model…'
        : pending.values().next().value === 'model'
            ? 'Building your 3D model…' : 'Creating your character…';
}

export function beginGenerationEffect(kind) {
    const id = ++sequence;
    generationCount += 1;
    host.dataset.generation = String(generationCount);
    if (pending.size === 0) {
        settled = false;
        if (dispose?.restart) {
            dispose.restart(generationCount, !motion.matches && !document.hidden);
        } else {
            stopRenderer();
        }
    } else {
        // Concurrent requests share the same canvas; only future droplets change hue.
        dispose?.setGeneration?.(generationCount);
    }
    pending.set(id, kind);
    show(pendingMessage());
    let finished = false;
    return function finish(success = false) {
        if (finished) return;
        finished = true;
        pending.delete(id);
        if (pending.size) {
            show(pendingMessage());
        } else if (success) {
            settled = true;
            show(kind === 'model' ? 'Your 3D model is ready' : 'Your artwork is ready');
            // Let the ring dissolve into pixels before freezing the absorbed colours.
            dispose?.settle?.(motion.matches || document.hidden);
            readyTimer = setTimeout(() => { status.hidden = true; }, 1800);
        } else if (generationCount > 1) {
            // A failed later attempt must not wipe colours from previous generations.
            settled = true;
            dispose?.settle?.(true);
            status.hidden = true;
        } else {
            hide();
        }
    };
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) dispose?.pause?.();
    else {
        dispose?.resume?.();
        showRenderer();
    }
});
motion.addEventListener('change', () => {
    if (motion.matches) {
        if (settled) dispose?.settle?.(true);
        else dispose?.pause?.();
    }
    else {
        dispose?.resume?.();
        showRenderer();
    }
});
