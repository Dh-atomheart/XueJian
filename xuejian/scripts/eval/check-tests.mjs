import { commandName, countFailedFromText, countPassedFromText, isMainModule, runCommand } from './shared.mjs'

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

export async function runTestChecks() {
  const vitest = await runCommand({
    command: commandName('npx'),
    args: ['vitest', 'run', ...vitestTargets],
  })

  const cargoTest = await runCommand({
    command: commandName('cargo'),
    args: ['test', '--manifest-path', 'src-tauri/Cargo.toml'],
  })

  return {
    name: 'tests',
    passed: vitest.passed && cargoTest.passed,
    vitest: {
      ...vitest,
      passedCount: countPassedFromText(`${vitest.stdout}\n${vitest.stderr}`),
      failedCount: countFailedFromText(`${vitest.stdout}\n${vitest.stderr}`),
    },
    cargoTest: {
      ...cargoTest,
      passedCount: countPassedFromText(`${cargoTest.stdout}\n${cargoTest.stderr}`),
      failedCount: countFailedFromText(`${cargoTest.stdout}\n${cargoTest.stderr}`),
    },
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runTestChecks()
  console.log(JSON.stringify(result, null, 2))
}