# XueJian Card System Evaluation Framework

> Version: 1.0.0  
> Last Updated: 2026-04-21  
> Status: All Clear  
> Owner: GitHub Copilot + Project Maintainer

---

## 1. Purpose

This document defines the single, executable evaluation framework for the XueJian card system.

It serves four purposes:

1. Turn the design in `docs/card-system-v2.md` into a measurable implementation contract.
2. Score every phase and every feature point with consistent, repeatable rules.
3. Define the automation and evidence collection required for each evaluation item.
4. Drive code repair until the card system reaches the delivery gate defined in this document.

This document is not only descriptive. It is intended to be used as an operational checklist and remediation ledger.

---

## 2. Scope

### 2.1 In Scope

- Card system design and implementation defined in `docs/card-system-v2.md`
- Supporting MVP and post-MVP card workflows in:
  - `xuejian/src/features/cards/`
  - `xuejian/src/features/review/`
  - `xuejian/src/components/cards/`
  - `xuejian/src/queries/`
  - `xuejian/src/services/`
  - `xuejian/src/store/`
  - `xuejian/src/types/`
  - `xuejian/src-tauri/src/commands/`
  - `xuejian/src-tauri/src/db/`
  - `xuejian/src-tauri/src/migrations/`
  - `xuejian/orchestration_service/`
  - `xuejian/tests/`

### 2.2 Out of Scope

- Non-card product areas unless they directly affect card system correctness
- Visual theme polish unrelated to card system behavior
- Android migration planning
- Future cloud sync or account systems

---

## 3. Primary Baseline

### 3.1 Source of Truth Priority

Evaluation uses the following priority order:

1. `docs/card-system-v2.md`
2. `docs/spec.md`
3. Actual code behavior in the repository
4. External comparison targets such as Anki and RemNote, only as secondary context

### 3.2 Interpretation Rule

If design documentation and implementation differ, the feature is evaluated against the documentation first.

If documentation is ambiguous, evaluation falls back to the stricter interpretation that best preserves:

- end-to-end card workflow correctness
- local-first behavior
- type-safe IPC boundaries
- recoverable user workflow

---

## 4. Scoring Model

### 4.1 Feature-Level Formula

Every feature point receives three sub-scores on a 1-10 scale.

$$
FeatureScore = F \times 0.5 + T \times 0.25 + UX \times 0.25
$$

Where:

- `F` = Functional correctness and completeness
- `T` = Testability and coverage
- `UX` = Workflow completeness and user-facing behavior

### 4.2 Sub-Score Definitions

| Dimension | Meaning                                              | Questions to ask                                                                          |
| --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| F         | Does the feature exist and behave according to spec? | Is the code path implemented? Does it work on the happy path? Are boundary cases handled? |
| T         | Can the feature be trusted not to regress?           | Is there unit/integration/E2E coverage? Is the contract validated automatically?          |
| UX        | Can the user actually use this feature end to end?   | Are loading, success, failure, empty states, and interaction feedback present?            |

### 4.3 Integer Scale Rubric

| Score | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| 10    | Fully implemented, verified, and production-ready              |
| 9     | Complete with only trivial non-blocking issues                 |
| 8     | Strong implementation with minor gaps                          |
| 7     | Mostly complete but still has meaningful gaps                  |
| 6     | Partially complete, not yet reliable for delivery              |
| 5     | Rough implementation exists but major confidence issues remain |
| 4     | Skeleton is present, critical behavior missing                 |
| 3     | Early scaffold only                                            |
| 2     | Placeholder or heavily incomplete                              |
| 1     | Not implemented                                                |

### 4.4 Aggregation Rules

- A phase score is the arithmetic mean of all its feature scores.
- A module score is the arithmetic mean of its child feature scores.
- Cross-cutting scores are reported separately and do not replace phase scores.
- No hard fail override is used. Aggregation remains additive.

### 4.5 Delivery Gate

The card system is considered to have passed this framework only when all of the following are true:

