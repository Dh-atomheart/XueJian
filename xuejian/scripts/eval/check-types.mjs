import { commandName, isMainModule, runCommand } from './shared.mjs'

export async function runTypeChecks() {
  const frontendBuild = await runCommand({
    command: commandName('npx'),
    args: ['tsc', '-p', 'tsconfig.card-eval.json', '--pretty', 'false'],
  })

  const rustCheck = await runCommand({
    command: commandName('cargo'),
    args: ['check', '--manifest-path', 'src-tauri/Cargo.toml'],
  })

  return {
    name: 'types',
    passed: frontendBuild.passed && rustCheck.passed,
    frontendBuild,
    rustCheck,
  }
}

if (isMainModule(import.meta.url)) {
  const result = await runTypeChecks()
  console.log(JSON.stringify(result, null, 2))
}
