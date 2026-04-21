import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const workspaceRoot = path.resolve(__dirname, '..', '..')
export const testResultsDir = path.join(workspaceRoot, 'test-results')
export const isWindows = process.platform === 'win32'

export function commandName(name) {
  if (!isWindows) {
    return name
  }

  return ['npm', 'npx', 'pnpm'].includes(name) ? `${name}.cmd` : name
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true })
}

export async function readText(relativePath) {
  return readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

export async function writeJson(relativePath, value) {
  const target = path.join(workspaceRoot, relativePath)
  await ensureDir(path.dirname(target))
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function writeText(relativePath, value) {
  const target = path.join(workspaceRoot, relativePath)
  await ensureDir(path.dirname(target))
  await writeFile(target, value, 'utf8')
}

export function boolToStatus(value) {
  return value ? 'passed' : 'failed'
}

export async function runCommand({ command, args = [], cwd = workspaceRoot, allowFailure = true }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: isWindows,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      const result = {
        command: [command, ...args].join(' '),
        cwd,
        stdout,
        stderr,
        exitCode: -1,
        passed: false,
      }

      if (!allowFailure) {
        reject(Object.assign(error, { result }))
        return
      }

      resolve(result)
    })

    child.on('close', (code) => {
      const result = {
        command: [command, ...args].join(' '),
        cwd,
        stdout,
        stderr,
        exitCode: code ?? 0,
        passed: (code ?? 0) === 0,
      }

      if (!result.passed && !allowFailure) {
        reject(Object.assign(new Error(`Command failed: ${result.command}`), { result }))
        return
      }

      resolve(result)
    })
  })
}

export function countPassedFromText(text) {
  const directMatch = text.match(/(\d+)\s+passed/i)
  if (directMatch) {
    return Number(directMatch[1])
  }

  const cargoMatch = text.match(/test result: ok\.[^\n]*?(\d+) passed/i)
  if (cargoMatch) {
    return Number(cargoMatch[1])
  }

  return null
}

export function countFailedFromText(text) {
  const directMatch = text.match(/(\d+)\s+failed/i)
  if (directMatch) {
    return Number(directMatch[1])
  }

  const cargoMatch = text.match(/test result: [^.]+\.[^\n]*?(\d+) failed/i)
  if (cargoMatch) {
    return Number(cargoMatch[1])
  }

  return 0
}

export function roundScore(value) {
  return Math.round(value * 10) / 10
}

export function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl)
}