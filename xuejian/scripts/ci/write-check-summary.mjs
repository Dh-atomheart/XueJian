import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const result = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const key = token.slice(2)
    const value = argv[index + 1]
    if (value && !value.startsWith('--')) {
      result[key] = value
      index += 1
      continue
    }

    result[key] = 'true'
  }

  return result
}

function normalizeStatus(status) {
  return status === 'passed' ? 'passed' : 'failed'
}

function escapeValue(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const output = args.output
  const name = args.name ?? 'check'
  const status = normalizeStatus(args.status)
  const command = args.command ?? ''
  const details = args.details ?? ''
  const stdoutFile = args['stdout-file'] ?? ''
  const stderrFile = args['stderr-file'] ?? ''
  const artifact = args.artifact ?? ''

  if (!output) {
    throw new Error('missing --output')
  }

  const lines = [
    '# Check Summary',
    '',
    `- Name: ${escapeValue(name)}`,
    `- Status: ${status}`,
  ]

  if (command) {
    lines.push(`- Command: \`${escapeValue(command)}\``)
  }

  if (details) {
    lines.push(`- Details: ${escapeValue(details)}`)
  }

  if (artifact) {
    lines.push(`- Artifact: ${escapeValue(artifact)}`)
  }

  if (stdoutFile) {
    lines.push(`- Stdout: ${escapeValue(stdoutFile)}`)
  }

  if (stderrFile) {
    lines.push(`- Stderr: ${escapeValue(stderrFile)}`)
  }

  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${lines.join('\n')}\n`, 'utf8')
}

await main()
