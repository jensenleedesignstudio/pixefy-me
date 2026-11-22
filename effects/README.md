# Generation background

The app lazily loads the actual `@shadergradient/react` renderer while generating
artwork or a 3D model. The renderer owns a decorative fixed background only;
it never draws into or replaces the sketch canvas.

`public/generation-effects.js` tracks overlapping requests and shows a ready state
for 1.8 seconds after success. Failure clears the effect. The renderer unmounts
after fading out, when the tab is hidden, or when reduced motion is requested.
Reduced motion uses the static CSS gradient. The CSS background is also the
fallback for unavailable WebGL or a failed bundle. An error boundary protects the
rest of the interface from renderer failures.

## Edit and rebuild

From the project root:

```sh
cd effects
npm ci
npm run build
npm test
```

The generated `../public/shader-background.js` bundle is checked in, so Flask and
Vercel can serve it without a Node build step. Include the rebuilt bundle whenever
you change `src/shader-background.jsx`. The visual renderer is about 1.1 MB before
HTTP compression and is downloaded only when generation starts.

- `effects/src/shader-background.jsx`: renderer and warm palette settings.
- `public/generation-effects.js`: lifecycle and status messages.
- `public/index.html`: generation hooks.
- `public/styles.css`: layering, static fallback, and reduced-motion styling.

No backend changes or new Python dependencies are required.

Reference: https://github.com/ruucm/shadergradient
