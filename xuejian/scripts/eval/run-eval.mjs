import { execSync } from 'node:child_process'
import { runE2EChecks } from './check-e2e.mjs'
import { runStructureCheck } from './check-structure.mjs'
import { runTestChecks } from './check-tests.mjs'
import { runTypeChecks } from './check-types.mjs'
import { writeJson, writeText } from './shared.mjs'

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

function extractWarningCount(result) {
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  return (text.match(/warning:/gi) ?? []).length
}

function buildFailure(id, source, summary, extra = {}) {
  return {
    id,
    source,
    summary,
    ...extra,
  }
}

function buildMarkdownReport(report) {
  const lines = []
  lines.push('# Card System Evaluation Report')
  lines.push('')
  lines.push(`- Timestamp: ${report.timestamp}`)
  lines.push(`- Branch: ${report.git.branch}`)
  lines.push(`- Baseline Mode: ${report.baselineMode}`)
  lines.push(`- Delivery Gate: ${report.deliveryGatePassed ? 'passed' : 'failed'}`)
  lines.push('')
  lines.push('## Check Summary')
  lines.push('')
  lines.push(
    `- Structure: ${report.checks.structure.gatingPassed ? 'passed' : 'failed'} (${report.checks.structure.summary.passed}/${report.checks.structure.summary.total}, gating failed: ${report.checks.structure.summary.gatingFailed})`
  )
  lines.push(`- Frontend Build: ${report.checks.types.frontendBuild.passed ? 'passed' : 'failed'}`)
  lines.push(`- Rust Check: ${report.checks.types.rustCheck.passed ? 'passed' : 'failed'}`)
  lines.push(`- Vitest: ${report.checks.tests.cardSystemGating.vitest.passed ? 'passed' : 'failed'}`)
  lines.push(`- Cargo Test: ${report.checks.tests.cardSystemGating.cargoTest.passed ? 'passed' : 'failed'}`)
  lines.push(`- Playwright: ${report.checks.e2e.cardSystemGating.passed ? 'passed' : 'failed'}`)
  lines.push('')

  lines.push('## Gating Failures')
  lines.push('')
  if (report.gatingFailures.length === 0) {
    lines.push('- None')
  } else {
    for (const failure of report.gatingFailures) {
      lines.push(`- ${failure.id}: ${failure.summary}`)
    }
  }
  lines.push('')

  lines.push('## Script Drift Findings')
  lines.push('')
  if (report.scriptDriftFindings.length === 0) {
    lines.push('- None')
  } else {
    for (const finding of report.scriptDriftFindings) {
      lines.push(`- ${finding.id}: ${finding.summary}`)
    }
  }
  lines.push('')

  lines.push('## Repo Health Warnings')
  lines.push('')
  if (report.repoHealthWarnings.length === 0) {
    lines.push('- None')
  } else {
    for (const warning of report.repoHealthWarnings) {
      lines.push(`- ${warning.id}: ${warning.summary}`)
    }
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

const structure = await runStructureCheck()
const types = await runTypeChecks()
const tests = await runTestChecks()
const e2e = await runE2EChecks()

const gatingFailures = []
const scriptDriftFindings = []
const repoHealthWarnings = []

for (const item of structure.items) {
  if (item.gating && item.status === 'failed') {
    gatingFailures.push(
      buildFailure(
        item.id,
        'structure',
        `${item.file} is missing required contract markers`,
        { file: item.file, missingPatterns: item.missingPatterns }
      )
    )
  }
}

if (!types.frontendBuild.passed) {
  gatingFailures.push(
    buildFailure('frontend-build', 'types', 'TypeScript card-system build failed')
  )
}

if (!types.rustCheck.passed) {
  gatingFailures.push(buildFailure('rust-check', 'types', 'Rust card-system check failed'))
}

if (!tests.cardSystemGating.vitest.passed) {
  gatingFailures.push(
    buildFailure(
      'vitest-card-system',
      'tests',
      `Vitest gating suite failed (${tests.cardSystemGating.vitest.failedCount ?? 0} failed)`,
      { failedExamples: tests.cardSystemGating.vitest.failedExamples }
    )
  )
}

if (!tests.cardSystemGating.cargoTest.passed) {
  gatingFailures.push(
    buildFailure(
      'cargo-test-card-system',
      'tests',
      `Cargo gating suite failed (${tests.cardSystemGating.cargoTest.failedCount ?? 0} failed)`,
      { failedExamples: tests.cardSystemGating.cargoTest.failedExamples }
    )
  )
}

if (!e2e.cardSystemGating.passed) {
  gatingFailures.push(
    buildFailure(
      'playwright-card-system',
      'e2e',
      `Playwright card-system gating scenarios failed (${e2e.cardSystemGating.failedCount ?? 0} failed)`,
      { scenarios: e2e.cardSystemGating.scenarios }
    )
  )
}

if (getGitSummary().hasUncommittedChanges) {
  repoHealthWarnings.push(
    buildFailure('dirty-worktree', 'repo', 'Git working tree contains uncommitted changes')
  )
}

const rustWarningCount = extractWarningCount(types.rustCheck)
if (rustWarningCount > 0) {
  repoHealthWarnings.push(
    buildFailure('rust-warnings', 'repo', `cargo check emitted ${rustWarningCount} warning(s)`)
  )
}

const report = {
  timestamp: new Date().toISOString(),
  baselineMode: 'repair-driven',
  git: getGitSummary(),
  checks: {
    structure,
    types,
    tests,
    e2e,
  },
  deliveryGatePassed: gatingFailures.length === 0,
  gatingFailures,
  scriptDriftFindings,
  repoHealthWarnings,
  scores: {
    deliveryGatePassed: gatingFailures.length === 0,
  },
}

await writeJson('test-results/eval-report.json', report)
await writeText('test-results/eval-report.md', buildMarkdownReport(report))

console.log(JSON.stringify(report, null, 2))
