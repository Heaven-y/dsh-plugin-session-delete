/**
 * Session Delete bundle, Host half.
 *
 * The Harness ships no Session-delete seam on purpose — `dsh-session-persistence`
 * ("no delete or retention interface"), `dsh-session-persistence-jsonl` ("never
 * deletes Session files") and `dsh-workspace` ("Session deletion … not yet
 * provided") all say so — so this plugin performs the teardown itself, in the
 * order those packages require:
 *
 * 1. stop the Session's work and take it out of grouping (`archiveSession`);
 * 2. wait for a live Session's teardown, because it holds the write lease;
 * 3. forget the id in the three Workspace registry places;
 * 4. drop the projection-cache row, only after teardown rewrote it;
 * 5. remove the whole Session directory (every format generation and the lock);
 * 6. rebuild the in-memory header index so the registry forgets it immediately.
 *
 * This half deliberately imports nothing: a workspace-linked bundle resolves bare
 * specifiers from its own directory, which holds no Harness packages. The Remote
 * binding and the method marker are therefore assembled structurally, matching
 * what `@deepseek-ai/dsh-typert-protocol` produces.
 *
 * @module @coder02lq/dsh-plugin-session-delete
 */

import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Prototype key `remoteMethods()` reads for one Service's Remote markers. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
/** Cordis service key; also the wire namespace, like `workspaceController` → `workspace`. */
const SERVICE_KEY = 'sessionDelete'
/** Upper bound for a running turn to stop before the delete gives up. */
const STOP_TIMEOUT_MS = 8000
/** Poll interval while waiting for that teardown. */
const STOP_POLL_MS = 100
/** Attempts at removing a Session directory held open by another process. */
const REMOVE_ATTEMPTS = 4
/** Base backoff between those attempts; the nth wait is this times n. */
const REMOVE_RETRY_MS = 150
/** Errors a retry can plausibly clear: Windows sharing violations, POSIX EBUSY. */
const REMOVE_RETRYABLE = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'])

/**
 * Build a failure the Gateway forwards verbatim. The Gateway identifies Remote
 * failures structurally (`isDSHRemoteError` + `code`), never by class identity.
 * @param code - stable Remote failure code.
 * @param message - user-facing diagnostic.
 * @param details - structured payload.
 * @returns the marked error.
 */
function remoteFailure(code, message, details = {}) {
  return Object.assign(new Error(message), {
    name: 'SessionDeleteError',
    code,
    details,
    isDSHRemoteError: true,
  })
}

/**
 * Wait for one synchronous predicate to hold.
 * @param predicate - condition to poll.
 * @param timeoutMs - upper bound in milliseconds.
 * @returns whether the predicate held before the deadline.
 */
async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (predicate()) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS))
  }
}

/**
 * Whether the Session has a turn in flight.
 *
 * The Agent's own lifecycle state is the only honest signal: `sessions.get()`
 * returns any Session this Host has *attached*, which includes one that is merely
 * open in a browser and completely idle. Gating on that made every delete of a
 * loaded Session stall until the timeout.
 * @param ctx - Host context.
 * @param sessionId - Session to test.
 * @returns whether an Agent for it is running a turn.
 */
function isRunning(ctx, sessionId) {
  const agents = ctx.get('agents')
  const agent = agents === undefined ? undefined : agents.get(sessionId)
  return agent !== undefined && agent.status === 'running'
}

/**
 * Resolve the persisted projection cache's record table.
 *
 * The cache is derived state owned by `@deepseek-ai/dsh-session-projection-cache`,
 * and neither its domain name nor its table name is part of the persistence seam.
 * A Harness release that renames either, or a composition without the cache,
 * must degrade to "nothing cached" rather than break deletion.
 * @param ctx - Host context.
 * @returns the record table, or undefined when it cannot be resolved.
 */
function openProjectionCache(ctx) {
  try {
    const domain = ctx.get('storageDomain')
    const cache = domain === undefined ? undefined : domain.get('session_projcache')
    return cache === undefined ? undefined : cache.table('sessions')
  } catch {
    return undefined
  }
}

