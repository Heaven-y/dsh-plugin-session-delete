/**
 * Throwaway harness test for the Session Delete Client half. Loads the real
 * `pkg/client.js` through a stub `window.__ModuleLoader__` and a minimal React /
 * zod / carrier, then exercises the factory and `apply` without a browser.
 *
 * Run: node client-harness-test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/* ------------------------------------------------------------------ stubs */

/** Minimal chainable zod stand-in: every schema records nothing, parses loosely. */
const zodStub = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then') return undefined
    return (...args) => {
      const schema = { __call: prop, __args: args }
      schema.optional = () => schema
      schema.describe = () => schema
      schema.readonly = () => schema
      schema.parse = (value) => value
      return schema
    }
  },
})

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
  useCallback: (fn) => fn,
  Fragment: 'Fragment',
}

const styles = []
const documentStub = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild: (node) => styles.push(node) },
  activeElement: null,
}

let registered
globalThis.window = {
  __ModuleLoader__: {
    load: (record) => {
      registered = record
    },
  },
}
globalThis.document = documentStub

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
// The bundle is a plain script, not a module: evaluate it with the globals in place.
new Function('window', 'document', source)(globalThis.window, documentStub)

const PKG = '@coder02lq/dsh-plugin-session-delete'
assert.equal(registered.id, PKG, 'the factory registers under the package name')

const exportsObject = registered.factory((specifier) => {
  if (specifier === 'react') return reactStub
  if (specifier === 'react-dom') return { createPortal: (element) => element }
  if (specifier === 'zod') return zodStub
  throw new Error(`unexpected require: ${specifier}`)
})
assert.deepEqual(Object.keys(exportsObject).sort(), ['apply', 'inject'])
assert.deepEqual(exportsObject.inject, ['slots', 'locale', 'remote'])
console.log('ok 1 - factory materializes and exports apply + inject')

/* ---------------------------------------------------------------- apply */

const mounts = []
const registrations = []
const effects = []
const dictionaries = []
const calls = []
let deleteBehaviour = { ok: true, value: { sessionId: 's1', deleted: true } }

const namespace = {
  async delete(sessionId) {
    calls.push(sessionId)
    return deleteBehaviour
  },
}
const carrier = {
  async $mount(contribution) {
    mounts.push(contribution)
    return async () => {}
  },
  sessionDelete: namespace,
}

const ctx = {
  get: (name) => {
    if (name === 'remote') return carrier
    if (name === 'remote.sessionDelete') return namespace
    return undefined
  },
  effect: (callback, label) => {
    const dispose = callback()
    effects.push({ label, dispose })
    return () => {}
  },
  locale: {
    register: (ns, dicts) => {
      dictionaries.push({ ns, dicts })
      return () => {}
    },
  },
  slots: {
    inject: (key, callback) => {
      const produced = callback()
      if (produced !== undefined && typeof produced[Symbol.iterator] === 'function') {
        for (const item of produced) registrations.push(item)
      }
      return () => {}
    },
    register: (options, component) => ({ kind: 'registration', key: undefined, options, component }),
  },
}

await exportsObject.apply(ctx)

const contribution = mounts[0]
assert.equal(mounts.length, 1, 'one contribution is mounted')
assert.equal(contribution.package, PKG)
assert.equal(contribution.descriptors.length, 1)
const descriptor = contribution.descriptors[0]
assert.equal(descriptor.id, 'sessionDelete/delete')
assert.equal(descriptor.namespace, 'sessionDelete')
assert.equal(descriptor.method, 'delete')
assert.deepEqual(descriptor.invocation, { kind: 'direct' })
assert.deepEqual(descriptor.parameters.map((parameter) => [parameter.name, parameter.wire, parameter.source]),
  [['sessionId', 'sessionId', 'json']])
assert.equal(descriptor.parameters[0].codec.mode, 'strict')
assert.equal(descriptor.result.mode, 'strict')
assert.equal(descriptor.parameters[0].codec.create().__call, 'string')
assert.equal(descriptor.result.create().__call, 'object')
console.log('ok 2 - the mounted Remote contribution matches the Host SRC signature')

