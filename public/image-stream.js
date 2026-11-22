// Network chunks do not necessarily match SSE messages or UTF-8 characters.
export async function consumeImageStream(response, onEvent) {
    if (!response.ok) {
        throw new Error((await response.text()) || `Generation failed (HTTP ${response.status}).`);
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        throw new Error('The server did not return an image stream. Please refresh and try again.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let ended = false;
    function processMessage(message) {
        const data = message.split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (!data) return false; // Ignore SSE comments/keepalives.
        let event;
        try { event = JSON.parse(data); }
        catch { throw new Error('The server sent an unreadable generation update.'); }
        if (!event || typeof event !== 'object') {
            throw new Error('The server sent an invalid generation update.');
        }
        if (event.type === 'error') {
            throw new Error(event.message || 'Image generation failed. Please try again.');
        }
        if (event.type === 'preview' || event.type === 'complete') {
            if (typeof event.image !== 'string' || !event.image) {
                throw new Error('An image update was missing its image data.');
            }
            onEvent(event);
            return event.type === 'complete';
        }
        return false;
    }
    try {
        while (true) {
            const { value, done } = await reader.read();
            ended = done;
            buffer += decoder.decode(value, { stream: !done });
            buffer = buffer.replace(/\r\n/g, '\n');
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const message = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (processMessage(message)) return;
            }
            if (done) {
                if (buffer.trim() && processMessage(buffer)) return;
                throw new Error('The connection ended before the final image arrived. Please try again.');
            }
        }
    } finally {
        if (!ended) await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export function imageFromBase64(encoded) {
    let binary;
    try { binary = atob(encoded); }
    catch { throw new Error('The server sent invalid image data.'); }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Blob([bytes], { type: 'image/png' });
}
