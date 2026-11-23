# Pixel ripple generation background

Generation starts with grainy paper. The first droplet appears after 650ms, then
another about every 1.25 seconds. Large physical pixels and nearest-neighbour
scaling produce stepped ring edges. A separate low-resolution ink canvas stores
translucent colour stains permanently as the rings expand.

When generation succeeds, `settle()` begins a 1.6-second exit: no new droplets
spawn, existing rings slow and thin, then dissolve into small drifting pixels.
Their dust fades out before the loading animation stops, leaving the absorbed
colours behind the result. Each ripple also dissolves naturally near the end of its life. The ready message hides after 1.8 seconds without clearing the background.
Later generations reuse the same ink canvas instead of clearing it. An in-memory
counter increments for every art or 3D request; subsequent requests shift the
palette's hues and layer new droplets over the accumulated colours. Only the
first run starts from uncoloured paper. Refreshing the page resets this session.
Later failures preserve existing colours; a failed first attempt clears its effect. Overlapping requests settle only after the last
request completes. Hiding the tab pauses the renderer rather than losing its ink.
Resizing preserves the finished colours.

The renderer is custom Canvas 2D and never modifies the sketch or generated art.
Reduced-motion users get a static grain surface without starting the animation.
The source retains its existing filename/export for compatibility with the app.
Previous library dependencies remain installed, but this small bundle imports none
of them.

## Appearance settings

- `effects/src/shader-background.jsx`: `pixelSize`, palette, droplet positions,
  interval, radius, absorption strength, and `settleDuration` (currently 1600ms).
- `public/styles.css`: static grain in `#generation-background::after`.
- `public/generation-effects.js`: request lifecycle, `generationCount`, and retained
  completed-background state. The counter is also exposed as `data-generation`
  on the background host for inspection.

## Build and test

```sh
cd effects
npm ci
npm run build
npm test
```

Commit the rebuilt `public/shader-background.js` with source changes; Flask and
Vercel serve the checked-in bundle without needing a Node build step. Use the
“test generation effect (no credits)” button to preview the full loading and
completed-background behaviour without calling AI providers.

The renderer targets 60fps for smoother expansion. Reduced-motion changes bypass
the exit animation immediately and keep the accumulated colours static.

## Gentle waves after completion

After the 1.6-second dissolve finishes, the saved background rests for five seconds.
A soft wave then travels left to right over 2.8 seconds. Subsequent waves start
five seconds apart, leaving a short quiet interval between them. Only a narrow
band is displaced while a wave runs; the ink layer itself is never changed.
Between waves there is no animation frame loop, only one scheduled timer.

`waveInterval` and `waveDuration` in `effects/src/shader-background.jsx` control
these timings. Reduced motion cancels both an active wave and its timer. Hidden
tabs pause them; starting another generation cancels idle waves and returns to
colour-layering ripples on the existing background.
