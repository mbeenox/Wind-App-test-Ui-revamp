# Wind Load Suite — Session Handoff

## Live App
https://wind-load-suite-3.vercel.app/

## GitHub Repo
https://github.com/mbeenox/Wind-Load-Suite-3

## Stack
- React 18 + Vite (no TypeScript)
- Tailwind CSS via CDN (in index.html — NOT npm installed)
- Leaflet via CDN (in index.html)
- jsPDF + jspdf-autotable (npm, for WSS PDF report AND Wind Calc PDF report)
- Vercel deployment (GitHub auto-deploy on push to main)
- `api/proxy.js` — ESM serverless function, CORS proxy for all WSS API calls

## Repo Structure
```
Wind-Load-Suite-3/
├── api/
│   └── proxy.js                    ← Vercel serverless CORS proxy (ESM, export default)
├── src/
│   ├── main.jsx                    ← React root mount, imports WindSuiteApp
│   ├── WindSuiteApp.jsx            ← Root component, owns wssData + sideTab + ALL lifted WSS state
│   ├── calcCore.js                 ← All pure JS: constants, helpers, Kzt, G, GCp tables,
│   │                                  all api* calc engines, validate (~2,036 lines)
│   ├── uiPrimitives.jsx            ← Shared UI components + DiagramPane (see below)
│   ├── WindCalcInputs.jsx          ← Main calculator component: all state, auto-calc useEffect,
│   │                                  sidebar inputs, all 7 tab panels, Save/Open/Print buttons
│   ├── windReport.js               ← Wind Calc PDF generator
│   ├── diagrams/                   ← Reference diagram images (Vite asset imports)
│   │   ├── normalToRidge.png       ← MWFRS Dir: Wind Normal to Ridge isometric (Gemini generated)
│   │   ├── parallelToRidge.png     ← MWFRS Dir: Wind Parallel to Ridge isometric (Gemini generated)
│   │   ├── typicalLoading.png      ← MWFRS Dir: Typical Wind Loading flat-roof isometric (Gemini)
│   │   ├── escarpment.png          ← Kzt: Escarpment figure (ASCE reference)
│   │   ├── ridgeHill.png           ← Kzt: 2D Ridge or 3D Axisymmetrical Hill (ASCE reference)
│   │   ├── lrLoadCases705.png      ← MWFRS LR: Basic Load Cases — ASCE 7-05
│   │   │                              ⚠️ Actually JPEG data with .png extension (upload artifact)
│   │   │                              Vite/browsers handle it correctly. Don't run pngquant on it.
│   │   └── lrLoadCases710to722.png ← MWFRS LR: Basic Load Cases — ASCE 7-10 to 7-22
│   └── wss/
│       ├── wssApi.js               ← WSS_PROXY, wssFetch, wssGeocode, all 8 hazard fetch fns
│       ├── wssReport.js            ← jsPDF report: wssPdfFmt, sectionHeader, wssGeneratePDF
│       └── WSSLookup.jsx           ← WSS UI — controlled component (state lifted to parent)
├── index.html                      ← Tailwind CDN + Leaflet CDN scripts here
├── package.json                    ← "type": "module", react/react-dom/jspdf/vite
├── vite.config.js                  ← standard @vitejs/plugin-react config
└── vercel.json                     ← SPA rewrite rules only, no functions block
```

---

## Architecture by File

### WindSuiteApp.jsx — Root
Owns: `wssData`, `sideTab`, and all lifted WSS state (13 state variables bundled into
`wssState` object). Passes `wssState` and `onWssResult` down to `WindCalcInputs`.

### WindCalcInputs.jsx — Main Calculator Component
**Props:** `{ wssData, wssState, sideTab, onSideTab, onWssResult }`

**Key state:** `proj` (projectName, jobNumber, code_version, V_mph, exposure, enclosure,
risk_category), `geo` (L/B/h, roof type, all geometry fields), `kztIn`, `gustIn`,
`extraHeights`, `wallRows`, `tab` + sub-tabs, result states (qzR, dirR, lrR, ccR, elevR,
obR, rwR, owR), `wssLocked`/`wssOverridden`, `printOpen`/`printTabs`

**Layout:** Outer flex row: left = scrollable content (`flex:1, minWidth:0`),
right = `DiagramPane` (shown for `dir` and `lr` tabs; returns `null` for all others).

**Imports from `./diagrams/` (Kzt inline diagrams only — LR/Dir images live in uiPrimitives):**
```js
import kztEscarpmentImg from './diagrams/escarpment.png';
import kztRidgeHillImg  from './diagrams/ridgeHill.png';
```

