# Brand assets

The two supplied text briefs are the source of the design. During implementation the owner supplied `english logo.png` and `hindi logo.png` at the workspace root. They are preserved unchanged and copied, also unchanged, to `frontend/public/brand/source/logo-source-en.png` and `logo-source-hi.png`. The English source supplies the master icon for **both** final logos. Each language's original wordmark is cropped from its own source; the Hindi wordmark is not retyped.

`frontend/src/config/brand.ts` holds exact names, taglines, services, colour tokens, fonts, spacing and layout sizes. The UI uses Baloo 2 headings and Mukta text. Every illustrated shop and route is synthetic; the storefront signs do not endorse real businesses.

Run `npm run brand` (or `node scripts/brand/generate.mjs`) after installing dependencies to regenerate assets. The script creates eight 800×600 SVG storefronts, a 1200×700 village route illustration, three empty-state illustrations, a simple SVG icon, PNG logos, 16/32 favicon, PWA icons, a maskable icon, Apple touch icon and Hindi/English 1200×630 Open Graph images. Raster output uses `sharp`; only the source script and SVGs are manually edited.

## Processed original artwork and quality checks

`scripts/brand/source-crops.json` records the inspected source-pixel crop rectangles. The large empty margins and stray pixels outside the logo are cropped away. The supplied PNGs already contain transparent outer backgrounds; the script preserves that transparency, removes remaining near-white fringe conservatively, and clears isolated white remnants inside the wordmark holes. The cream details inside the icon remain intact. Both logos share the exact master bitmap, icon size, left margin, label region and 3:1 canvas. `brand.logoIsFallback` is `false` and `asset-report.json` records the original sources.

The generated `proof-cream.png`, `proof-white.png`, and `proof-green.png` were visually inspected. Edges are clean at display sizes and the Hindi strokes are preserved. The original textured green is retained, so its colour is intentionally not a flat match to the UI token. The original green wordmark has low contrast on a green background; use cream or white headers as specified. No clean automatic SVG trace can preserve this textured artwork faithfully, so the production logos remain high-resolution PNGs. The only SVG logo is the exact intentionally simple small-size icon from the kit. PNG wordmarks have natural language-dependent letter heights within a common layout; they are never stretched.

The header retains the simple SVG plus live Baloo 2 fallback if image loading fails. If the source files are absent on a later fresh checkout, the generation script produces explicitly labelled fallback assets and records that in the report, rather than pretending they are original wordmarks.

## Reprocessing or replacing source PNGs

1. Keep the unmodified originals at `frontend/public/brand/source/logo-source-en.png` and `logo-source-hi.png`.
2. If replacing those source files, inspect their dimensions and update `scripts/brand/source-crops.json` with exact source-pixel rectangles. It has this shape (replace each rectangle with observed coordinates):

```json
{
  "en": {
    "icon": { "left": 0, "top": 0, "width": 100, "height": 100 },
    "text": { "left": 100, "top": 0, "width": 300, "height": 100 }
  },
  "hi": { "text": { "left": 100, "top": 0, "width": 300, "height": 100 } }
}
```

3. Run the script. If both originals exist but crops are absent it stops with a useful error, preserving every original. It extracts only the English icon, reuses that exact bitmap for both languages, crops each wordmark, flood-fills the outer near-white background to transparency, and conservatively removes neutral edge fringe. Cream interior shapes are retained. It emits 3:1 canvases with 5% padding and a 1024-pixel master icon.
4. Inspect all three proof images at 100% and 200% and adjust crop rectangles if needed. Check cream interior areas and fine Hindi strokes. Keep `brand.logoIsFallback` aligned with `asset-report.json`.

The source PNGs are always read-only inputs. Manual crop coordinates are deliberate: guessing the layout of missing original artwork would risk damaging the logo.
