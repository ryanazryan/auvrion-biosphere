# AB-WC-011 WebGIS Map Controls v6 — visibility fix

Basis: exact v5 GisMapCanvas.tsx assembled from the user's 2026-10-20 upload. GisWorkspace.tsx and dropdowns are untouched.

Changes:
- Zoom and Compass/Fit share a SINGLE absolutely positioned right-side stack. If zoom is rendered, other map controls are rendered in the same container.
- The compass keeps its normal icon appearance and remains clickable even when already facing north. It is disabled only until the real MapLibre map load completes.
- Fit remains visually distinct but disabled unless REAL approved observation coordinates and an approved REAL basemap exist. No synthetic markers or fake points.
- Legend remains a separate control and keeps its existing mobile/desktop positioning.

Install from repository root after backing up local GisMapCanvas.tsx:
  unzip -o AB-WC-011-Map-Controls-Visibility-v6.zip -d .

Run:
  npx biome check --write src/figma-operator/screens/operator/GisMapCanvas.tsx
  npm run lint
  npm run typecheck

Visual validation: in desktop and mobile, confirm zoom, compass, and fit are three pairs of buttons at top-right. Fit is disabled for zero approved positions. If zoom appears but compass is missing, check whether local file actually includes 'Orientasi dan pembingkaian peta' and restart the Next dev server / hard reload before diagnosing CSS.

The .mjs.map 404 is a missing OPTIONAL debug source map request, not the worker script. Do not change or edit vendor minified assets to silence it; main /vendor/maplibre/maplibre-gl-worker.mjs should load 200.
