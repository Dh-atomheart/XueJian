import { execSync } from 'node:child_process'
import { runE2EChecks } from './check-e2e.mjs'
import { runStructureCheck } from './check-structure.mjs'
import { runTestChecks } from './check-tests.mjs'
import { runTypeChecks } from './check-types.mjs'
import { roundScore, writeJson, writeText } from './shared.mjs'

function getGitSummary() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    const status = execSync('git status --short', { encoding: 'utf8' }).trim()
    return {
      branch,
      hasUncommittedChanges: status.length > 0,
    }
  } catch {
    return {
      branch: 'unknown',
      hasUncommittedChanges: true,
    }
  }
}

function buildPhaseScore({ structurePassed, testPassed, buildPassed, e2ePassed = false }) {
  const structureScore = structurePassed ? 3 : 1.5
  const testScore = testPassed ? 3 : 1
  const buildScore = buildPassed ? 2 : 0.5
  const e2eScore = e2ePassed ? 2 : 0
  return roundScore(Math.min(10, 2 + structureScore + testScore + buildScore + e2eScore))
}

function findItem(result, id) {
  return result.items.find((item) => item.id === id)?.status === 'passed'
}

function buildMarkdownReport(report) {
  const lines = []
  lines.push('# Card System Evaluation Report')
  lines.push('')
  lines.push(`- Timestamp: ${report.timestamp}`)
  lines.push(`- Branch: ${report.git.branch}`)
  lines.push(`- Delivery Gate: ${report.scores.deliveryGatePassed ? 'passed' : 'failed'}`)
  lines.push(`- Phase 0-5 Average: ${report.scores.phase0to5Average}`)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  lines.push(
    `- Structure: ${report.checks.structure.passed ? 'passed' : 'failed'} (${report.checks.structure.summary.passed}/${report.checks.structure.summary.total})`
  )
  lines.push(`- Frontend Build: ${report.checks.types.frontendBuild.passed ? 'passed' : 'failed'}`)
  lines.push(`- Rust Check: ${report.checks.types.rustCheck.passed ? 'passed' : 'failed'}`)
  lines.push(`- Vitest: ${report.checks.tests.vitest.passed ? 'passed' : 'failed'}`)
  lines.push(`- Cargo Test: ${report.checks.tests.cargoTest.passed ? 'passed' : 'failed'}`)
  lines.push(`- Playwright: ${report.checks.e2e.playwright.passed ? 'passed' : 'failed'}`)
  lines.push('')
  lines.push('## Scores')
  lines.push('')
  lines.push(`- Phase 0: ${report.scores.phase0}`)
  lines.push(`- Phase 1: ${report.scores.phase1}`)
  lines.push(`- Phase 2: ${report.scores.phase2}`)
  lines.push(`- Phase 3: ${report.scores.phase3}`)
  lines.push(`- Phase 4: ${report.scores.phase4}`)
  lines.push(`- Phase 5: ${report.scores.phase5}`)
  lines.push(`- Cross Architecture: ${report.scores.crossArchitecture}`)
  lines.push(`- Cross IPC: ${report.scores.crossIpc}`)
  lines.push(`- Cross Engineering: ${report.scores.crossEngineering}`)
  lines.push('')
  if (report.defects.length > 0) {
    lines.push('## Defects')
    lines.push('')
    for (const defect of report.defects) {
      lines.push(`- ${defect.id}: ${defect.file}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

const structure = await runStructureCheck()
const types = await runTypeChecks()
const tests = await runTestChecks()
const e2e = await runE2EChecks()

const buildPassed = types.frontendBuild.passed && types.rustCheck.passed
const unitPassed = tests.vitest.passed
const rustTestsPassed = tests.cargoTest.passed
const e2ePassed = e2e.playwright.passed

const phase0 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'card-studio-edit-flow') &&
    findItem(structure, 'update-card-gateway') &&
    findItem(structure, 'unit-test-card-studio') &&
    findItem(structure, 'unit-test-review-page'),
  testPassed: unitPassed,
  buildPassed,
  e2ePassed,
})

const phase1 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'unit-test-renderers') &&
    findItem(structure, 'image-occlusion-component') &&
    findItem(structure, 'image-occlusion-type'),
  testPassed: unitPassed,
  buildPassed,
})

const phase2 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'update-card-command') &&
    findItem(structure, 'update-card-repository') &&
    findItem(structure, 'card-editor-media-ui'),
  testPassed: unitPassed,
  buildPassed,
})

const phase3 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'ai-choice-generation-contract') &&
    findItem(structure, 'ai-choice-schema-contract'),
  testPassed: unitPassed,
  buildPassed,
})

const phase4 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'image-occlusion-component') &&
    findItem(structure, 'card-editor-media-ui') &&
    findItem(structure, 'apkg-import-export-commands') &&
    findItem(structure, 'e2e-happy-path-spec'),
  testPassed: unitPassed && e2ePassed,
  buildPassed,
  e2ePassed,
})

const phase5 = buildPhaseScore({
  structurePassed:
    findItem(structure, 'ai-choice-generation-contract') &&
    findItem(structure, 'ai-choice-schema-contract'),
  testPassed: unitPassed,
  buildPassed,
})

const phase0to5Average = roundScore((phase0 + phase1 + phase2 + phase3 + phase4 + phase5) / 6)

const crossArchitecture = roundScore(
  buildPhaseScore({
    structurePassed:
      findItem(structure, 'update-card-command') &&
      findItem(structure, 'update-card-repository') &&
      findItem(structure, 'apkg-import-export-commands'),
    testPassed: rustTestsPassed,
    buildPassed,
  })
)

const crossIpc = roundScore(
  buildPhaseScore({
    structurePassed:
      findItem(structure, 'update-card-gateway') &&
      findItem(structure, 'mock-gateway-mutable-card-flow'),
    testPassed: unitPassed,
    buildPassed,
  })
)

const crossEngineering = roundScore(
  buildPhaseScore({
    structurePassed:
      findItem(structure, 'unit-test-card-studio') && findItem(structure, 'unit-test-review-page'),
    testPassed: unitPassed && rustTestsPassed,
    buildPassed,
    e2ePassed,
  })
)

const defects = structure.items.filter((item) => item.status === 'failed')

const report = {
  timestamp: new Date().toISOString(),
  git: getGitSummary(),
  checks: {
    structure,
    types,
    tests,
    e2e,
  },
  scores: {
    phase0,
    phase1,
    phase2,
    phase3,
    phase4,
    phase5,
    phase6: null,
    phase7: null,
    phase8: null,
    phase9: null,
    crossArchitecture,
    crossIpc,
    crossEngineering,
    phase0to5Average,
    deliveryGatePassed:
      structure.passed &&
      buildPassed &&
      unitPassed &&
      rustTestsPassed &&
      e2ePassed &&
      phase0to5Average >= 8,
  },
  defects,
}

await writeJson('test-results/eval-report.json', report)
await writeText('test-results/eval-report.md', buildMarkdownReport(report))

console.log(JSON.stringify(report, null, 2))