/**
 * Remove a Session directory, retrying the sharing violations Windows raises
 * while a handle drains.
 *
 * The platforms disagree about what deleting a file somebody still holds open
 * means: Windows fails the unlink (`EBUSY`/`EPERM`) and leaves the tree intact,
 * while POSIX unlinks it and lets the holder keep writing to an unnamed inode —
 * and, if it recreates its path, silently resurrects the Session. The live-Session
 * wait has already covered every writer this Host knows about, so a failure here
 * means another process (a second Harness on the same profile, a backup agent)
 * holds the tree, and deleting the registration while its files survive would be
 * the worst outcome: the caller must be told to retry instead.
 * @param directory - the Session directory.
 * @param sessionId - the Session, for the failure payload.
 * @throws a marked Remote failure when the tree cannot be removed.
 */
async function removeSessionDirectory(directory, sessionId) {
  let lastError
  for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      // Only sharing violations are worth retrying; a permission or path error
      // will not clear by waiting.
      if (!REMOVE_RETRYABLE.has(error?.code)) break
      await new Promise((resolve) => {
        setTimeout(resolve, REMOVE_RETRY_MS * (attempt + 1))
      })
    }
  }
  throw remoteFailure(
    'session/locked',
    `Session "${sessionId}" could not be removed from disk (${lastError?.code ?? 'unknown error'}); `
    + 'another process may still hold its files. Its registration was removed — close other Harness '
    + 'instances using this profile and delete the directory by hand.',
    { sessionId },
  )
}

/**
 * Subagent descendants of a Session, parents before their children.
 *
 * A subagent child is not a Session a person can open: the sidebar hides every
 * Session whose header says `origin: 'subagent'`, and the only address the Client
 * can build for one carries the parent's id (`subagentAddress()` answers
 * `{ parentSessionId, childSessionId }`). Deleting a parent therefore strands its
 * children as log files nothing can ever reach again, which is why they are
 * removed with it.
 *
 * A **fork** is deliberately not included: `forkSession` also records
 * `parentSession`, but a fork is a first-class Session with its own sidebar row
 * and its own life, so it outlives the Session it was seeded from.
 * @param registry - Workspace registry owning the header index.
 * @param sessionId - root Session.
 * @returns every subagent descendant, root excluded.
 */
async function subagentDescendants(registry, sessionId) {
  if (typeof registry.listStoredHeaders !== 'function') return []
  let headers
  try {
    headers = await registry.listStoredHeaders()
  } catch {
    return []
  }
  const childrenOf = new Map()
  for (const header of headers ?? []) {
    if (header?.origin !== 'subagent' || typeof header.parentSession !== 'string') continue
    if (typeof header.id !== 'string') continue
    const siblings = childrenOf.get(header.parentSession)
    if (siblings === undefined) childrenOf.set(header.parentSession, [header.id])
    else siblings.push(header.id)
  }
  const found = []
  const seen = new Set([sessionId])
  const queue = [sessionId]
  while (queue.length > 0) {
    const parent = queue.shift()
    for (const child of childrenOf.get(parent) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      found.push(child)
      queue.push(child)
    }
  }
  return found
}

/**
 * Remove one Session: stop it, unregister it, drop its cache row and its files.
 *
 * Steps 1–2 (archive, wait for teardown) run only for a Session that still has a
 * log; a registration whose log is already gone has nothing left to stop, and
 * exactly that state is what a previous out-of-band cleanup leaves behind.
 * @param ctx - Host context.
 * @param sessionId - Session to remove.
 * @param strict - whether an unknown id is a failure (`session/not-found`).
 * @returns whether anything was removed.
 * @throws a marked Remote failure on an unknown strict id, a Session that never
 *   quiesces, an unlocatable provider, or a tree that cannot be removed.
 */
