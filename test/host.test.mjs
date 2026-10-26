/**
 * Throwaway harness test for the Session Delete Host half. Exercises the full
 * delete sequence against fabricated services, so every side effect and its
 * order is asserted without touching a real Session.
 *
 * Run: node harness-test.mjs   (from this directory)
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const { apply } = await import('../index.js')

const SESSION = 'session-test-0001'
const OTHER = 'session-other-0002'

/** Build the fabricated Host, returning the service plus a call log. */
async function makeHost({ live = false, archived = false, locateBroken = false, children = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sd-test-'))
  const dir = join(root, 'sessions', '--proj--', SESSION)
  await mkdir(dir, { recursive: true })
  const logPath = join(dir, 'session.v4.jsonl.zstd')
  await writeFile(logPath, 'x')
  // One directory per subagent child, so the cascade has real trees to remove.
  const childDirs = new Map()
  for (const child of children) {
    const childDir = join(root, 'sessions', '--proj--', child)
    await mkdir(childDir, { recursive: true })
    await writeFile(join(childDir, 'session.v4.jsonl.zstd'), 'x')
    childDirs.set(child, join(childDir, 'session.v4.jsonl.zstd'))
  }
  // A path the filesystem refuses outright: `rm` throws a non-retryable error,
  // which is how the locked-tree branch is exercised deterministically. (Node's
  // `rm` clears read-only attributes and deletes plain files, so a genuinely
  // locked tree cannot be produced portably inside one process.)
  const blockedPath = join(root, 'blocked', 'session.v4.jsonl.zstd').replace('blocked', 'bad\u0000name')

  const calls = []
  let stillLive = live
  const workspace = {
    sessionIds: [SESSION, OTHER],
    async detachSession(id) {
      calls.push(['detachSession', id])
      this.sessionIds = this.sessionIds.filter((value) => value !== id)
    },
  }
  const registry = {
    list: () => [workspace],
    get archivedSessionIds() {
      return archived ? [SESSION, OTHER] : []
    },
    get pinnedSessionIds() {
      return []
    },
    async archiveSession(id, options) {
      calls.push(['archiveSession', id, options])
    },
    async stopSessionActivity(id) {
      calls.push(['stopSessionActivity', id])
    },
    async unarchiveSession(id) {
      calls.push(['unarchiveSession', id])
    },
    async unpinSession(id) {
      calls.push(['unpinSession', id])
    },
    async listStoredHeaders() {
      return [
        { id: SESSION, cwd: 'D:\\x' },
        { id: OTHER, cwd: 'D:\\x' },
        // Subagent children of SESSION, plus a fork that must survive.
        ...children.map((child) => ({
          id: child,
          cwd: 'D:\\x',
          origin: 'subagent',
          parentSession: SESSION,
        })),
        { id: 'session-forked', cwd: 'D:\\x', parentSession: SESSION },
      ]
    },
    async replaceHeaderIndex(headers) {
      calls.push(['replaceHeaderIndex', headers.map((header) => header.id)])
    },
    rebuildEntities() {
      calls.push(['rebuildEntities'])
    },
  }
  const persistence = {
    async stat(id) {
      if (id === SESSION || childDirs.has(id)) return { header: { id, cwd: 'D:\\x' } }
      return undefined
    },
    locate(header) {
      calls.push(['locate', header.id])
      if (locateBroken && header.id === SESSION) return { path: blockedPath }
      if (childDirs.has(header.id)) return { path: childDirs.get(header.id) }
      return { path: logPath }
    },
  }
  const cacheRows = {
    get: (id) => (id === SESSION ? { asOfSeq: 1 } : undefined),
    async delete(id) {
      calls.push(['cacheDelete', id])
    },
  }
  const domain = { get: () => ({ table: () => cacheRows }) }
  const services = {
    workspaceRegistry: registry,
    sessionPersistence: persistence,
    storageDomain: domain,
    sessions: { get: () => (stillLive ? { id: SESSION } : undefined) },
    agents: { get: () => undefined },
  }

  let service
  const registered = []
  const ctx = {
    workspaceRegistry: registry,
    sessionPersistence: persistence,
    get: (name) => services[name],
    provide(name, value) {
      calls.push(['provide', name])
      service = value
    },
    tools: {
      register(definition) {
        registered.push(definition)
      },
    },
  }
  apply(ctx)
  return { service, calls, root, dir, registered, registry, persistence, cacheRows,
    stopLive: () => { stillLive = false } }
}

/* 1. The full sequence, for a stored Session that is the current row of a Workspace. */
{
  const host = await makeHost()
  const result = await host.service.delete(SESSION)
  assert.deepEqual(result, { sessionId: SESSION, deleted: true, cascadedSessionIds: [] })

  const order = host.calls.map((call) => call[0])
  assert.deepEqual(order, [
    'provide',
    'archiveSession',
    'detachSession',
    'unarchiveSession',
    'unpinSession',
    'cacheDelete',
    'locate',
    'replaceHeaderIndex',
    'rebuildEntities',
  ])
  const archive = host.calls.find((call) => call[0] === 'archiveSession')
  assert.equal(archive[1], SESSION)
  assert.deepEqual(archive[2], { stopActivity: true }, 'archive must stop the Session work')
  const detach = host.calls.find((call) => call[0] === 'detachSession')
  assert.equal(detach[1], SESSION, 'only the target Session leaves the Workspace')
  const index = host.calls.find((call) => call[0] === 'replaceHeaderIndex')
  assert.deepEqual(index[1], [OTHER, 'session-forked'], 'the deleted header leaves the rebuilt index, a fork stays')

  await assert.rejects(() => import('node:fs/promises').then((fs) => fs.stat(host.dir)), { code: 'ENOENT' })
  assert.deepEqual(host.registered.map((tool) => tool.name), ['session_delete'])
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 1 - stored Session in a Workspace: archive, detach, cache, files, index')
}

/* 2. An already-archived Session dispatches the stops directly. */
{
  const host = await makeHost({ archived: true })
  await host.service.delete(SESSION)
  const order = host.calls.map((call) => call[0])
  assert.ok(!order.includes('archiveSession'))
  assert.ok(order.includes('stopSessionActivity'))
  assert.ok(order.includes('unarchiveSession'))
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 2 - already-archived Session: stops dispatched without re-archiving')
}

/* 3. A live Session is waited for, then deleted. */
{
  const host = await makeHost({ live: true })
  setTimeout(host.stopLive, 250)
  const started = Date.now()
  await host.service.delete(SESSION)
  assert.ok(Date.now() - started >= 200, 'the delete waited for teardown')
  assert.ok(!(await import('node:fs/promises').then((fs) => fs.stat(host.dir).then(() => true, () => false))))
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 3 - live Session: waits for teardown before removing files')
}

/* 4. An id that nothing references is refused, and nothing is touched. */
{
  const host = await makeHost()
  await assert.rejects(() => host.service.delete('session-nobody'), (error) => {
    assert.equal(error.code, 'session/not-found')
    assert.equal(error.isDSHRemoteError, true)
    return true
  })
  const touched = host.calls.filter((call) => call[0] !== 'provide')
  assert.deepEqual(touched, [], 'a refused id performs no mutation')
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 4 - unknown id: refused as session/not-found with no mutation')
}

/* 5. An empty id is a boundary failure, not a lookup. */
{
  const host = await makeHost()
  await assert.rejects(() => host.service.delete(''), (error) => {
    assert.equal(error.code, 'gateway/bad-request')
    return true
  })
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 5 - empty id: gateway/bad-request')
}

/* 6. A registration whose log is already gone is purged, not refused. */
{
  const host = await makeHost()
  const result = await host.service.delete(OTHER)
  assert.deepEqual(result, { sessionId: OTHER, deleted: true, cascadedSessionIds: [] })
  const detach = host.calls.find((call) => call[0] === 'detachSession')
  assert.equal(detach[1], OTHER, 'the dangling registration is detached')
  assert.ok(!host.calls.some((call) => call[0] === 'archiveSession'), 'no log means nothing to archive')
  assert.ok(!host.calls.some((call) => call[0] === 'locate'), 'no log means nothing to locate')
  assert.ok(host.calls.some((call) => call[0] === 'replaceHeaderIndex'))
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 6 - registered Session without a log: registration purged')
}

/* 7. A tree that cannot be removed reports session/locked, keeping the truth. */
{
  const host = await makeHost({ locateBroken: true })
  await assert.rejects(() => host.service.delete(SESSION), (error) => {
    assert.equal(error.code, 'session/locked')
    assert.match(error.message, /registration was removed/)
    return true
  })
  // The registration is already gone at this point, which is what the message says.
  assert.ok(host.calls.some((call) => call[0] === 'detachSession'))
  assert.ok(host.calls.some((call) => call[0] === 'cacheDelete'))
  assert.ok(!host.calls.some((call) => call[0] === 'replaceHeaderIndex'), 'the index rebuild is skipped')
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 7 - unremovable tree: session/locked, no false success')
}

/* 8. Subagent children are deleted with their parent; a fork is not. */
{
  const grandchild = 'session-grandchild-0004'
  const host = await makeHost({ children: ['session-child-0003'] })
  // Make the walk two levels deep by adding a grandchild header through the same
  // index the implementation reads.
  const baseHeaders = host.registry.listStoredHeaders
  host.registry.listStoredHeaders = async () => [
    ...(await baseHeaders()),
    { id: grandchild, cwd: 'D:\\x', origin: 'subagent', parentSession: 'session-child-0003' },
  ]
  await mkdir(join(host.root, 'sessions', '--proj--', grandchild), { recursive: true })
  await writeFile(join(host.root, 'sessions', '--proj--', grandchild, 'session.v4.jsonl.zstd'), 'x')
  host.persistence.stat = async (id) => (id === SESSION || id === 'session-child-0003' || id === grandchild
    ? { header: { id, cwd: 'D:\\x' } }
    : undefined)
  host.persistence.locate = (header) => ({ path: join(host.root, 'sessions', '--proj--', header.id, 'session.v4.jsonl.zstd') })

  const result = await host.service.delete(SESSION)
  assert.deepEqual(result.cascadedSessionIds, ['session-child-0003', grandchild], 'breadth-first, parent then child')
  assert.ok(!(await import('node:fs/promises').then((fs) => fs.stat(join(host.root, 'sessions', '--proj--', grandchild)).then(() => true, () => false))), 'the grandchild tree is gone')
  assert.ok(!(await import('node:fs/promises').then((fs) => fs.stat(join(host.root, 'sessions', '--proj--', 'session-child-0003')).then(() => true, () => false))), 'the child tree is gone')
  const index = host.calls.find((call) => call[0] === 'replaceHeaderIndex')
  assert.ok(index[1].includes('session-forked'), 'a fork of the deleted Session survives in the index')
  assert.ok(!index[1].includes(grandchild), 'every cascaded header leaves the index')
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 8 - cascade: subagent children go, forks stay')
}

/* 9. The tool refuses the caller's own Session. */
{
  const host = await makeHost()
  const tool = host.registered[0]
  await assert.rejects(
    () => tool.execute({ sessionId: SESSION }, { agent: { session: { id: SESSION } } }),
    /Refusing to delete the Session this call runs in/,
  )
  assert.deepEqual(host.calls.filter((call) => call[0] !== 'provide'), [], 'a refused call mutates nothing')
  await rm(host.root, { recursive: true, force: true })
  console.log('ok 9 - tool refuses the caller\'s own Session')
}

console.log('\nall harness checks passed')