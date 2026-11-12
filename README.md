# PDF Diff

A simple, private PDF comparison app. No MEP tools, device takeoff or electrical workflow. White, graphite and soft-gray interface; red and blue are reserved for removed and added content.

## Start

Double-click **Start-PDF-DIFF.cmd**, then open http://127.0.0.1:4321. Keep the server window open. First run installs locked dependencies and builds locally. The launcher can obtain an official portable Node.js runtime when needed. If another copy is already using port 4321, close that copy first or run `npm run preview -- --port 4323`.

Manual development: `npm ci --include=dev`, `npm run dev`.

## Compare and review

1. Replace the clearly labeled sample documents using **Original** and **Revised**. Pages are paired by number.
2. Choose **Overlay**, **Split** or **Revised**. Blue means added; red means removed. Settings controls sensitivity and blending.
3. **Auto-cloud changes** finds possible differences on the current page. Review every suggestion. Draw clouds manually or add notes.
4. Select a cloud to edit its label and note or mark it reviewed. Undo reverses edits.
5. **Export review** downloads an all-page reviewed PDF or a change-register CSV. The PDF is a raster copy with flattened markups. Original PDFs are never changed.
6. **Save review** downloads editable JSON. Keep it alongside your PDFs. The folder button in the header loads it; matching PDF fingerprints are required.

Shortcuts: V select, C cloud, N note, Ctrl+Z undo, Escape select. Mouse wheel zooms around the cursor (25%-600%); Shift+wheel and scrollbars pan. Page navigation remains available on small screens.

## Privacy and limits

All processing stays in your browser. No PDF upload, account, or remote service. Work is held in memory: save before closing or refreshing. Comparison is pixel-based, not OCR or automatic alignment. Use similarly scaled/aligned PDFs. Different page proportions disable automatic comparison. File input limit is 150 MB; memory is the practical limit.

## Older reviews

Version 1 and 2 JSON review files remain supported. Existing legacy device markers and impact records are retained when a review is loaded and saved, but the removed electrical workflow is not editable here. Reviews containing legacy impacts require both matching PDFs. Keep your original files and the previous app if you still need to edit those fields. Replacing a PDF retains the existing confirmation protections.

## Validation

`npm test` runs 27 algorithm, PDF and legacy-format compatibility tests. `npm run build` builds the production app. `npm run test:browser` runs the plain comparison workflow and responsive tests in installed Microsoft Edge on temporary port 4322. `tests/browser/impact.spec.js` is retained as historical coverage for the removed electrical UI and is not part of the active browser suite.

Version: 1.1.0-beta.1. Run locally; no hosted deployment is included.
