# Unused Code Delete List

Last checked: 2026-05-15

Cleanup policy: this list is now a second-phase source cleanup backlog. The 2026-05-15 repository cleanup archived only runtime artifacts, isolated scripts, and legacy docs; it did not move or delete active source files because the worktree contains ongoing RAG, supervisor, and agent-panel changes.

Archived in the first cleanup pass:

- `runtime/smoke/*.wav` -> `archive/deprecated-2026-05-15/runtime-smoke/`
- `xuejian/diagnose.mjs` -> `archive/deprecated-2026-05-15/scripts/diagnose.mjs`
- `scripts/ci/check-orchestration-deps.py` -> `archive/deprecated-2026-05-15/scripts/check-orchestration-deps.py`
- root-level legacy RAG docs -> `docs/rag/legacy/`
- `docs/xuejian_upgrade_docs/` -> `docs/archive/xuejian-upgrade-docs/`

Do not delete source-code candidates from this list until the matching tests, evaluation scripts, and active routes are reviewed in the same change.

This document lists files that are currently unreachable from the known product entry points and are candidates for deletion. It is based on static reference checks, not on runtime telemetry.

## Entry Points Checked

- Frontend production entry: `xuejian/src/main.tsx` -> `xuejian/src/App.tsx`
- Active frontend navigation: `home`, `library`, `cards`, `learning`, `knowledge`, `settings`
- Python orchestration entry: `xuejian/orchestration_service/main.py` -> `xuejian/orchestration_service/server.py`
- Current Python workflow routes:
  - `/workflows/card-generation`
  - `/workflows/ai-card-generation`
  - `/workflows/document-parse`
  - `/workflows/document-embedding`
  - `/workflows/knowledge-qa`
- CI/script references under `.github/workflows`, `scripts`, `xuejian/scripts`, and `package.json`

## Second-Phase Source Cleanup Candidates

These files were not reached by the checked app entry points on 2026-05-08. Some are still referenced by unit tests or evaluation scripts; delete or update those tests at the same time.

### Old Home Component Chain

The active home page uses `xuejian/src/components/pages/home-page.tsx`, not these older components.

- `xuejian/src/components/home/index.ts`
- `xuejian/src/components/home/HomeHeatmapPanel.tsx`
- `xuejian/src/components/home/HomeInsightRail.tsx`
- `xuejian/src/components/home/HomeQuickActionsPanel.tsx`
- `xuejian/src/components/home/HomeRecentDocumentsPanel.tsx`
- `xuejian/src/components/home/HomeStudyOverviewPanel.tsx`
- `xuejian/src/components/home/HomeTaskHero.tsx`

### Old Document Component Chain

The active library and reader paths use `components/pages/library-page.tsx`, `features/documents/LibraryPage.tsx`, and the reader-specific PDF components directly. The files below are not on the current production path.

- `xuejian/src/components/documents/index.ts`
- `xuejian/src/components/documents/DocumentList.tsx`
- `xuejian/src/components/documents/DocumentPreviewPane.tsx`
- `xuejian/src/components/documents/DocumentStatusBadge.tsx`
- `xuejian/src/components/documents/HighlightColorPicker.tsx`
- `xuejian/src/components/documents/ImportDocumentButton.tsx`
- `xuejian/src/components/documents/PageNavBar.tsx`
- `xuejian/src/components/documents/PdfViewer/PdfSearchBar.tsx`
- `xuejian/src/components/documents/PdfViewer/PdfTextLayer.tsx`
- `xuejian/src/components/documents/StickyNotes/StickyNoteCard.tsx`
- `xuejian/src/components/documents/StickyNotes/StickyNotesPanel.tsx`
- `xuejian/src/components/documents/StickyNotes/UnlinkedCardNotice.tsx`
- `xuejian/src/components/documents/TextSelectionPopover.tsx`

### Unused Card UI Variants

These are not imported by the current `BasicCardsPage` or active card rendering path.

- `xuejian/src/components/cards/CardEditorModal.tsx`
- `xuejian/src/components/cards/ChoiceCardContent.tsx`
- `xuejian/src/components/cards/ClozeCardContent.tsx`
- `xuejian/src/components/cards/ImageOcclusionCardContent.tsx`

### Unrouted Pages

`App.tsx` currently routes `cards` to `BasicCardsPage`, and there are no active `podcast` or `profile` nav items.

