# Revision bench integration verification

Date: 2026-10-29 (America/Toronto). App: **1.1.0-beta.1**. Result: **PASS for the selected redesign and exercised local sample workflow**.

The user selected A — Revision bench. The main entry point uses native app markup, stylesheet and state handling. No production code imports `design/`; no study DOM reshuffling or mutation observers are needed. The production build was served with `npm run preview` at `http://127.0.0.1:4321/`. Browser inspection confirmed `/assets/index-CNRZSjtg.js`, the production bundle, rather than the source entry point.

## Automated evidence

| Command | Result | What it covers |
|---|---|---|
| `node --check src/app.js` | PASS | Main JavaScript syntax |
| `npm test` | PASS, 17/17 | Existing 12 comparison/geometry/CSV/load/sample-PDF checks plus landscape, portrait, narrow-stage, Split-gap and invalid-dimension fitting checks |
| `npm run build` | PASS | Final production Vite build, including manifest-derived version and updated icon/metadata |
| `git diff --check` | PASS | Changed tracked source whitespace |
| Bundled Python: `verification/revision-bench/check_artifacts.py` | PASS | Seven saved JSON and CSV annotation records agree; status, note, circuit, VA and two exported raster PDF pages checked |

No additional packages were installed. `src/core.js`, `src/pdf.js` and `src/demo.js` are unchanged.

## Browser evidence — production build

All checks below used the existing deterministic Northline sample or its local `tmp/qa/` PDF fixtures. No real project drawing or private document was loaded.

| Check | Result | Observed evidence |
|---|---|---|
| Native selected direction | PASS | Graphite top navigation, amber selection, sheet index, complete drawing and ruled register; manifest version visible |
| Long cloud label / note editing | PASS | Label and note retained after Electrical → Changes; full values remain editable; register row truncates within its column |
| Selected properties | PASS | Properties precede the rows; selected editor top 434 px and list top 717 px at desktop, with note and review action visible |
| Review decision / navigation state | PASS | First cloud became Reviewed / Reopen, progress 20%; header Compare state synchronized with Changes |
| Zoom / Fit | PASS | Zoom in produced 125% and a wider paper; Fit reset to 100% |
| Split / sheet navigation | PASS | Both canvases visible, Split `aria-pressed=true`; second sheet paired correctly and showed the empty register |
| Manual cloud / Undo | PASS | Dragged a cloud on sheet 2, observed REV-06 and 6 total clouds; Undo restored the empty second sheet and 5 original clouds |
| Note placement | PASS | Drawing click added a labeled note with retained review text |
| Device placement / loads | PASS | Drawing click added one receptacle; entered P1-07 and 240 VA; summary showed 2.00 A at 120 V |
| Saved review download | PASS | Read the downloaded JSON: schema 1, two pages, 64-character fingerprint and seven annotations |
| CSV export | PASS | Seven rows retain the reviewed cloud, notes, P1-07 circuit and 240 VA; checked against JSON |
| PDF export | PASS | Download reopened as two 1000 × 700-point pages with one raster image each; both page renders inspected, including cloud/note/device markups on page 1 |
| Invalid import recovery | PASS | Invalid fixture produced Could not open PDF / Invalid PDF structure; original filename and all seven annotations remained |
| Original / revised PDF import | PASS | Local fixture pair opened; replacing the revised PDF required the existing guard and cleared markups only after confirmation; sample badge hidden |
| Saved review restore | PASS | Matched fingerprint accepted seven saved items against imported revised fixture; reviewed status, cloud note and device P1-07/240 VA restored |
| Responsive layout | PASS | Viewed 1440 × 900, 1024 × 768 and 390 × 844; no document horizontal overflow at intermediate/narrow widths; narrow sheet selector remained usable |
| Keyboard / dialog | PASS | N and V selected their tools with pressed state; narrow settings dialog stayed within the screen; Tab focused sensitivity with visible focus; Escape closed it |
| Normal startup errors | PASS | Fresh production startup reported no console error entries |

Screenshots: `desktop-1440.png`, `selected-desktop.png`, `intermediate-1024.png`, `narrow-390.png`, `settings-keyboard-390.png`. Export evidence: `review.json`, `register.csv`, `reviewed.pdf`, `export-page-1.png`, `export-page-2.png`. These are synthetic QA artifacts.

## Failures and limitations

- No unresolved implementation failure was found. The deliberate invalid-PDF case recovered as expected.
- Browser tooling initially had a stale connection; resetting the UI session restored it. One default download wait was slow; bounded waits completed subsequent exports normally. A read-only DOM inspection method was unsupported, so equivalent visible DOM geometry was used. These were verification-tool issues, not app changes.
- NOT RUN: representative real-project drawings, large/scanned/password-protected sets, cross-browser coverage, screen-reader/full accessibility conformance, or long-session performance. These were outside this visual redesign's acceptance evidence.
- Selected token contrast checks from the design study remain applicable: muted text on white 5.79:1, amber selection 6.36:1, white text on graphite 13.85:1. This is not a complete accessibility audit.
- Existing limits remain: in-memory work requires manual saving, comparisons require aligned drawings, and reviewed PDF export is rasterized. See README for scope.

The direction was selected by the user; final integrated aesthetic evaluation with real work remains separate. No commit, push, publishing, deployment or software installation occurred.
