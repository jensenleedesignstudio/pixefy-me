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

async function showRenderer() {
    if (!visible || motion.matches || document.hidden || dispose) return;
    try {
        loadedModule ||= import('./shader-background.js');
        const module = await loadedModule;
        if (visible && !motion.matches && !document.hidden && !dispose) {
            dispose = module.mountShaderBackground(shaderHost);
        }
    } catch {
        // The CSS gradient remains usable if WebGL or the optional bundle fails.
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
            show(kind === 'model' ? 'Your 3D model is ready' : 'Your artwork is ready');
            readyTimer = setTimeout(hide, 1800);
        } else {
            hide();
        }
    };
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRenderer();
    else showRenderer();
});
motion.addEventListener('change', () => {
    if (motion.matches) stopRenderer();
    else showRenderer();
});

// A failed WebGL context must not affect uploads, drawing, or generation.
host.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stopRenderer();
}, true);
