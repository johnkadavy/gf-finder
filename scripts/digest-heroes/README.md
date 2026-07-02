# Digest hero images

Generators for the email digest hero illustrations in `public/digest/`. Every topic in `lib/digest-topics.ts` has a `heroImage` pointing at one of these PNGs (1120×630, rendered at 560px wide in the email).

## Two generators

**Neighborhood maps** — `mapgen.mjs` renders the neighborhood highlighted in accent orange on a flat map of the surrounding area, using real boundaries from `lib/nyc-neighborhoods.json`. Name resolution mirrors the app: custom zones (`lib/nyc-custom-zones.ts`) first, then geojson names, then NTA aliases (`lib/nyc-nta-aliases.ts`). Multi-NTA neighborhoods (Bushwick, Upper West Side) are merged; carve-out zones (NoMad out of Flatiron) are subtracted; custom-zone rectangles are clipped to land.

**Food / place illustrations** — `foodgen.mjs` holds the finished SVG source for every cuisine and place-type hero. To add a topic, copy the closest existing entry and edit shapes.

## Visual grammar (keep consistent)

Background `#F4F1E8` · ink `#1F1D1B` · accent `#FF7444` — exactly one accented detail per food image · gold `#E8A03C` · green `#4A7C59` · cream `#FFFDF6` · shadow `#E3DCCB`. Food images: ground-shadow ellipse near y=250, corner accent dots, steam curls only on hot food. Maps: no dots, water waves `#C9BFA4`, land `#EAE3D0`, borders `#D9D1BA`. No text in images — the email `alt` (topic label) carries meaning when images are blocked.

## Setup (one-time)

```bash
npm i -D @turf/union @turf/difference @turf/intersect @turf/helpers   # maps only
pip install cairosvg                                                   # rasterizer
```

## Generate

```bash
# a neighborhood map (name as it appears in geojson/aliases/custom zones)
node --experimental-strip-types scripts/digest-heroes/mapgen.mjs "Williamsburg" /tmp/heroes/williamsburg.svg

# all food/place illustrations
node scripts/digest-heroes/foodgen.mjs /tmp/heroes

# rasterize everything to email-ready PNGs
python3 scripts/digest-heroes/rasterize.py /tmp/heroes public/digest
```

Then add the topic to `lib/digest-topics.ts` with `heroImage: "/digest/<slug>.png"`.

## Gotchas

- `mapgen.mjs` needs Node ≥22.6 for `--experimental-strip-types` (it imports `nyc-custom-zones.ts` directly). On Node ≥23 the flag is on by default.
- If a neighborhood errors with `NO FEATURES`, the name doesn't match any geojson feature, alias value, or custom zone — check `lib/nyc-nta-aliases.ts` for the colloquial name the app uses.
- Keep PNGs under ~150KB; the map ones run 50–120KB. If one balloons, raise the simplify tolerance in `mapgen.mjs`.
