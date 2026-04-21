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
    playwright: {
      ...playwright,
      passedCount: countPassedFromText(`${playwright.stdout}\n${playwright.stderr}`),
      failedCount: countFailedFromText(`${playwright.stdout}\n${playwright.stderr}`),
    },
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runE2EChecks()
  console.log(JSON.stringify(result, null, 2))
}
