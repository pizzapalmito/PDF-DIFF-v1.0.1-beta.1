# Working art-direction previews

Open `http://127.0.0.1:4321/design/` on the running development server. The three tabs load working variations of the actual PDF DIFF app, using its deterministic sample PDFs. Switching direction starts a fresh sample session. Source files and review data still remain local.

The user selected **A — Revision bench** on 2026-10-29. It is integrated into the main app at `/` as 1.1.0-beta.1. These development-only pages retain the alternatives and historical screenshots; they are not included by the production build entry point. The study layer now reuses native app layout/state/fitting rather than maintaining separate DOM observers.

Files: `index.html` is the comparison gallery; `preview.html`, `preview.js` and `preview.css` form the studies. `../UI-DESIGN.md` records the rationale, constraints, proposed tokens, layout rules and tradeoffs. Screenshots live in `evidence/`.

The server used for this review was started from the repository with an isolated Vite cache after the default cache directory produced an EPERM error:

```powershell
node --input-type=module -e "import {createServer} from 'vite'; const server = await createServer({cacheDir:'tmp/ui-art-direction/vite-cache',server:{host:'127.0.0.1',port:4321,strictPort:true}}); await server.listen(); server.printUrls();"
```

## Historical pre-selection evidence — 2026-10-29

The table below records the original design-study stage. Current integration evidence is in `../verification/revision-bench/README.md`.

| Check | Result | Scope |
|---|---|---|
| `node --check design/preview.js` | PASS | Study JavaScript syntax |
| `npm test` | PASS, 12/12 | Existing comparison, geometry, CSV, load and sample-PDF checks |
| `npm run build` | PASS | Existing production build; does not package the studies |
| Actual study renders | PASS | All three in the in-app browser at 1440 × 900, with the same two sample PDFs and five first-sheet clouds; C starts in Split |
| Selected-cloud properties | PASS | A and C opened real cloud editors |
| Note persistence and review decision | PASS | A: entered a note, marked the cloud reviewed, switched Electrical → Changes, reselected the cloud; note persisted, button became Reopen, progress became 20% |
| Sheet navigation and empty state | PASS | A: sheet 2 in Split showed both paired pages, no existing markups, and Start your drawing review |
| Intermediate and narrow layouts | PASS | A at 1024 × 768 and 390 × 844, screenshots viewed; no document horizontal overflow measured |
| Narrow settings dialog and focus | PASS | A: dialog remained within screen, Tab moved from Close to the sensitivity slider with visible focus; Escape closed it |
| Production source separation | PASS | `git diff --exit-code -- src index.html package.json package-lock.json vite.config.js` returned no changes |
| Real-project PDFs, imports, saved-review restore and downloaded exports | NOT RUN | Existing implementation is reused; these study-specific runtime paths were not qualified |
| Full accessibility audit / assistive technology | NOT RUN | Basic labels, state, keyboard focus and selected contrast pairs only |
| User direction/aesthetic acceptance | NOT RUN | Awaiting selection |

Known study limitations: B and C have not received the same narrow-layout interaction checks as A. C's properties scroll inside its dock. Whole-sheet fitting and header navigation synchronization are study-layer prototypes and need focused regression checks when integrated. Large-drawing readability and all original README limitations remain applicable.

No production source or app version changed. No commit, publishing, deployment or third-party installation was performed.

Calculated token contrast pairs: muted text on white 5.79:1; A selection 6.36:1; B selection 6.57:1; C selection 6.19:1; white header text on graphite 13.85:1. These are selected pairs, not a complete accessibility conformance result. `board.html` presents the captured options together.