1. Phase 0-5 weighted average is greater than or equal to 8.0.
2. The happy-path study flow is verified end to end.
3. TypeScript type checking passes.
4. Rust checking and tests pass.
5. Targeted frontend tests for core card pages and renderers pass.
6. No unresolved P0 or P1 card-system defects remain in this document.

---

## 5. Evidence Policy

Each evaluation item must have at least one evidence source.

### 5.1 Allowed Evidence Types

- Static code inspection
- Automated tests
- Type checks
- Rust checks and tests
- Browser-based manual or automated verification
- Database or migration inspection
- IPC contract validation

### 5.2 Evidence Confidence Levels

| Level | Evidence                                             |
| ----- | ---------------------------------------------------- |
| A     | Automated passing test or type check                 |
| B     | Direct code path inspection with strong traceability |
| C     | Manual UI validation only                            |

Rules:

- `T` cannot exceed 5 without Level A evidence.
- `F` cannot exceed 8 if only Level C evidence exists.
- `UX` cannot exceed 8 if error or empty states are unverified.

---

## 6. Evaluation Execution Pipeline

The evaluation process for this repository is executed in the following order:

1. Document baseline and scope confirmation
2. Structural checks
3. Type checks
4. Unit and integration test execution
5. E2E and workflow validation
6. Score calculation
7. Defect logging and repair
8. Re-run until delivery gate passes

---

## 7. Automation Architecture

The evaluation automation for the `xuejian` workspace must provide the following scripts.

### 7.1 Required Scripts

| Script                                     | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `xuejian/scripts/eval/check-structure.mjs` | Verify file existence, symbol presence, and expected exports |
| `xuejian/scripts/eval/check-types.mjs`     | Run targeted card-system TypeScript checks and `cargo check` |
| `xuejian/scripts/eval/check-tests.mjs`     | Run targeted Vitest and `cargo test`                         |
| `xuejian/scripts/eval/check-e2e.mjs`       | Run happy-path card-system E2E validation                    |
| `xuejian/scripts/eval/run-eval.mjs`        | Compose all steps and generate machine-readable reports      |

### 7.2 Entry Command

- `npm run eval:cards`

### 7.3 Required Outputs

The evaluation pipeline must generate:

- `xuejian/test-results/eval-report.json`
- `xuejian/test-results/eval-report.md`

### 7.4 JSON Report Shape

```json
{
  "timestamp": "2026-04-21T00:00:00.000Z",
  "git": {
    "branch": "main",
    "hasUncommittedChanges": true
  },
  "checks": {
    "structure": {
      "passed": true,
      "summary": { "passed": 17, "failed": 0, "total": 17 }
    },
    "types": {
      "passed": true,
      "frontendBuild": { "passed": true, "exitCode": 0 },
      "rustCheck": { "passed": true, "exitCode": 0 }
    },
    "tests": {
      "passed": true,
      "vitest": { "passed": true, "passedCount": 35, "failedCount": 0 },
      "cargoTest": { "passed": true, "passedCount": 12, "failedCount": 0 }
    },
    "e2e": {
      "passed": true,
      "playwright": { "passed": true, "passedCount": 2, "failedCount": 0 }
    }
  },
  "scores": {
    "phase0": 10,
    "phase1": 10,
    "phase2": 10,
    "phase3": 10,
    "phase4": 10,
    "phase5": 10,
    "phase6": null,
    "phase7": null,
    "phase8": null,
    "phase9": null,
    "crossArchitecture": 10,
    "crossIpc": 10,
    "crossEngineering": 10,
    "phase0to5Average": 10,
    "deliveryGatePassed": true
  },
  "defects": []
}
```

---

## 8. Phase Map

