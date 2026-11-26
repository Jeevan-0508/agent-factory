# Council of Entities opening

The Council of Entities is an optional fictional cinematic opening layered over the static dashboard. It is a presentation surface, not a runtime, governance, provider, or agent-execution change. The legacy `#divine-council` route remains supported, and `#council-of-entities` is accepted as a friendly alias.

## Behavior

- The production opening runs for approximately 23 seconds: cosmic awakening (0–4s), chamber approach (4–8s), representative close-ups (8–14s), full council assembly (14–19s), convergence (19–23s), then the interactive chamber.
- The opening appears on the first visit to the dashboard root with no hash route.
- Direct routes such as `#overview` and `#agents` bypass it.
- The permanent navigation item is labelled `Council of Entities` while the underlying view key remains `divine-council` for compatibility.
- `Skip intro` moves directly to the interactive chamber.
- `ENTER THE FACTORY` returns to the existing dashboard.
- The permanent `Council of Entities` navigation item replays the experience.
- The seen preference is stored as `agent-factory-divine-council-seen` in local storage.
- Audio is muted by default. The optional synthesized ambience only starts after an explicit user click.

## Rendering and fallback

The dynamically imported module at `dashboard/divine-council/divine-council.js` uses a small native WebGL renderer for procedural particles, perspective points, a restrained celestial ring, camera rotation, and zoom. The supplied clean council artwork is the primary environment. Entity reveals are abstract HTML/WebGL signal beacons over ensemble framing; there are no deity portraits, sacred symbols, rigged character models, or claims about exact figures in the artwork.

The supplied council artwork is used as atmospheric imagery. Catalog mythology values are read from `catalog/roles.json` to derive the family ribbon. The visible reading rule makes clear that cultural references are navigation labels, not identity, capability, authority, or endorsement claims.

The module provides:

- reduced-motion mode, which settles immediately into the chamber;
- a lower-particle mode for constrained devices or data-saving connections;
- a non-WebGL fallback with the council artwork and normal DOM controls;
- mobile-specific layout and no horizontal overflow;
- a failure-isolated dynamic import so the dashboard remains usable if the cinematic cannot load.

## Asset note

The runtime uses only `council-clean.webp` from `AGENT-FACTORY-Council-of-Entities.zip`. `title-reference.webp` is reference-only and is not loaded by the application. The manifest identifies the artwork as AI-generated fictional fantasy entities and flat images, not 3D models.

## Verification

The focused browser coverage is in `tests/e2e/divine-council.spec.mjs` and checks first visit, old and new routes, skip, enter, replay, reduced motion, mobile layout, clean-asset loading, failed WebGL fallback, failed requests, page errors, and deterministic scene captures. The test-only `window.__DIVINE_COUNCIL_TIMELINE_MS__` hook can shorten the timeline for repeatable browser assertions; production remains 23 seconds.

```text
npm run test:e2e -- --project=chromium --workers=1 tests/e2e/divine-council.spec.mjs
npm run test:e2e:production
```