const menu = registrations.find((entry) => entry.options.name === 'sidebar.workspaces.session.menu.item')
assert.ok(menu, 'the sidebar menu row is registered')
assert.equal(menu.options.id, 'session-delete')
assert.equal(menu.options.order, 500)
assert.equal(menu.options.locale, 'session-delete')
assert.equal(typeof menu.component, 'function')
assert.equal(menu.component.length >= 1, true)

const overlay = registrations.find((entry) => entry.options.name === 'shell.overlay')
assert.ok(overlay, 'the confirmation dialog is registered in shell.overlay')
assert.equal(overlay.options.id, 'session-delete-confirm')

const injected = overlay.options.inject()
assert.equal(typeof injected.usePendingRequest, 'function')
assert.equal(typeof injected.useNoticeValue, 'function')
assert.equal(typeof injected.onConfirm, 'function')
console.log('ok 3 - menu row and overlay dialog are registered with their injected props')

assert.equal(dictionaries.length, 1)
assert.equal(dictionaries[0].ns, 'session-delete')
assert.deepEqual(Object.keys(dictionaries[0].dicts).sort(), ['en', 'zh'])
for (const locale of ['zh', 'en']) {
  for (const key of ['menu.delete', 'dialog.title', 'dialog.desc', 'dialog.warning', 'dialog.actions', 'cancel', 'close']) {
    const value = dictionaries[0].dicts[locale][key]
    if (key === 'dialog.actions') continue
    assert.equal(typeof value, 'string', `${locale}.${key} is present`)
    assert.ok(value.length > 0, `${locale}.${key} is non-empty`)
  }
}
assert.ok(dictionaries[0].dicts.zh['dialog.desc'].includes('{title}'))
assert.ok(dictionaries[0].dicts.en['dialog.desc'].includes('{title}'))
console.log('ok 4 - zh and en dictionaries are registered with a {title} placeholder')

assert.ok(effects.length >= 3, 'remote, stylesheet and dictionaries are owned effects')
assert.ok(styles.length === 1, 'one stylesheet is inserted')
const css = styles[0].textContent
assert.ok(css.includes('.sd-dialog'), 'the stylesheet carries the dialog rules')
assert.ok(!/#[0-9a-fA-F]{3,6}/.test(css), 'the stylesheet uses theme tokens, not literal colors')
assert.ok(css.includes('var(--dsw-alias-state-error-primary)'), 'danger color comes from a token')
console.log('ok 5 - stylesheet inserted once, token colors only')

/* ------------------------------------------------------- the call itself */

const t = (key, vars) => {
  const raw = dictionaries[0].dicts.en[key] ?? key
  return vars === undefined ? raw : raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
}

injected.onConfirm({ sessionId: 's1', displayTitle: 'Test row' }, t)
await new Promise((resolve) => setTimeout(resolve, 30))
assert.deepEqual(calls, ['s1'], 'the endpoint is called with the bare Session id')
assert.equal(mounts.length, 1, 'no extra mount on a call')
console.log('ok 6 - confirming forwards the bare id through the delete hop')

/* 7. A carrier without the namespace fails into the notice, not an unhandled rejection. */
{
  const bare = {
    ...ctx,
    get: (name) => (name === 'remote' ? { $mount: async () => async () => {} } : undefined),
  }
  await exportsObject.apply(bare)
  const bareOverlay = registrations.at(-1)
  assert.equal(bareOverlay.options.id, 'session-delete-confirm')

  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    // Must not throw: the dialog closes first, and the failure is reported later.
    bareOverlay.options.inject().onConfirm({ sessionId: 's3', displayTitle: 'x' }, t)
    await new Promise((resolve) => setTimeout(resolve, 60))
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
  assert.deepEqual(unhandled, [], 'the missing endpoint is handled, not left unhandled')
  console.log('ok 7 - a missing namespace is reported without an unhandled rejection')
}

console.log('\nall client harness checks passed')
