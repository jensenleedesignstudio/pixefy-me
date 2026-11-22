# Pixel ripple generation background

Generation starts with grainy paper. The first droplet appears after 650ms, then
another about every 1.25 seconds. Large physical pixels and nearest-neighbour
scaling produce stepped ring edges. A separate low-resolution ink canvas stores
translucent colour stains permanently as the rings expand.

When generation succeeds, the controller calls `settle()`: moving rings disappear,
the animation loop stops, and the accumulated pixel colours remain behind the
result. The ready message hides after 1.8 seconds without clearing the background.
A new generation disposes that canvas and starts again from uncoloured paper.
Failures clear the current effect. Overlapping requests settle only after the last
request completes. Hiding the tab pauses the renderer rather than losing its ink.
Resizing preserves the finished colours.

The renderer is custom Canvas 2D and never modifies the sketch or generated art.
Reduced-motion users get a static grain surface without starting the animation.
The source retains its existing filename/export for compatibility with the app.
Previous library dependencies remain installed, but this small bundle imports none
of them.

## Appearance settings

- `effects/src/shader-background.jsx`: `pixelSize` (currently 4 CSS pixels), palette,
  droplet positions, interval, radius, and absorption strength.
- `public/styles.css`: static grain in `#generation-background::after`.
- `public/generation-effects.js`: request lifecycle and completed-background state.

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