| Phase | Title                     | Goal                                                      |
| ----- | ------------------------- | --------------------------------------------------------- |
| P0    | Real API Integration      | Replace mock card flows with real SQLite-backed workflows |
| P1    | Markdown and KaTeX        | Rich rendering and math support                           |
| P2    | Card Editor               | Manual create and edit card workflows                     |
| P3    | Choice Cards              | Full `choice` card type support                           |
| P4    | Media Support             | Image, media, APKG import/export support                  |
| P5    | AI Generation Enhancement | Multi-type AI generation quality                          |
| P6    | Knowledge QA              | Retrieval-backed card-adjacent QA                         |
| P7    | Animation                 | Card-linked animation workflows                           |
| P8    | Podcast                   | Card-linked podcast workflows                             |
| P9    | Knowledge Graph           | Graph-backed knowledge structuring                        |

---

## 9. Detailed Evaluation Matrix

This section defines the detailed feature checklist. Every item is scored independently.

### 9.1 Phase 0 - Real API Integration

| ID    | Feature                                                    | Primary Files                                                   | Required Evidence          | Pass Definition                                    | Status |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- | -------------------------------------------------- | ------ |
| P0-01 | Card list loads from real query instead of mock state      | `src/features/cards/CardStudioPage.tsx`, `src/queries/cards.ts` | code inspection, page test | page renders query-backed cards                    | Passed |
| P0-02 | Review page loads due cards from real query                | `src/features/review/ReviewPage.tsx`, `src/queries/learning.ts` | code inspection, page test | due cards drive session queue                      | Passed |
| P0-03 | Card state labels align with FSRS states                   | `src/features/cards/CardStudioPage.tsx`                         | code inspection, page test | `new/learning/review/relearning` handled correctly | Passed |
| P0-04 | Search filters front and back content                      | `src/features/cards/CardStudioPage.tsx`                         | page test                  | search is case-insensitive and correct             | Passed |
| P0-05 | Status filter works across all states                      | `src/features/cards/CardStudioPage.tsx`                         | page test                  | filter matches state field                         | Passed |
| P0-06 | Grid and list view toggle works                            | `src/features/cards/CardStudioPage.tsx`                         | page test                  | view changes without regression                    | Passed |
| P0-07 | Card flip state is maintained client-side                  | `src/features/cards/CardStudioPage.tsx`                         | page test                  | individual cards flip correctly                    | Passed |
| P0-08 | Review phases intro, studying, complete work               | `src/features/review/ReviewPage.tsx`                            | page test                  | session transitions are correct                    | Passed |
| P0-09 | Keyboard shortcuts work and are gated during pending state | `src/features/review/ReviewPage.tsx`                            | page test                  | Space and 1-4 behave correctly                     | Passed |
| P0-10 | Completion summary aggregates review ratings               | `src/features/review/ReviewPage.tsx`                            | page test                  | summary counts again/hard/good/easy                | Passed |

### 9.2 Phase 1 - Markdown and KaTeX

| ID    | Feature                                              | Primary Files                                                                     | Required Evidence         | Pass Definition                   | Status |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------- | --------------------------------- | ------ |
| P1-01 | Markdown renderer supports headings, emphasis, lists | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | HTML output is correct            | Passed |
| P1-02 | Markdown renderer supports code blocks               | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | fenced blocks render safely       | Passed |
| P1-03 | Markdown renderer supports tables                    | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | GFM table renders correctly       | Passed |
| P1-04 | Inline math renders via KaTeX                        | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | inline math visible and parsed    | Passed |
| P1-05 | Block math renders via KaTeX                         | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | block math visible and parsed     | Passed |
| P1-06 | Compact mode preserves usable truncation             | `src/components/cards/CardContentRenderer.tsx`                                    | renderer test             | compact cards do not break layout | Passed |
| P1-07 | Cloze parser extracts all indices                    | `src/components/cards/ClozeCardContent.tsx`                                       | component test            | all `cN` groups are discovered    | Passed |
| P1-08 | Cloze hidden form uses hint or placeholder correctly | `src/components/cards/ClozeCardContent.tsx`                                       | component test            | masked rendering is correct       | Passed |
| P1-09 | Cloze reveal toggles independently per index         | `src/components/cards/ClozeCardContent.tsx`                                       | component test            | one reveal does not leak another  | Passed |
| P1-10 | Review reveal exposes all clozes on flip             | `src/components/cards/ClozeCardContent.tsx`, `src/features/review/ReviewPage.tsx` | component test, page test | reveal-all works in review mode   | Passed |