**DiagramPane call:**
```jsx
<DiagramPane tab={tab} dirSub={dirSub} codeVer={proj.code_version} />
```

**Kzt inline diagrams (Qz tab):**
- Rendered inline inside the Qz results scroll area, below the Kz/qz table
- Side-by-side layout: `display:flex, flexWrap:wrap`, each card `flex: 1 1 260px`
- Conditional render: `{kztIn.topo_type !== "flat" && <div>...}` — hidden when site is flat
- Two cards: "Escarpment" | "2D Ridge or 3D Axisymmetrical Hill"
- Card headers: 12px monospace uppercase; section label: 11px

### calcCore.js — Engineering Logic

**tcOf(cv, exp)** — terrain constants. Exposure B: `{ a:7, zg:1200, zm:15 }` for all
code versions. `zm=30` for Ch.28 LR handled via `zmOverride` in `compQz`.

**compQz(V, exp, z, kd, ke, cv, kzt, iw, zmOverride)** — optional `zmOverride` replaces
`tc.zm` when provided.

**apiLR** — `zmLR = exposure === "B" ? 30 : null` (Ch.28, all editions)

**apiCC** — `zmCC = (cv === "7-05" || cv === "7-10") && exposure === "B" ? 30 : null`

**gcpRoof_hgt60** — Zones 1/2/3 positive branch returns 0 (suction-only per Fig 30.4-1).
Zone 1p retains its positive GCp curve.

**isKdAtPressure flags:**
- `apiDir`: `code_version === "7-05" || code_version === "7-10"` → strips Kd from display qh
- `apiCC`: `code_version === "7-05" || code_version === "7-10"` → strips Kd from display qh
- For 7-22, Kd is still baked into compQz output but the display label says "Kd·qh"
  (known display-convention issue — end pressures unaffected, display-only)

### uiPrimitives.jsx — Shared UI

**Imports (top of file — all must stay at top, never mid-file):**
```js
import { useState, useRef } from "react";   // useRef required for LR zoom/pan
import { ZMETA, r2 } from './calcCore.js';
import typicalLoadingImg        from './diagrams/typicalLoading.png';
import normalToRidgeImg         from './diagrams/normalToRidge.png';
import parallelToRidgeImg       from './diagrams/parallelToRidge.png';
import lrLoadCases705Img        from './diagrams/lrLoadCases705.png';
import lrLoadCases710to722Img   from './diagrams/lrLoadCases710to722.png';
```

**Exported components:** `Psf`, `Field`, `NInput`, `Sel`, `Divider`, `Chip`, `Acc`,
`STabs` (**dead code** — unused), `TRow`, `THead`, `CCMatrix`, `WallProfile`, `DirTab`,
`DiagramPane`

**Dead helper functions (still in file, unused — safe to remove):**
`ob()`, `pts()`, `mkArrow()`, `HatchPattern`, `IsoLabel`
These were used by the original SVG diagram components. All SVGs have since been
replaced with image-based components. Remove when convenient.

**Internal diagram components (not exported):**

`DiagNormalToRidge()` — `<img src={normalToRidgeImg}>` on white `#fff` background, 8px padding.

`DiagParallelToRidge()` — `<img src={parallelToRidgeImg}>` same pattern.

`DiagTypicalLoading()` — `<img src={typicalLoadingImg}>` same pattern.

`DiagLRLoadCases({ codeVer })`:
- `is705 = codeVer === "7-05"` selects image and note text
- **Zoom/pan interaction:**
  - `SCALES = [1, 2, 3]` — click cycles through
  - `transformOrigin` set to click point (% of container) so zoom centers on click
  - Drag-to-pan while zoomed via `window` mousemove/mouseup listeners
  - `dragging.current` ref prevents click handler firing after a drag
  - `overflow: hidden` on container keeps zoom inside panel bounds
  - Zoom badge (`2×`/`3×`) bottom-right while zoomed; "click to zoom" hint at 1×
  - Smooth CSS transition only on return to 1× (`transition: "transform 0.25s ease"`)
- Edition note below image: body text `#94a3b8` (10px), exception text `#64748b`
- 7-05 note: torsion = 25% of Zones 1–4; exception for 1-story h≤30, light-frame, flexible diaphragm
- 7-10/7-16/7-22 note: torsion = 25% of Zones 1–6; same exception language

**`DiagramPane({ tab, dirSub, codeVer })`** — exported. Returns `null` for any tab
other than `"dir"` or `"lr"`.

