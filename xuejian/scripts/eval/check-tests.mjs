import {
  commandName,
  countFailedFromText,
  countPassedFromText,
  isMainModule,
  runCommand,
} from './shared.mjs'

const vitestTargets = [
  'tests/unit/card-content-renderer.test.tsx',
  'tests/unit/cloze-card-content.test.tsx',
  'tests/unit/choice-card-content.test.tsx',
  'tests/unit/image-occlusion-card-content.test.tsx',
  'tests/unit/card-editor-modal.test.tsx',
  'tests/unit/card-studio-page.test.tsx',
  'tests/unit/review-page.test.tsx',
  'tests/unit/cards-query-mutations.test.tsx',
  'tests/services/learning.test.ts',
  'tests/store/learning-session.test.ts',
  'tests/types/card-system-schema.test.ts',
]

function collectFailedExamples(text, patterns) {
  const examples = []

  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? []
    for (const match of matches) {
      if (!examples.includes(match)) {
        examples.push(match)
      }
    }
  }

  return examples
}

export async function runTestChecks() {
  const vitest = await runCommand({
    command: commandName('npx'),
    args: ['vitest', 'run', ...vitestTargets],
  })

  const cargoTest = await runCommand({
    command: commandName('cargo'),
    args: ['test', '--manifest-path', 'src-tauri/Cargo.toml'],
  })

  const vitestText = `${vitest.stdout}\n${vitest.stderr}`
  const cargoText = `${cargoTest.stdout}\n${cargoTest.stderr}`

  const cardSystemGating = {
    passed: vitest.passed && cargoTest.passed,
    vitest: {
      ...vitest,
      scope: 'card-system-gating',
      passedCount: countPassedFromText(vitestText),
      failedCount: countFailedFromText(vitestText),
      failedExamples: collectFailedExamples(vitestText, [/FAIL\s+([^\r\n]+)/g]),
    },
    cargoTest: {
      ...cargoTest,
      scope: 'card-system-gating',
      passedCount: countPassedFromText(cargoText),
      failedCount: countFailedFromText(cargoText),
      failedExamples: collectFailedExamples(cargoText, [/test\s+([^\s]+)\s+\.\.\.\s+FAILED/g]),
    },
  }

  return {
    name: 'tests',
    passed: cardSystemGating.passed,
    cardSystemGating,
    repoHealth: {
      executed: false,
      passed: true,
      warnings: [],
    },
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runTestChecks()
  console.log(JSON.stringify(result, null, 2))
}
