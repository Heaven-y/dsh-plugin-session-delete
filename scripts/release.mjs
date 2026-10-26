#!/usr/bin/env node
/**
 * Cut one release and put it on both channels with a single command.
 *
 * GitHub already holds the code, so the release is the tag: pushing a `v*` tag
 * is what makes GitHub show a release *and* what wakes the Publish workflow,
 * which ships the same commit to npm over OIDC. There is deliberately no second
 * step to forget and no npm credential anywhere.
 *
 * Usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find((value) => !value.startsWith('--'))

/**
 * The npm launcher for this platform. Windows ships `npm.cmd`, and `execFile`
 * does not go through a shell, so the bare name resolves to nothing there.
 */
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/** Run a command in the repository root, returning its stdout. */
function run(command, argv, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return undefined
    const detail = error.stderr?.trim() || error.message
    console.error(`\n${command} ${argv.join(' ')} failed:\n${detail}\n`)
    process.exit(1)
  }
}

if (target === undefined) {
  console.error('Usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--dry-run]')
  process.exit(1)
}

// A release must start from a tree that is exactly what was reviewed and tested.
const dirty = run('git', ['status', '--porcelain'])
if (dirty !== '') {
  console.error('The working tree has uncommitted changes. Commit or stash them first:\n')
  console.error(dirty)
  process.exit(1)
}

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') {
  console.error(`Releases are cut from main; this checkout is on "${branch}".`)
  process.exit(1)
}

console.log(`current version: ${current}`)
console.log('running the suites before tagging...')
run('node', ['test/host.test.mjs'])
run('node', ['test/client.test.mjs'])
console.log('tests passed')

if (dryRun) {
  console.log(`\n--dry-run: would bump ${target}, tag v<next>, and push to origin.`)
  process.exit(0)
}

// `npm version` bumps the manifest, commits it and creates the annotated tag in
// one step, so the tag can never point at a tree with a stale version.
const tagged = run(NPM, ['version', target, '-m', `chore(release): v%s`])
console.log(`tagged: ${tagged}`)
run('git', ['push', 'origin', 'HEAD', '--follow-tags'])
console.log('\npushed. GitHub now shows the release, and the Publish workflow ships it to npm.')

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
console.log(`\nfollow the run: gh run list --workflow=publish.yml   (or the Actions tab)`)
console.log(`once green:     npm view @coder02lq/dsh-plugin-session-delete@${version} version`)