async function removeOne(ctx, sessionId, strict) {
  const registry = ctx.workspaceRegistry
  const persistence = ctx.sessionPersistence
  const snapshot = await persistence.stat(sessionId)
  // The cache row is resolved up front: besides being deleted below, its presence
  // is itself evidence that this id is a real leftover worth purging. Both names
  // are plugin-owned private tables rather than part of the persistence seam, so a
  // Harness release may rename or drop them: resolve defensively and treat an
  // unavailable row as "nothing cached" instead of failing the delete.
  const cacheRows = openProjectionCache(ctx)
  const referenced = registry.list().some((workspace) => workspace.sessionIds.includes(sessionId))
    || registry.archivedSessionIds.includes(sessionId)
    || registry.pinnedSessionIds.includes(sessionId)
    || cacheRows?.get(sessionId) !== undefined
  if (snapshot === undefined && !referenced) {
    if (strict) {
      throw remoteFailure('session/not-found', `Session "${sessionId}" does not exist.`, { sessionId })
    }
    return false
  }

  // 1. Stop every provider's work for this Session and hide it from the lists.
  //    `archiveSession` writes the archive set before dispatching the stops, so
  //    wakes caused by the stops are already gated; an already-archived Session
  //    short-circuits, so dispatch the stops directly in that case.
  if (snapshot !== undefined) {
    const wasArchived = registry.archivedSessionIds.includes(sessionId)
    if (wasArchived) await registry.stopSessionActivity(sessionId)
    else await registry.archiveSession(sessionId, { stopActivity: true })

    // 2. A Session that is mid-turn holds the write lease and will append to the
    //    log, so its turn has to finish before the files go. Only `running` counts:
    //    an attached Session that is merely open in a UI is idle, writes nothing,
    //    and waiting on its presence — as this used to — blocked every delete of a
    //    Session the sidebar had loaded until the timeout expired.
    const stopped = await waitFor(() => !isRunning(ctx, sessionId), STOP_TIMEOUT_MS)
    if (!stopped) {
      if (!wasArchived) await registry.unarchiveSession(sessionId)
      throw remoteFailure(
        'session/busy',
        `Session "${sessionId}" is still working. Wait for its turn to finish, then delete it.`,
        { sessionId },
      )
    }
  }

  // 3. Forget the id everywhere the Workspace surfaces read from. Three
  //    independent calls: the Workspace row, the archive set, the pin set.
  for (const workspace of registry.list()) {
    if (!workspace.sessionIds.includes(sessionId)) continue
    await workspace.detachSession(sessionId)
  }
  await registry.unarchiveSession(sessionId)
  await registry.unpinSession(sessionId)

  // 4. Drop the derived projection-cache row (`session/disposed` would write it
  //    back, which step 2 has already ruled out).
  if (cacheRows !== undefined) await cacheRows.delete(sessionId)

  // 5. Remove the Session directory: the current log generation, any older
  //    generation, and the POSIX lease file all live beside each other.
  //    Attachments are content-addressed and shared, so they are never touched.
  if (snapshot !== undefined) {
    const locate = persistence.locate
    if (typeof locate !== 'function') {
      throw remoteFailure(
        'session/unlocatable',
        `The active persistence provider cannot locate Session "${sessionId}"; its registration was removed but its files remain.`,
        { sessionId },
      )
    }
    const located = locate.call(persistence, snapshot.header)
    await removeSessionDirectory(dirname(located.path), sessionId)
  }

  return true
}

/**
 * Permanently delete a Session together with the subagent Sessions it strands.
 *
 * The root goes first: archiving it is what stops the work of every child it owns,
 * so the children are already quiet by the time their own teardown is checked.
 * @param ctx - Host context carrying the Workspace registry and persistence seam.
 * @param rawId - Session id from the Remote call or the tool.
 * @returns the deleted identity plus every extra Session removed with it.
 * @throws a marked Remote failure when the Session is unknown or never quiesces.
 */
