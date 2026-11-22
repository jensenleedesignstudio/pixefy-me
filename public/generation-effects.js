// One shared effect handles overlapping art and 3D requests without flicker.
const host = document.getElementById('generation-background');
const status = document.getElementById('generation-status');
const shaderHost = host.querySelector('.shader-host');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pending = new Map();
let sequence = 0;
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
            dispose = module.mountShaderBackground(shaderHost);
            if (settled) dispose.settle?.();
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
    if (pending.size === 0) {
        // A fresh generation starts with uncoloured paper, not the last result's ink.
        settled = false;
        stopRenderer();
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
            // Keep the absorbed pixel colours on screen, with no running animation.
            dispose?.settle?.();
            readyTimer = setTimeout(() => { status.hidden = true; }, 1800);
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
    if (motion.matches) dispose?.pause?.();
    else {
        dispose?.resume?.();
        showRenderer();
    }
});