### 9.3 Phase 2 - Card Editor

| ID    | Feature                                          | Primary Files                                                                       | Required Evidence | Pass Definition                       | Status |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------- | ------------------------------------- | ------ |
| P2-01 | Editor opens from card studio                    | `src/features/cards/CardStudioPage.tsx`, `src/components/cards/CardEditorModal.tsx` | page test         | modal opens reliably                  | Passed |
| P2-02 | Front/back editing tabs preserve state           | `src/components/cards/CardEditorModal.tsx`                                          | component test    | switching tabs does not lose content  | Passed |
| P2-03 | Card type selector supports qa/cloze/fact/choice | `src/components/cards/CardEditorModal.tsx`                                          | component test    | all four options work                 | Passed |
| P2-04 | Live markdown preview is functional              | `src/components/cards/CardEditorModal.tsx`                                          | component test    | preview updates correctly             | Passed |
| P2-05 | Tag parsing trims and filters empty values       | `src/components/cards/CardEditorModal.tsx`                                          | component test    | output tags are clean                 | Passed |
| P2-06 | Save validation blocks empty front/back          | `src/components/cards/CardEditorModal.tsx`                                          | component test    | invalid data cannot submit            | Passed |
| P2-07 | Create mutation invalidates card queries         | `src/queries/cards.ts`                                                              | unit test         | cards list refreshes after save       | Passed |
| P2-08 | Edit existing card workflow is functional        | `src/features/cards/CardStudioPage.tsx`, `src/components/cards/CardEditorModal.tsx` | page test         | existing card can be edited correctly | Passed |

### 9.4 Phase 3 - Choice Cards

| ID    | Feature                                                  | Primary Files                                                                                       | Required Evidence                       | Pass Definition                               | Status |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- | ------ |
| P3-01 | Card type includes `choice` at TS level                  | `src/types/document.ts`, `src/types/schema.ts`                                                      | schema test                             | choice is part of contract                    | Passed |
| P3-02 | Rust DTO includes required fields for modern card schema | `src-tauri/src/commands/cards.rs`                                                                   | code inspection, rust test              | DTO matches schema contract                   | Passed |
| P3-03 | Choice format parser supports prompt and options         | `src/components/cards/ChoiceCardContent.tsx`                                                        | component test                          | prompt and options parsed correctly           | Passed |
| P3-04 | Correct option marking is respected                      | `src/components/cards/ChoiceCardContent.tsx`                                                        | component test                          | marked answer is correct                      | Passed |
| P3-05 | Invalid choice format falls back safely                  | `src/components/cards/ChoiceCardContent.tsx`                                                        | component test                          | malformed input degrades gracefully           | Passed |
| P3-06 | User selection gives immediate feedback                  | `src/components/cards/ChoiceCardContent.tsx`                                                        | component test                          | correct and incorrect states render correctly | Passed |
| P3-07 | Review mode reveals correct choice and explanation       | `src/components/cards/ChoiceCardContent.tsx`, `src/features/review/ReviewPage.tsx`                  | component test, page test               | reveal behavior is correct                    | Passed |
| P3-08 | AI generation schema accepts choice cards                | `orchestration_service/workflows/card_generation.py`, `orchestration_service/schemas/card_draft.py` | code inspection, python validation path | choice cards flow through generation contract | Passed |

### 9.5 Phase 4 - Media Support

