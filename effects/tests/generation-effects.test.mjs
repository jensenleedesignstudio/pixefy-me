import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('generation background handles completion, overlap, failure, and reduced motion', async () => {
    const original = { document: globalThis.document, window: globalThis.window,
        setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    const classes = new Set();
    const host = { dataset: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
        querySelector: () => ({}), addEventListener() {} };
    const status = { hidden: true, textContent: '' };
    const timers = new Map(); let timerId = 0;
    globalThis.document = { hidden: false, addEventListener() {},
        getElementById: id => id === 'generation-background' ? host : status };
    globalThis.window = { matchMedia: () => ({ matches: true, addEventListener() {} }) };
    globalThis.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
    globalThis.clearTimeout = id => timers.delete(id);
    try {
        const source = await readFile(new URL('../../public/generation-effects.js', import.meta.url), 'utf8');
        const { beginGenerationEffect } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
        const art = beginGenerationEffect('art');
        assert.equal(status.textContent, 'Creating your character…');
        assert(classes.has('is-visible'));
        assert.equal(host.dataset.generation, '1');
        const model = beginGenerationEffect('model');
        assert.equal(host.dataset.generation, '2');
        assert.equal(status.textContent, 'Creating artwork and 3D model…');
        art(true);
        assert.equal(status.textContent, 'Building your 3D model…');
        art(false); // A fetch's finally must not finish the same request twice.
        assert.equal(status.textContent, 'Building your 3D model…');
        model(true);
        assert.equal(status.textContent, 'Your 3D model is ready');
        assert.equal(status.hidden, false);
        const ready = [...timers.values()].find(t => t.delay === 1800);
        ready.fn();
        assert.equal(status.hidden, true);
        assert(classes.has('is-visible')); // The finished pixel background remains.
        const failed = beginGenerationEffect('art');
        failed(false);
        assert.equal(status.hidden, true);
        assert(classes.has('is-visible')); // Later failures preserve the accumulated background.
        const first = beginGenerationEffect('model');
        const second = beginGenerationEffect('art');
        first(false);
        assert.equal(status.textContent, 'Creating your character…');
        second(true);
        assert.equal(status.textContent, 'Your artwork is ready');
    } finally {
        Object.assign(globalThis, original);
    }
});