async function deleteSession(ctx, rawId) {
  const sessionId = typeof rawId === 'string' ? rawId.trim() : ''
  if (sessionId.length === 0) throw remoteFailure('gateway/bad-request', 'A Session id is required.')

  const registry = ctx.workspaceRegistry
  // Walk the lineage before removing anything: the walk reads the same headers
  // that removing the root deletes.
  const cascaded = await subagentDescendants(registry, sessionId)

  await removeOne(ctx, sessionId, true)
  const removed = []
  for (const child of cascaded) {
    // A child can vanish between the walk and its turn (a concurrent cleanup, a
    // second Harness on the same profile); reaching the desired end state twice
    // is not a failure.
    if (await removeOne(ctx, child, false)) removed.push(child)
  }

  // 6. Rebuild the header index from disk so `sessionKnown` and the Workspace
  //    candidate tables stop answering for the deleted ids without a restart.
  if (typeof registry.replaceHeaderIndex === 'function' && typeof registry.listStoredHeaders === 'function') {
    const gone = new Set([sessionId, ...removed])
    const headers = await registry.listStoredHeaders()
    await registry.replaceHeaderIndex(headers.filter((header) => !gone.has(header.id)))
    if (typeof registry.rebuildEntities === 'function') registry.rebuildEntities()
  }

  return { sessionId, deleted: true, cascadedSessionIds: removed }
}

/**
 * The Host Service behind `ctx.remote.sessionDelete`. Plain class on purpose: the
 * Gateway only needs a stable object identity, a visible `typertRemote` binding,
 * and a prototype method whose parameter list is plain identifiers.
 */
class SessionDeleteService {
  /**
   * @param ctx - Host context owning this Service.
   */
  constructor(ctx) {
    this.ctx = ctx
    /** Binding `readBinding()` validates: service identity, Cordis key, wire namespace. */
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: SERVICE_KEY,
      namespace: SERVICE_KEY,
    })
  }

  /**
   * Delete one stored Session.
   * @param sessionId - exact Session id.
   * @returns the deleted identity.
   */
  async delete(sessionId) {
    return await deleteSession(this.ctx, sessionId)
  }
}

Object.defineProperty(SessionDeleteService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'delete', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
})

/**
 * The agent-facing half of the same operation, so one implementation serves both
 * callers. Destructive, therefore it refuses the caller's own Session: an agent
 * deleting the log it is writing would destroy its own turn.
 * @param ctx - Host context.
 * @returns the tool definition.
 */
function sessionDeleteTool(ctx) {
  return {
    name: 'session_delete',
    description:
      'Permanently delete one stored Session: its log, its projection cache and its sidebar entry. '
      + 'Irreversible. Running work owned by that Session is stopped first, and its subagent child '
      + 'Sessions are deleted with it, because nothing can reopen those once their parent is gone. '
      + 'Call it only when the user explicitly asks to delete that specific Session, and never for the '
      + 'Session you are running in.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Exact Session id to delete, as shown in the sidebar "session-id" menu row.',
        },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          deleted: { type: 'boolean' },
          cascadedSessionIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['sessionId', 'deleted', 'cascadedSessionIds'],
        additionalProperties: false,
      },
      render(_args, value) {
        const count = value.cascadedSessionIds.length
        return [{
          type: 'text',
          text: count === 0
            ? `Deleted Session ${value.sessionId}.`
            : `Deleted Session ${value.sessionId} and ${count} subagent `
              + `${count === 1 ? 'Session' : 'Sessions'}.`,
        }]
      },
    },
    async execute(args, exec) {
      const sessionId = typeof args?.sessionId === 'string' ? args.sessionId.trim() : ''
      const own = exec.agent?.session.id
      if (own !== undefined && own === sessionId) {
        throw new Error('Refusing to delete the Session this call runs in.')
      }
      return await deleteSession(ctx, sessionId)
    },
  }
}

/** Required Host services: the registry, the persistence seam, and the tool registry. */
export const inject = ['workspaceRegistry', 'sessionPersistence', 'tools']

/**
 * Register the Remote Service and the matching agent tool.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const service = new SessionDeleteService(ctx)
  ctx.provide(SERVICE_KEY, service)
  ctx.tools.register(sessionDeleteTool(ctx))
}