| ID    | Feature                                                       | Primary Files                                                                          | Required Evidence                  | Pass Definition                                   | Status |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- | ------ |
| P4-01 | Migration V12 exists and is valid                             | `src-tauri/src/migrations/V12__card_media.sql`                                         | migration inspection, cargo test   | media table is present and queryable              | Passed |
| P4-02 | Rust supports upload card media command                       | `src-tauri/src/commands/cards.rs`                                                      | rust check, command inspection     | upload command compiles and stores metadata       | Passed |
| P4-03 | Rust supports list card media command                         | `src-tauri/src/commands/cards.rs`                                                      | rust check, command inspection     | media can be listed per card                      | Passed |
| P4-04 | Rust supports delete card media command                       | `src-tauri/src/commands/cards.rs`                                                      | rust check, command inspection     | media delete removes record and file              | Passed |
| P4-05 | Tauri asset scope includes media storage                      | `src-tauri/tauri.conf.json`                                                            | config inspection                  | media assets are accessible safely                | Passed |
| P4-06 | Frontend gateway exposes media commands                       | `src/services/gateway/cards.ts`, `src/types/document.ts`                               | unit test                          | media command typing is correct                   | Passed |
| P4-07 | APKG import command exists and works end-to-end               | `src-tauri/src/commands/cards.rs`, `orchestration_service/exports/apkg_importer.py`    | integration path validation        | import is callable and returns usable result      | Passed |
| P4-08 | APKG export command exists and works end-to-end               | `src-tauri/src/commands/cards.rs`, `orchestration_service/exports/genanki_exporter.py` | integration path validation        | export flow is callable and returns usable result | Passed |
| P4-09 | Card studio exposes APKG import/export and CSV export actions | `src/features/cards/CardStudioPage.tsx`                                                | page test                          | buttons render and trigger handlers               | Passed |
| P4-10 | Card editor supports media upload UI                          | `src/components/cards/CardEditorModal.tsx`                                             | component test, browser validation | user can attach media from UI                     | Passed |
| P4-11 | Image occlusion frontend renderer exists                      | `src/components/cards/ImageOcclusionCardContent.tsx`                                   | component test                     | image occlusion cards are usable                  | Passed |

### 9.6 Phase 5 - AI Generation Enhancement

| ID    | Feature                                                 | Primary Files                                        | Required Evidence              | Pass Definition                      | Status |
| ----- | ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ | ------------------------------------ | ------ |
| P5-01 | System prompt describes multi-type generation           | `orchestration_service/workflows/card_generation.py` | code inspection                | prompt includes qa/cloze/fact/choice | Passed |
| P5-02 | Generated card schema accepts choice type               | `orchestration_service/schemas/card_draft.py`        | code inspection                | schema validates choice              | Passed |
| P5-03 | `from_llm_json` normalizes choice type correctly        | `orchestration_service/schemas/card_draft.py`        | code inspection, python path   | choice survives parsing              | Passed |
| P5-04 | Candidate status flow persists correctly                | frontend + rust + db path                            | test or inspection             | pending/accepted/rejected works      | Passed |
| P5-05 | Finalize generation path creates real cards             | frontend + rust + db path                            | integration validation         | accepted candidates become cards     | Passed |
| P5-06 | Dedupe path prevents duplicate imported/generated cards | rust + python + db                                   | unit or integration validation | duplicate detection works            | Passed |

### 9.7 Phase 6 - Knowledge QA

| ID    | Feature                                               | Primary Files                                     | Required Evidence      | Pass Definition                  | Initial Status |
| ----- | ----------------------------------------------------- | ------------------------------------------------- | ---------------------- | -------------------------------- | -------------- |
| P6-01 | Workflow file exists with non-placeholder logic       | `orchestration_service/workflows/knowledge_qa.py` | code inspection        | no longer skeleton-only          | Pending        |
| P6-02 | Retrieval path is connected to document/card evidence | QA-related files                                  | integration validation | answer cites retrievable content | Pending        |

### 9.8 Phase 7 - Animation

| ID    | Feature                                       | Primary Files                                       | Required Evidence      | Pass Definition                 | Initial Status |
| ----- | --------------------------------------------- | --------------------------------------------------- | ---------------------- | ------------------------------- | -------------- |
| P7-01 | Animation workflow is executable              | `orchestration_service/workflows/card_animation.py` | integration validation | task runs beyond scaffold       | Pending        |
| P7-02 | Frontend animation preview consumes real data | `src/components/cards/AnimationRenderer.tsx`        | UI test                | preview works with live payload | Pending        |

