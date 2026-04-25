import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`missing environment variable: ${name}`)
  }
  return value
}

async function main() {
  const outputDir = process.env.RELEASE_METADATA_DIR ?? 'release-metadata'
  const tag = requiredEnv('RELEASE_TAG')
  const sha = requiredEnv('GITHUB_SHA')
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? 'unknown'
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? 'unknown'
  const generatedAt = new Date().toISOString()

  const metadata = {
    tag,
    sha,
    runNumber,
    runAttempt,
    generatedAt,
    signed: Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY),
    notes: [
      'Windows-first release pipeline.',
      'Unsigned artifacts are expected when signing secrets are not configured.',
      'Auto-update publication is reserved for a future iteration.',
    ],
  }

  const notes = [
    `# ${tag}`,
    '',
    '- Platform: Windows',
    `- Commit: \`${sha}\``,
    `- Generated At: ${generatedAt}`,
    `- GitHub Run: ${runNumber}.${runAttempt}`,
    `- Signing: ${metadata.signed ? 'enabled' : 'disabled (unsigned artifact)'}`,
    '- Preflight Checks: `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run test:smoke`',
    '- Known Limits: no updater publishing, no notarization, Windows-only release pipeline',
  ].join('\n')

  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'release-notes.md'), `${notes}\n`, 'utf8')
}

await main()