- `xuejian/src/features/cards/CardStudioPage.tsx`
- `xuejian/src/features/cards/index.ts`
- `xuejian/src/components/pages/card-studio-page.tsx`
- `xuejian/src/features/podcast/PodcastPage.tsx`
- `xuejian/src/features/podcast/index.ts`
- `xuejian/src/components/pages/podcast-page.tsx`
- `xuejian/src/components/podcast/PodcastPlayerModal.tsx`
- `xuejian/src/features/profile/ProfilePage.tsx`
- `xuejian/src/features/profile/index.ts`
- `xuejian/src/components/pages/profile-page.tsx`

### Unused Barrels and Small Utilities

- `xuejian/src/features/documents/index.ts`
- `xuejian/src/features/review/index.ts`
- `xuejian/src/features/settings/index.ts`
- `xuejian/src/components/shell/index.ts`
- `xuejian/src/components/shell/ApiSetupBanner.tsx`
- `xuejian/src/components/stats/index.ts`
- `xuejian/src/components/stats/StudyStatsCard.tsx`
- `xuejian/src/components/stats/StudyTotalsCard.tsx`
- `xuejian/src/components/ui/Input.tsx`
- `xuejian/src/components/ui/Sketch.tsx`
- `xuejian/src/components/ui/SketchBorder.tsx`
- `xuejian/src/components/ui/SketchDivider.tsx`
- `xuejian/src/components/ui/badge.tsx`
- `xuejian/src/design-system/useAppThemeId.ts`
- `xuejian/src/hooks/useStickyNote.ts`
- `xuejian/src/lib/annotationPalette.ts`
- `xuejian/src/lib/store.ts`
- `xuejian/src/services/renderer/docx.ts`
- `xuejian/src/services/renderer/text.ts`

### Isolated Scripts

These were archived in the first cleanup pass and should not be restored unless a new package script, CI workflow, or documented maintenance workflow needs them.

- `archive/deprecated-2026-05-15/scripts/diagnose.mjs`
- `archive/deprecated-2026-05-15/scripts/check-orchestration-deps.py`

### Unused Static Assets

No active source reference was found.

- `xuejian/src/assets/react.svg`
- `xuejian/src/assets/vite.svg`
- `xuejian/src/assets/hero.png`
- `xuejian/public/icons.svg`
- `xuejian/public/fonts/Xiaolai-Regular.ttf`
- `xuejian/public/fonts/yozai-regular.ttf`

## Do Not Delete Until Product Decision

These Python files are not currently exposed by `orchestration_service/server.py`, but Rust commands still try to call the missing routes:

- `src-tauri/src/commands/animation.rs` posts to `/workflows/card-animation`
- `src-tauri/src/commands/podcast.rs` posts to `/workflows/podcast`

Because of that mismatch, the files below may represent unfinished wiring rather than dead code. Decide whether to add the missing server routes or remove the corresponding Rust/frontend feature surface.

- `xuejian/orchestration_service/workflows/card_animation.py`
- `xuejian/orchestration_service/workflows/podcast.py`
- `xuejian/orchestration_service/workflows/podcast_utils.py`
- `xuejian/orchestration_service/schemas/podcast.py`
- `xuejian/orchestration_service/providers/tts_base.py`
- `xuejian/orchestration_service/providers/tts_edge.py`
- `xuejian/orchestration_service/providers/tts_elevenlabs.py`
- `xuejian/orchestration_service/providers/tts_fish.py`
- `xuejian/orchestration_service/providers/tts_google.py`
- `xuejian/orchestration_service/providers/tts_openai.py`
- `xuejian/orchestration_service/providers/tts_router.py`

## Deletion Checklist

Before deleting, run:

```bash
cd xuejian
npm run build
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

If deleting test-only components, also remove or update the matching tests and evaluation config entries, especially:

- `xuejian/tests/unit/card-studio-page.test.tsx`
- `xuejian/tests/unit/podcast-page.test.tsx`
- `xuejian/tests/unit/profile-page.test.tsx`
- `xuejian/tests/unit/highlight-color-picker.test.tsx`
- `xuejian/tests/unit/theme-readability.test.ts`
- `xuejian/tsconfig.card-eval.json`
- `xuejian/scripts/eval/check-structure.mjs`
