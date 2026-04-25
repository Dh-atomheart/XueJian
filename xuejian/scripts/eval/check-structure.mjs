import path from 'node:path'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { boolToStatus, isMainModule, readText, workspaceRoot } from './shared.mjs'

const checks = [
  {
    id: 'card-studio-auto-generation',
    file: 'src/features/cards/CardStudioPage.tsx',
    patterns: [
      'cardsGateway.startGeneration',
      'useCardsQuery',
    ],
    gating: true,
    area: 'formal-card-workbench',
  },
  {
    id: 'card-studio-formal-card-crud',
    file: 'src/features/cards/CardStudioPage.tsx',
    patterns: [
      'cardsGateway.create',
      'cardsGateway.update',
      'cardsGateway.delete',
      'CardEditorModal',
    ],
    gating: true,
    area: 'formal-card-crud',
  },
  {
    id: 'review-page-session-states',
    file: 'src/components/pages/review-page.tsx',
    patterns: [
      'data-testid="review-page-intro"',
      'data-testid="review-page-studying"',
      'data-testid="review-page-complete"',
      'data-testid="review-start-session"',
      'data-testid={`review-rate-${variant}`}',
    ],
    gating: true,
    area: 'review-session',
  },
  {
    id: 'update-card-command',
    file: 'src-tauri/src/commands/cards.rs',
    patterns: ['pub fn update_card(', 'pub struct UpdateCardDto'],
    gating: false,
    area: 'formal-card-model',
  },
  {
    id: 'update-card-repository',
    file: 'src-tauri/src/db/card_repo.rs',
    patterns: ['pub struct UpdateCardRequest', 'pub fn update_card(&self, id: &str'],
    gating: false,
    area: 'formal-card-model',
  },
  {
    id: 'update-card-gateway',
    file: 'src/services/gateway/cards.ts',
    patterns: [
      'export interface UpdateCardInput',
      'async update(id: string, data: UpdateCardInput): Promise<Card>',
    ],
    gating: false,
    area: 'formal-card-model',
  },
  {
    id: 'image-occlusion-component',
    file: 'src/components/cards/ImageOcclusionCardContent.tsx',
    patterns: ['export function ImageOcclusionCardContent', 'parseImageOcclusionPayload'],
    gating: false,
    area: 'card-types',
  },
  {
    id: 'image-occlusion-type',
    file: 'src/types/schema.ts',
    patterns: ["'image_occlusion'"],
    gating: false,
    area: 'card-types',
  },
  {
    id: 'card-editor-media-ui',
    file: 'src/components/cards/CardEditorModal.tsx',
    patterns: ['queuedMediaPaths', 'cardsGateway.uploadCardMedia', 'data-testid="card-editor-media-list"'],
    gating: false,
    area: 'card-editor',
  },
  {
    id: 'apkg-import-export-commands',
    file: 'src-tauri/src/commands/cards.rs',
    patterns: ['pub async fn import_cards_apkg(', 'pub async fn pick_and_export_apkg('],
    gating: false,
    area: 'enhancements',
  },
  {
    id: 'ai-choice-generation-contract',
    file: 'orchestration_service/workflows/card_generation.py',
    patterns: ['"choice": Multiple choice', '"cardType"'],
    gating: false,
    area: 'candidate-generation',
  },
  {
    id: 'ai-choice-schema-contract',
    file: 'orchestration_service/schemas/card_draft.py',
    patterns: ['Literal["qa", "cloze", "fact", "choice"]'],
    gating: false,
    area: 'candidate-generation',
  },
  {
    id: 'unit-test-card-studio',
    file: 'tests/unit/card-studio-page.test.tsx',
    patterns: [
      "describe('CardStudioPage'",
      'starts generation for the selected ready document',
      'creates, edits, and deletes formal cards',
    ],
    gating: true,
    area: 'tests',
  },
  {
    id: 'unit-test-review-page',
    file: 'tests/unit/review-page.test.tsx',
    patterns: ["describe('ReviewPage'", 'starts a study session and completes it'],
    gating: true,
    area: 'tests',
  },
  {
    id: 'unit-test-renderers',
    file: 'tests/unit/image-occlusion-card-content.test.tsx',
    patterns: ["describe('ImageOcclusionCardContent'"],
    gating: false,
    area: 'tests',
  },
  {
    id: 'e2e-happy-path-spec',
    file: 'tests/e2e/card-system-happy-path.spec.ts',
    patterns: ['card-studio-page', 'review-page-complete', 'review-start-session'],
    gating: true,
    area: 'tests',
  },
]

async function fileExists(relativePath) {
  try {
    await access(path.join(workspaceRoot, relativePath), fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function runStructureCheck() {
  const items = []

  for (const check of checks) {
    const exists = await fileExists(check.file)
    let passed = exists
    let missingPatterns = []

    if (exists && check.patterns?.length) {
      const content = await readText(check.file)
      missingPatterns = check.patterns.filter((pattern) => !content.includes(pattern))
      passed = missingPatterns.length === 0
    }

    items.push({
      id: check.id,
      file: check.file,
      gating: check.gating,
      area: check.area,
      status: boolToStatus(passed),
      missingPatterns,
    })
  }

  const passed = items.filter((item) => item.status === 'passed').length
  const failed = items.length - passed
  const gatingFailed = items.filter((item) => item.gating && item.status === 'failed').length

  return {
    name: 'structure',
    passed: failed === 0,
    gatingPassed: gatingFailed === 0,
    summary: { passed, failed, total: items.length, gatingFailed },
    items,
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runStructureCheck()
  console.log(JSON.stringify(result, null, 2))
}
