import {
  commandName,
  countFailedFromText,
  countPassedFromText,
  isMainModule,
  runCommand,
} from './shared.mjs'

const e2eTargets = ['tests/e2e/card-system-happy-path.spec.ts']

export async function runE2EChecks() {
  const playwright = await runCommand({
    command: commandName('npx'),
    args: ['playwright', 'test', ...e2eTargets, '--reporter=line', '--workers=1'],
  })

  return {
    name: 'e2e',
    passed: playwright.passed,
    cardSystemGating: {
      ...playwright,
      scope: 'card-system-gating',
      passedCount: countPassedFromText(`${playwright.stdout}\n${playwright.stderr}`),
      failedCount: countFailedFromText(`${playwright.stdout}\n${playwright.stderr}`),
      scenarios: e2eTargets,
    },
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runE2EChecks()
  console.log(JSON.stringify(result, null, 2))
}