```
tab === "dir" → Dir pane:
  flex: "0 0 40%", minWidth: 260px, maxWidth: 520px
  Sticky header: "REFERENCE DIAGRAMS — MWFRS CH. 27" (13px IBM Plex Sans uppercase)
  3 image cards stacked vertically, each with 12px monospace uppercase label:
    • "WIND NORMAL TO RIDGE"    — highlighted sky-blue when dirSub === "normal"
    • "WIND PARALLEL TO RIDGE"  — highlighted sky-blue when dirSub === "parallel"
    • "TYPICAL WIND LOADING"    — always neutral (#475569)

tab === "lr"  → LR pane:
  flex: "0 0 60%", minWidth: 360px, maxWidth: 780px
  (Intentionally 60% — load case diagrams have more detail than Dir diagrams)
  Sticky header: "LOAD CASES DIAGRAM" (13px IBM Plex Sans uppercase)
  1 card: label = "BASIC LOAD CASES — ASCE 7-05" or "ASCE 7-10 TO 7-22"
  Contains DiagLRLoadCases (zoom/pan + torsion note)
```

### windReport.js — PDF Generator
**qhLabel(code_version)** helper — `"Kd·qh"` for 7-22, `"qh"` for all others.

### wss/WSSLookup.jsx — Controlled WSS Component
Single "↓ PDF Report" button in green banner (bottom duplicate removed in prior session).

---

## Data Flow: Save / Load (.wls)
```
handleSave()  →  JSON.stringify({ proj, geo, kztIn, gustIn, extraHeights, wallRows,
                                   useAltCC, wssLocked, wssOverridden, wssData,
                                   wssState: { address, lat, lon, locMode, standard,
                                               riskCategory, siteClass, resolvedAddr,
                                               resolvedLat, resolvedLon, siteElevFt,
                                               results, statuses } })
                 →  download WindCalc_YYYY-MM-DD.wls

handleLoad()  →  confirm dialog
              →  JSON.parse + sanitize
              →  restore: proj, geo, kztIn, gustIn, extraHeights, wallRows, useAltCC
              →  restore: wssLocked, wssOverridden
              →  restore: all wssState fields via wssState.set* callbacks
              →  set loadingFromFile.current = true
              →  onWssResult(d.wssData)  [triggers wssData useEffect, bails early via ref]
```

## Data Flow: WSS → Wind Inputs
1. User enters address, selects ASCE standard + RC + site class, clicks "Run Hazard Lookup"
2. `handleRun()` geocodes, fires all 8 hazard fetches
3. After resolve: calls `onWindResult({ V_mph, risk_category, code_version })`
4. Root's `handleWssResult` sets `wssData` state
5. `WindCalcInputs` useEffect auto-populates proj fields (skipped during file load)
6. Fields show grayed with "🔗 From WSS Lookup" badge; "Edit manually" unlocks them

## CORS Proxy
All WSS API calls go through `/api/proxy?target=<encoded_url>`.
Allowed domains: earthquake.usgs.gov, gis.asce.org, hazards.fema.gov,
hdsc.nws.noaa.gov, nominatim.openstreetmap.org, geocoding.geo.census.gov

---

## Key Conventions
- Internal standard values: `"7-22"`, `"7-16"`, `"7-10"`, `"7-05"` — never change
- Display labels: `ASCE ${standard}` — NOT `ASCE 7-${standard}`
- qh label: `code_version === "7-22" ? "Kd·qh" : "qh"` — 7-22 only gets Kd·qh prefix
- Tailwind CDN only — no tailwind.config.js, no npm install, no PostCSS
- `package.json` has `"type": "module"` — proxy.js must use ESM `export default`
- NO `functions` block in vercel.json
- esbuild JSX rule: never put closing tags on same line as ternary/&& operators
- `renderWindPanel()` exists to avoid esbuild multiline JSX parse errors
- Diagram images live in `src/diagrams/`, imported at the TOP of the file via Vite
  asset pipeline — never mid-file imports (ESBuild will error)
- PNG preferred for line-art diagrams; isometric building images are Gemini-generated
  JPEG renders stored as .png — could be .jpg if size ever matters
- Push all related file changes in one commit to avoid broken intermediate deploys
- **Verify against ASCE 7 standard before concluding Struware is wrong**

---

## Engineering Decisions & Verified Fixes (cumulative)

### Exposure B Kz Constants — No Code Change Needed
Struware CS2024 uses wrong constants for 7-22 Exposure B:
- Struware: α=7.5, zg=1660.7 ft (Table 26.11-1 gust factor — wrong table)
- Our app: a=7.0, zg=1200 ft (Table 26.10-1 Kz power-law — correct)
- Impact: Struware underestimates Kd·qh ~3–5% for taller buildings. Our app is correct.

