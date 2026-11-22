# Streaming artwork previews

Generate Art now posts the canvas PNG and instructions to `/generate-stream`.
Flask requests `stream=True, partial_images=3` and forwards OpenAI's partial and
completed image events as Server-Sent Events. A generation may complete without
all three partial previews. The browser uses a streaming `fetch` response (not
EventSource, because this request includes a POST body and file upload).

`public/image-stream.js` assembles complete SSE messages across arbitrary network
chunks and decodes their JSON. Partial images update only the artwork preview.
Only a completed image becomes downloadable and eligible for 3D generation.
Temporary object URLs are revoked to avoid accumulating image memory.

The previous completed artwork/download is preserved during a request. Errors,
missing final images, and interrupted streams restore it. Generation controls and
the ShaderGradient effect recover in `finally`, including when the canvas export
fails. A still-running 3D request keeps its button disabled.

## Files to learn from

- `app.py`: prompt helper, streaming API call, and error events.
- `public/image-stream.js`: streaming response parser and base64-to-Blob conversion.
- `public/index.html`: preview updates, final-result ownership, and UI cleanup.

## Offline checks

```sh
.venv/bin/python -B -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/image-stream.test.mjs
node --test effects/tests/generation-effects.test.mjs
```

These use mocked provider events and make no paid API calls. Browser integration
was also checked with a temporary mock server: previews, completion, errors,
truncated streams, restored downloads, and the final-image 3D handoff.

## Live check

Restart Flask, refresh the app, draw, and press Generate Art. This calls OpenAI and
uses API credits. The backend requests up to three previews; the provider controls
when and how many arrive. Verify the chosen model's streaming support and your
Vercel deployment's timeouts/stream delivery with a real request before claiming
hosted end-to-end streaming is verified. The old `/generate` route remains for
compatibility; the UI uses `/generate-stream`.

Reference: https://developers.openai.com/api/docs/guides/image-generation