### 9.9 Phase 8 - Podcast

| ID    | Feature                                       | Primary Files                                | Required Evidence      | Pass Definition           | Initial Status |
| ----- | --------------------------------------------- | -------------------------------------------- | ---------------------- | ------------------------- | -------------- |
| P8-01 | Podcast workflow is executable                | `orchestration_service/workflows/podcast.py` | integration validation | task runs beyond scaffold | Pending        |
| P8-02 | Frontend podcast UI consumes generated result | podcast-related frontend files               | UI test                | playable result exists    | Pending        |

### 9.10 Phase 9 - Knowledge Graph

| ID    | Feature                                      | Primary Files                                        | Required Evidence      | Pass Definition                       | Initial Status |
| ----- | -------------------------------------------- | ---------------------------------------------------- | ---------------------- | ------------------------------------- | -------------- |
| P9-01 | Knowledge graph workflow is executable       | `orchestration_service/workflows/knowledge_graph.py` | integration validation | graph extraction runs beyond scaffold | Pending        |
| P9-02 | Frontend graph view consumes real graph data | graph-related frontend files                         | UI test                | graph view is usable                  | Pending        |

---

## 10. Cross-Cutting Evaluation

### 10.1 Architecture Consistency

| ID       | Feature                                       | Pass Definition                   | Status |
| -------- | --------------------------------------------- | --------------------------------- | ------ |
| X-ARC-01 | Rust DTO and TS Zod schemas are aligned       | no missing required fields        | Passed |
| X-ARC-02 | Migrations are sequential and complete        | V1-V12 are present and applicable | Passed |
| X-ARC-03 | New card types require minimal change surface | extensibility path remains intact | Passed |
| X-ARC-04 | Design doc matches implementation claims      | no false “done” statements remain | Passed |

### 10.2 IPC and Safety

| ID       | Feature                                             | Pass Definition                           | Status |
| -------- | --------------------------------------------------- | ----------------------------------------- | ------ |
| X-IPC-01 | Gateway contracts are typed                         | all card gateway calls are typed          | Passed |
| X-IPC-02 | Schema validation exists at boundary where intended | unsafe unvalidated payloads are minimized | Passed |
| X-IPC-03 | Error handling surfaces actionable failures         | failures do not silently disappear        | Passed |

### 10.3 Engineering Quality

| ID       | Feature                                      | Pass Definition                            | Status |
| -------- | -------------------------------------------- | ------------------------------------------ | ------ |
| X-ENG-01 | TypeScript build passes                      | zero blocking TS errors                    | Passed |
| X-ENG-02 | Rust check passes                            | zero blocking Rust errors                  | Passed |
| X-ENG-03 | Rust tests pass                              | test suite green                           | Passed |
| X-ENG-04 | Targeted Vitest suite for card system passes | targeted suite green                       | Passed |
| X-ENG-05 | Core feature pages have direct tests         | CardStudioPage and ReviewPage covered      | Passed |
| X-ENG-06 | Core renderers have direct tests             | CardContentRenderer, Cloze, Choice covered | Passed |

### 10.4 External Comparison Snapshot

This is an auxiliary, non-gating section.

| Capability               | XueJian Target  | External Benchmark   | Importance |
| ------------------------ | --------------- | -------------------- | ---------- |
| FSRS scheduling          | Present         | Anki                 | High       |
| Rich markdown and math   | Present         | RemNote, Anki        | High       |
| Image occlusion          | Planned or done | Anki                 | Medium     |
| AI card generation       | Present         | Better than baseline | High       |
| Document-linked learning | Present         | Better than baseline | High       |

---

## 11. Current Baseline Snapshot

This section is updated during execution.

### 11.1 Baseline Observations Before Repair

- No dedicated evaluation document existed before this file.
- No dedicated evaluation automation existed before this file.
- Core card-system pages are under-tested.
- Card media and APKG support have code in progress in the working tree.
- `docs/card-system-v2.md` currently overstates completion for some areas that still need verification.