### C&C Positive Roof Pressures — h>60 Bug (calcCore.js — fixed)
`gcpRoof_hgt60()` was returning positive GCp for roof Zones 1/2/3. These are
suction-only in Fig 30.4-1. Fix returns `0` for Zones 1/2/3 positive branch; Zone 1p
retains its positive curve. Affects all editions for h>60 standard procedure.

### C&C zm Edition-Aware Fix (calcCore.js — fixed)
```js
const zmCC = (cv === "7-05" || cv === "7-10") && exposure === "B" ? 30 : null;
```
- 7-05/7-10: zm=30 per Table 30.3-1 Note 1 / Fig 6-3 footnote
- 7-16/7-22: zm=15 (Table 26.10-1 asterisk footnote = Ch.28 only, not Ch.30)

### Proven Struware Bugs (our app correct)
- 7-22 Exposure B Kz: Struware uses Table 26.11-1 gust factor constants (wrong table)

### Confirmed Struware Correct (we fixed our app to match)
- C&C zm=30 for 7-05/7-10 Exposure B (Table 30.3-1 Note 1)
- C&C zm=15 for 7-16/7-22 Exposure B (Table 26.10-1 footnote = Ch.28 only)

---

## Known Issues / Pending Work

### Engineering (higher priority)
- **7-22 qh display**: `compQz` always bakes Kd into qz for all editions. For 7-22,
  qh should display WITHOUT Kd (pure velocity pressure), with Kd·qh shown separately.
  End pressures are unaffected — display-only. Fix requires refactoring `compQz` to
  exclude Kd, then each `api*` function applies Kd explicitly.
- **7-05 C&C zm=30**: Verified indirectly via Fig 6-3 footnote. Table 6-3 footnote not
  directly confirmed — low priority, assumption is safe.
- **Open Signs §29.4 Cf** for high ε — needs verification
- **Solid Sign Case A Cf** for high B/s — needs verification

### Diagram Pane (pending additions)
- C&C tab has no diagram pane yet
- Other tabs (elevated, open buildings, rooftop, other structures) have no diagrams
- Dead SVG helpers (`ob`, `pts`, `mkArrow`, `HatchPattern`, `IsoLabel`) still in
  `uiPrimitives.jsx` — safe to remove whenever convenient
- `STabs` export in `uiPrimitives.jsx` is dead code — safe to remove

### Low Priority
- Wind report not fully tested end-to-end in production (all 7 tabs)
- Save/load: active tab/sub-tab and `printTabs` selection not yet persisted
- 7-10 Exposure B wall profile not yet verified against reference spreadsheet
- `lrLoadCases705.png` is JPEG data with .png extension — functionally fine, could be
  renamed to `.jpg` with a one-line import change in `uiPrimitives.jsx`

---

## Build Command
```bash
npm install
npm run build   # must pass with no errors, only chunk size warnings are ok
```
Always verify local build passes before uploading to GitHub.

## Files Changed Across Last Two Sessions
| File | Status | Notes |
|---|---|---|
| `src/calcCore.js` | ✅ prev session | gcpRoof_hgt60 fix; zmCC edition-aware |
| `src/uiPrimitives.jsx` | ✅ this session | All SVG diagrams → images; DiagLRLoadCases with zoom/pan; DiagramPane handles dir+lr; LR pane 60%; useRef added to imports |
| `src/WindCalcInputs.jsx` | ✅ this session | Kzt inline diagrams in Qz tab; codeVer prop to DiagramPane; kztEscarpmentImg/kztRidgeHillImg imports |
| `src/windReport.js` | — | No changes |
| `src/WindSuiteApp.jsx` | — | No changes |
| `src/wss/*` | — | No changes |
| `src/diagrams/normalToRidge.png` | ✅ new | MWFRS Dir — Wind Normal to Ridge |
| `src/diagrams/parallelToRidge.png` | ✅ new | MWFRS Dir — Wind Parallel to Ridge |
| `src/diagrams/typicalLoading.png` | ✅ new | MWFRS Dir — Typical Wind Loading |
| `src/diagrams/escarpment.png` | ✅ new | Kzt reference — Escarpment |
| `src/diagrams/ridgeHill.png` | ✅ new | Kzt reference — 2D Ridge / 3D Hill |
| `src/diagrams/lrLoadCases705.png` | ✅ new | LR load cases — 7-05 (JPEG in .png wrapper) |
| `src/diagrams/lrLoadCases710to722.png` | ✅ new | LR load cases — 7-10 to 7-22 |
