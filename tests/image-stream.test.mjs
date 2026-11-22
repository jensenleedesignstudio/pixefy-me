import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const code = await readFile(new URL('../public/image-stream.js', import.meta.url), 'utf8');
const { consumeImageStream, imageFromBase64 } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const message = (type, details = {}) => `data: ${JSON.stringify({ type, ...details })}\n\n`;

function response(text, byteChunks = false) {
    const bytes = new TextEncoder().encode(text);
    return new Response(new ReadableStream({ start(controller) {
        if (byteChunks) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('handles UTF-8, CRLF, and SSE boundaries split between network chunks', async () => {
    const updates = [];
    const data = ': keepalive\n\n' + message('status', { message: 'Creating…' })
        + message('preview', { image: 'cHJldmlldw==' })
        + message('complete', { image: 'ZmluYWw=' });
    await consumeImageStream(response(data.replaceAll('\n', '\r\n'), true), e => updates.push(e));
    assert.deepEqual(updates.map(e => e.type), ['preview', 'complete']);
});

test('final image is valid without partial previews or a trailing separator', async () => {
    const updates = [];
    await consumeImageStream(response(message('complete', { image: 'ZmluYWw=' }).trimEnd()), e => updates.push(e));
    assert.equal(updates.length, 1);
});

test('provider errors and incomplete streams reject instead of publishing a partial result', async () => {
    await assert.rejects(consumeImageStream(response(message('error', { message: 'Out of credits' })), () => {}), /Out of credits/);
    await assert.rejects(consumeImageStream(response(message('preview', { image: 'eA==' })), () => {}), /before the final image/);
});

test('rejects malformed events, missing images, and incorrect HTTP responses', async () => {
    await assert.rejects(consumeImageStream(response('data: invalid\n\n'), () => {}), /unreadable/);
    await assert.rejects(consumeImageStream(response(message('complete')), () => {}), /missing/);
    await assert.rejects(consumeImageStream(new Response('No sketch', { status: 400 }), () => {}), /No sketch/);
    await assert.rejects(consumeImageStream(new Response('<html>Error</html>'), () => {}), /did not return an image stream/);
});

test('converts final base64 to a PNG blob and rejects corrupt base64', async () => {
    const blob = imageFromBase64('aGVsbG8=');
    assert.equal(blob.type, 'image/png');
    assert.equal(await blob.text(), 'hello');
    assert.throws(() => imageFromBase64('!invalid!'), /invalid image data/);
});