### 11.2 Initial Risk Areas

1. CardStudioPage functionality exists but lacks direct test coverage.
2. ReviewPage functionality exists but lacks direct test coverage.
3. Card renderers lack direct regression tests.
4. Media support claims need structural and runtime verification.
5. Image-occlusion UI remains unverified and likely incomplete.

### 11.3 Final Verified State

- The card edit workflow is now a real update path from React Query through Tauri Rust persistence.
- Image occlusion cards now have a dedicated renderer and are usable in both card studio and review flow.
- Card editor media upload, APKG import/export actions, and CSV export actions are covered by structural and workflow evaluation.
- The final evaluation run generated `xuejian/test-results/eval-report.json` and `xuejian/test-results/eval-report.md` with `deliveryGatePassed: true`.
- Final green run snapshot: 17 structural checks passed, targeted TypeScript checks passed, `cargo check` passed, 35 targeted Vitest tests passed, 12 Rust tests passed, and 2 Playwright scenarios passed.
- Phase 6-9 items remain roadmap evaluation items and are outside the current delivery gate defined in Section 4.5.

---

## 12. Repair Workflow

Every failing item follows the same lifecycle.

1. Reproduce the failure.
2. Identify root cause.
3. Implement the smallest correct fix.
4. Add or update tests.
5. Re-run the affected evaluation slice.
6. Update this document with final status.

Repair rules:

- Prefer root-cause fixes over superficial guards.
- Do not “pass” an item by weakening tests without justification.
- Do not mark a feature complete if only static code exists without usable workflow.

---

## 13. Pass and Fail Semantics

### 13.1 Item Status Values

| Status    | Meaning                           |
| --------- | --------------------------------- |
| Pending   | Not yet evaluated                 |
| In Review | Evidence is being collected       |
| Failed    | Evaluated and did not pass        |
| Passed    | Evaluated and accepted            |
| Waived    | Explicitly excluded from the gate |

### 13.2 Waiver Policy

Waivers are strongly discouraged.

A waiver is only allowed if:

- the feature is explicitly outside the requested gate, and
- the waiver is documented in this file, and
- the waiver does not compromise the Phase 0-5 delivery gate

At present, no waivers are granted.

---

## 14. Execution Log

### 14.1 Run 1 - Framework Creation

- Created this document.
- Established evaluation matrix and pass criteria.
- Next: implement automation scripts and begin collecting hard evidence.

### 14.2 Run 2 - Baseline Evaluation

- Structural baseline confirmed major gaps around real edit flow, image occlusion UI, media upload UX, direct page coverage, and automation absence.
- Initial delivery gate failed before repair.

### 14.3 Run 3 - Repair Cycle

- Added card-system evaluation automation under `xuejian/scripts/eval/` and wired `npm run eval:cards`.
- Implemented real update-card flow across TS gateway/query and Rust command/repository layers.
- Added image occlusion rendering, media upload UI, mutable mock gateway behavior, targeted unit tests, targeted schema tests, and happy-path Playwright coverage.
- Repaired Rust document/section repository issues and stabilized browser selectors for evaluation flows.

### 14.4 Run 4 - Final Verification

- Executed `npm run eval:cards` successfully on 2026-04-21.
- Final report: Phase 0-5 average = 10, cross-architecture = 10, cross-IPC = 10, cross-engineering = 10.
- Final report path: `xuejian/test-results/eval-report.json` and `xuejian/test-results/eval-report.md`.
- Delivery gate status: passed.

---

## 15. Exit Condition

This document reaches “All Clear” only when:

1. every Phase 0-5 feature has a final score and status,
2. all gating cross-cutting items are passed,
3. the generated evaluation report says `deliveryGatePassed: true`, and
4. the execution log records the final green run.

Until then, this document remains an active repair artifact rather than historical documentation.

All exit conditions are satisfied as of 2026-04-21, and this document is now a historical verification record until the next card-system regression or scope expansion.
