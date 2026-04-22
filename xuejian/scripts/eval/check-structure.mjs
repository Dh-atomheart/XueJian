import path from 'node:path'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { boolToStatus, isMainModule, readText, workspaceRoot } from './shared.mjs'

const checks = [
  {
    id: 'update-card-command',
    file: 'src-tauri/src/commands/cards.rs',
    patterns: ['pub fn update_card(', 'pub struct UpdateCardDto'],
  },
  {
    id: 'update-card-repository',
    file: 'src-tauri/src/db/card_repo.rs',
    patterns: ['pub struct UpdateCardRequest', 'pub fn update_card(&self, id: &str'],
  },
  {
    id: 'update-card-gateway',
    file: 'src/services/gateway/cards.ts',
    patterns: [
      'export interface UpdateCardInput',
      'async update(id: string, data: UpdateCardInput): Promise<Card>',
    ],
  },
  {
    id: 'update-card-mutation',
    file: 'src/queries/cards.ts',
    patterns: ['export function useUpdateCardMutation()', 'cardsGateway.update(id, data)'],
  },
  {
    id: 'image-occlusion-component',
    file: 'src/components/cards/ImageOcclusionCardContent.tsx',
    patterns: ['export function ImageOcclusionCardContent', 'parseImageOcclusionPayload'],
  },
  {
    id: 'image-occlusion-type',
    file: 'src/types/schema.ts',
    patterns: ["'image_occlusion'"],
  },
  {
    id: 'card-editor-media-ui',
    file: 'src/components/cards/CardEditorModal.tsx',
    patterns: ['queuedMediaPaths', 'cardsGateway.uploadCardMedia', '图像遮挡'],
  },
  {
    id: 'card-studio-edit-flow',
    file: 'src/features/cards/CardStudioPage.tsx',
    patterns: ['useUpdateCardMutation', 'handleSaveCard', 'card-studio-edit-'],
  },
  {
    id: 'review-page-image-occlusion-route',
    file: 'src/features/review/ReviewPage.tsx',
    patterns: ["currentCard.cardType === 'image_occlusion'", 'review-page-studying'],
  },
  {
    id: 'mock-gateway-mutable-card-flow',
    file: 'src/services/gateway/mockData.ts',
    patterns: [
      "if (cmd === 'create_card')",
      "if (cmd === 'update_card')",
      "if (cmd === 'upload_card_media')",
    ],
  },
  {
    id: 'apkg-import-export-commands',
    file: 'src-tauri/src/commands/cards.rs',
    patterns: ['pub async fn import_cards_apkg(', 'pub async fn pick_and_export_apkg('],
  },
  {
    id: 'ai-choice-generation-contract',
    file: 'orchestration_service/workflows/card_generation.py',
    patterns: ['"choice": Multiple choice', '"cardType"'],
  },
  {
    id: 'ai-choice-schema-contract',
    file: 'orchestration_service/schemas/card_draft.py',
    patterns: ['Literal["qa", "cloze", "fact", "choice"]'],
  },
  {
    id: 'unit-test-card-studio',
    file: 'tests/unit/card-studio-page.test.tsx',
    patterns: ["describe('CardStudioPage'", 'creates a card through the editor modal'],
  },
  {
    id: 'unit-test-review-page',
    file: 'tests/unit/review-page.test.tsx',
    patterns: ["describe('ReviewPage'", 'starts a study session and completes it'],
  },
  {
    id: 'unit-test-renderers',
    file: 'tests/unit/image-occlusion-card-content.test.tsx',
    patterns: ["describe('ImageOcclusionCardContent'"],
  },
  {
    id: 'e2e-happy-path-spec',
    file: 'tests/e2e/card-system-happy-path.spec.ts',
    patterns: ['card study happy path reaches the completion screen'],
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
      status: boolToStatus(passed),
      missingPatterns,
    })
  }

  const passed = items.filter((item) => item.status === 'passed').length
  const failed = items.length - passed

  return {
    name: 'structure',
    passed: failed === 0,
    summary: { passed, failed, total: items.length },
    items,
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runStructureCheck()
  console.log(JSON.stringify(result, null, 2))
}
