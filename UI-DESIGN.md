# PDF DIFF — Revision bench design

2026-10-29. **Selected: A — Revision bench.** The user chose this direction after reviewing the three working alternatives. It is now integrated into the main app as 1.1.0-beta.1.

## Premise and evidence

Help an electrical drawing reviewer connect a visible revision to a recorded decision by keeping drawing evidence and the review register together.

The existing app was inspected in the in-app browser using the deterministic Northline sample. The initial screen devotes a fixed rail, an 80/68 px header, a promotional heading and an inset workspace to app framing. Files and changes repeat rounded containers. At the default 1043 px browser width the drawing was about 478 px wide, with review content scrolling separately. These are observations; whether a particular reviewer prefers those proportions remains untested.

Source: `src/app.js`, `src/style.css`, README, PROJECT-MEMORY. No other projects or private portfolios were inspected. No external reference assets, fonts, dependencies or generated illustrations were added.

## Constraints shared by the options

- Remain a desktop-oriented, local PDF comparison and manual electrical review tool.
- Preserve PDF rendering, pixel comparison, review-file schema, drawing coordinates, electrical symbols and export logic.
- Red and blue continue to identify removed and added drawing ink. Review status retains text and an icon, as well as color.
- Use the installed DM Sans and Manrope fonts; Consolas/system monospace identifies sheet and cloud references and counts. No network font requests.
- Remove promotional copy and the unrelated initials avatar. A compact paired-page mark represents comparing revisions.
- Use the actual sample PDFs and five generated clouds. This content is synthetic and not for construction.
- Maintain keyboard shortcuts, native buttons, dialogs, field labels and visible focus. Expose selected controls with `aria-pressed`, driven by app state.

## Alternatives

| | A — Revision bench (recommended) | B — Review ledger | C — Light table |
|---|---|---|---|
| Primary hierarchy | Sheet → drawing → register | Register → drawing | Paired drawing evidence → dock |
| Composition | Compact top navigation; 180–200 px sheet index, flexible canvas, 300–320 px register | 308 px register on left; sheets become a horizontal strip above the canvas | Full-width canvas with sheet strip above and a 229 px register below; starts in Split view |
| Typography | Sans controls and headings; monospace references and counts | Same available family, ruled reading order emphasizes cloud IDs | Quiet chrome, compact dock, drawing paper remains the brightest object |
| Chrome palette | Graphite `#282e2b`, amber selection text `#66531e`, pale amber `#f2eddd` | White, plum `#654967`, pale plum `#f0eaf1` | Charcoal table `#353e40`, teal `#0b625f`, pale teal `#e4f1ef` |
| Memorable element | Paired-page wordmark and disciplined three-column bench | Review register anchors the left edge | Two white drawings on one dark light table |
| Geometry | 3 px control corners, flat ruled rows, sharp panel boundaries | Long register rules and a horizontal sheet index | Continuous canvas and a shallow horizontal review dock |
| Tradeoff | Three columns need desktop width | Drawing loses a little height; review reading order leads the workflow | Smaller whole-page previews; detailed editing needs dock scrolling |

Selection: A balances visual inspection, sheet navigation and annotation review without prioritizing a new workflow. The user chose A. B and C remain documented alternatives: B prioritizes systematic register-driven review; C trades vertical space and editing depth for paired-page scanning.

## Responsive and procedural rules

`src/app.js` owns the native layout and control state. `src/style.css` encodes the selected tokens and responsive rules. `src/view.js` owns pure whole-sheet fitting math. The development-only `design/` pages preserve the three alternatives and the pre-selection screenshots. The production UI has no study reshuffling or mutation observers.

- Fixed invariants: real source content, comparison color meanings, tool order, page coordinates and label meanings.
- Common spacing: 4/8/12/16/20 px steps; neutral rules separate relationships instead of repeated boxes.
- Whole-sheet fitting derives from the actual canvas aspect ratio and the available stage dimensions after padding. Split fitting allows for two pages and the existing 16 px gap. The zoom factor multiplies the fitted size; Fit resets to 100% and clears stage scrolling. PDF and annotation coordinates remain unchanged.
- At 1120 px, compact some tool labels. At 820 px, A hides the sheet index while retaining the sheet selector; B retains its register and sheet selector. At 620 px, all options stack the drawing and review panel, and retain sheet navigation beneath the canvas.
- Selection uses a line and tinted surface. Reviewed clouds also retain the `Reviewed` label and check icon. Hover does not move controls.
- Existing reduced-motion rules remain active. No ornamental motion or seeded decoration is introduced.
- Very long labels truncate in register rows; full labels and notes remain editable in properties. Dense registers scroll. Selected cloud properties appear before the register rows, and row selection brings the properties into view. The light-table study retains its scrolling dock.
- Empty, loading, selected and modal states reuse the actual app state. Invalid import behavior remains owned by the existing app and is not reimplemented in these studies.

## Review and acceptance

Desktop comparison viewport: 1440 × 900. Narrow review: 390 × 844. Intermediate review: 1024 × 768. Evidence lives in `design/evidence/`; results and limitations are recorded in `design/README.md`.

The design direction is accepted. The app version and changelog are updated. Integration evidence lives in `verification/revision-bench/README.md`; this remains separate from the historical design-study evidence. Real-project drawing acceptance and broader user evaluation remain outstanding. Nothing has been published or deployed.
