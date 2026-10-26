window.__ModuleLoader__.load({
  id: '@coder02lq/dsh-plugin-session-delete',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const z = require('zod')
    const h = React.createElement

    const PKG = '@coder02lq/dsh-plugin-session-delete'
    const LOCALE_NS = 'session-delete'
    const ENDPOINT = 'sessionDelete/delete'

    /* ---------------------------------------------------------------- styles */

    const CSS = `
.sd-layer{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.sd-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
.sd-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(380px,100%);padding:0 0 24px;overflow:hidden;border:0;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.sd-dialog:focus{outline:none}
.sd-content{display:flex;flex-direction:column;width:100%}
.sd-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.sd-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.sd-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.sd-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sd-description{margin:0;padding:0 24px;font-size:14px;line-height:22px;font-weight:400;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.sd-body{display:flex;flex-direction:column;gap:8px;min-width:0;margin-top:20px;padding:0 24px}
.sd-warning{display:flex;align-items:flex-start;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}
.sd-warning-icon{flex:none;margin-top:1px}
.sd-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.sd-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.sd-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.sd-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px;height:36px}
.sd-button:disabled{cursor:not-allowed;opacity:.4}
.sd-outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}
.sd-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sd-danger:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.sd-item-wrap{position:relative}
.sd-separator{height:.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
.sd-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary);text-align:left}
.sd-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.sd-item:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);outline:none}
.sd-item:disabled{opacity:.4;cursor:not-allowed}
.sd-item-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center}
.sd-item-icon svg{width:14px;height:14px}
.sd-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

    /**
     * Insert this bundle's stylesheet once and hand back its removal.
     * @returns the cleanup callback.
     */
    function insertStyles() {
      if (typeof document === 'undefined') return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = PKG
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }

    /* ----------------------------------------------------------------- icons */

    /** Trash glyph drawn on the 16×16 grid the host's own icon set uses. */
    function TrashIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
        strokeWidth: 1, 'aria-hidden': true, focusable: 'false',
      },
      h('path', { d: 'M1.28149 3.88831H14.7187', stroke: 'currentColor' }),
      h('path', {
        d: 'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
        stroke: 'currentColor',
      }),
      h('path', {
        d: 'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
        stroke: 'currentColor',
      }),
      h('path', { d: 'M6.44946 6.98926V11.1238', stroke: 'currentColor' }),
      h('path', { d: 'M9.55054 6.98926V11.1238', stroke: 'currentColor' }))
    }

    /** Filled-circle warning glyph on the same grid. */
    function WarningIcon({ size = 16, className }) {
      return h('svg', {
        width: size, height: size, className, viewBox: '0 0 16 16', fill: 'none',
        strokeWidth: 1, 'aria-hidden': true, focusable: 'false',
      },
      h('path', {
        d: 'M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z',
        stroke: 'currentColor',
      }),
      h('path', { d: 'M8 4.29199V9.79199', stroke: 'currentColor' }),
      h('path', { d: 'M8 10.708V11.708', stroke: 'currentColor' }))
    }

    /** Close glyph for the dialog header, matching the host's modal control. */
    function CloseIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
        strokeWidth: 1, 'aria-hidden': true, focusable: 'false',
      },
      h('path', { d: 'M4 4L12 12', stroke: 'currentColor' }),
      h('path', { d: 'M12 4L4 12', stroke: 'currentColor' }))
    }

    /* ------------------------------------------------------------ menu + state */

    /**
     * One stored confirmation request, shared by the menu row that raises it and
     * the overlay dialog that services it. Both registrations live in this
     * bundle, so a module-local store is enough; nothing outside reads it.
     */
    const pending = { value: null, listeners: new Set() }

    /**
     * Replace the pending request and wake its readers.
     * @param next - request to confirm, or null to settle it.
     */
    function setPending(next) {
      pending.value = next
      for (const listener of pending.listeners) listener()
    }

    /**
     * Read the pending request, re-rendering on change.
     * @returns the current request, or null.
     */
    function usePending() {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        const listener = () => force((value) => value + 1)
        pending.listeners.add(listener)
        return () => {
          pending.listeners.delete(listener)
        }
      }, [])
      return pending.value
    }

    /**
     * One `...` menu row that opens the confirmation instead of deleting at once.
     * @param props - Session row identity, menu state, and the locale seat.
     * @returns the row.
     */
    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
      const [, setMenuOpen] = useMenuOpenState()
      return h('div', { className: 'sd-item-wrap' },
        h('div', { className: 'sd-separator', role: 'separator' }),
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'sd-item',
          onClick: () => {
            setMenuOpen(false)
            setPending({ sessionId, displayTitle })
          },
        },
        h('span', { className: 'sd-item-icon' }, h(TrashIcon)),
        h('span', { className: 'sd-item-label' }, t('menu.delete'))))
    }

    /* ---------------------------------------------------------------- dialog */

    /**
     * Keep focus inside the dialog, close on Escape, and restore the previous
     * focus on teardown.
     * @param dialogRef - ref to the dialog element.
     * @param onClose - called on Escape.
     */
    function useDialogKeys(dialogRef, onClose) {
      const closeRef = React.useRef(onClose)
      closeRef.current = onClose
      React.useEffect(() => {
        const node = dialogRef.current
        if (node === null) return undefined
        const previous = document.activeElement
        node.focus()
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closeRef.current()
            return
          }
          if (event.key !== 'Tab') return
          const focusable = [...node.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
            .filter((element) => element.offsetParent !== null)
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          const active = document.activeElement
          if (event.shiftKey && (active === first || !node.contains(active))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (active === last || !node.contains(active))) {
            event.preventDefault()
            first.focus()
          }
        }
        node.addEventListener('keydown', onKeyDown)
        return () => {
          node.removeEventListener('keydown', onKeyDown)
          if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
        }
      }, [dialogRef])
    }

    /**
     * One confirmation's dialog. In-flight and failure state belong to the
     * request, so they die with it.
     * @param props - the request, the delete hop, and the locale seat.
     * @returns the dialog element.
     */
    function DeleteConfirmForm({ request, deleteSession, onSettle, t }) {
      const dialogRef = React.useRef(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const close = React.useCallback(() => {
        if (busy) return
        onSettle()
      }, [busy, onSettle])
      useDialogKeys(dialogRef, close)
      const confirm = () => {
        setBusy(true)
        setError(null)
        deleteSession(request.sessionId).then(() => {
          setBusy(false)
          onSettle()
        }).catch((reason) => {
          setBusy(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }
      return createPortal(h('div', { className: 'sd-layer', role: 'presentation' },
        h('div', { className: 'sd-mask', 'aria-hidden': true, onClick: close }),
        h('div', {
          ref: dialogRef,
          tabIndex: -1,
          className: 'sd-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('dialog.title'),
        },
        h('div', { className: 'sd-content' },
          h('div', { className: 'sd-header' },
            h('h2', { className: 'sd-title' }, t('dialog.title')),
            h('button', {
              type: 'button',
              className: 'sd-close',
              'aria-label': t('close'),
              disabled: busy,
              onClick: close,
            }, h(CloseIcon))),
          h('p', { className: 'sd-description' },
            t('dialog.desc', { title: request.displayTitle || request.sessionId })),
          h('div', { className: 'sd-body' },
            h('div', { className: 'sd-warning' },
              h(WarningIcon, { size: 16, className: 'sd-warning-icon' }),
              h('span', null, t('dialog.warning'))),
            busy && h('div', { className: 'sd-status', role: 'status' }, t('dialog.pending')),
            error !== null && h('div', { className: 'sd-error', role: 'alert' }, error))),
          h('div', { className: 'sd-footer' },
            h('button', {
              type: 'button',
              className: 'sd-button sd-outline',
              disabled: busy,
              onClick: close,
            }, t('cancel')),
            h('button', {
              type: 'button',
              className: 'sd-button sd-outline sd-danger',
              disabled: busy,
              onClick: confirm,
            }, t('dialog.action'))))),
      document.body)
    }

    /**
     * The `shell.overlay` entry: nothing while no confirmation is pending.
     * @param props - the pending request hook, the delete hop, and the locale seat.
     * @returns the open dialog, or null.
     */
    function DeleteSessionConfirmDialog({ usePendingRequest, deleteSession, t }) {
      const request = usePendingRequest()
      const settle = React.useCallback(() => {
        setPending(null)
      }, [])
      if (request === null) return null
      return h(DeleteConfirmForm, {
        key: request.sessionId,
        request,
        deleteSession,
        onSettle: settle,
        t,
      })
    }

    /* ------------------------------------------------------------- dictionaries */

    /** Simplified Chinese UI copy; `{title}` is the Session row's display title. */
    const zh = {
      'menu.delete': '删除会话',
      'dialog.title': '删除会话',
      'dialog.desc': '“{title}”将被永久删除。',
      'dialog.warning': '会话记录、投影缓存和侧边栏条目都会删除，正在运行的工作会先停止。此操作无法撤销。',
      'dialog.pending': '正在删除…',
      'dialog.action': '永久删除',
      'cancel': '取消',
      'close': '关闭',
    }

    /** English UI copy. */
    const en = {
      'menu.delete': 'Delete session',
      'dialog.title': 'Delete session',
      'dialog.desc': '“{title}” will be permanently deleted.',
      'dialog.warning': 'The log, projection cache and sidebar entry are removed, and running work is stopped first. This cannot be undone.',
      'dialog.pending': 'Deleting…',
      'dialog.action': 'Delete permanently',
      'cancel': 'Cancel',
      'close': 'Close',
    }

    /* ---------------------------------------------------------------- plugin */

    /**
     * Call the Host delete endpoint, raising its failure message.
     *
     * The namespace Service is provided by the Remote carrier's own entry rather
     * than by an ancestor of this plugin, so it is read from the global service
     * table (`ctx.get`) instead of through the context proxy, which only exposes
     * services this plugin injects. The second path is insurance: it reaches the
     * same object through the carrier that mounted it.
     * @param ctx - Client plugin context.
     * @param sessionId - Session to delete.
     * @returns when the Host reported success.
     */
    async function callDelete(ctx, sessionId) {
      const carrier = ctx.get('remote')
      const namespace = ctx.get('remote.sessionDelete') ?? carrier?.sessionDelete
      if (namespace === undefined || namespace === null) {
        throw new Error('Session deletion is unavailable: its Host endpoint is not mounted.')
      }
      const result = await namespace.delete(sessionId)
      if (result.ok !== true) throw new Error(result.error?.message ?? 'Session deletion failed.')
    }

    /** Required Client services: slot registry, locale dictionaries, Remote carrier. */
    const inject = ['slots', 'locale', 'remote']

    /**
     * Mount the Remote namespace, then the menu row and the confirmation dialog.
     * @param ctx - Client plugin context.
     */
    async function apply(ctx) {
      const carrier = ctx.get('remote')
      if (carrier === undefined) throw new Error('session-delete: the Remote carrier service is unavailable')
      const unmountRemote = await carrier.$mount({
        package: PKG,
        descriptors: [{
          id: ENDPOINT,
          service: 'sessionDelete',
          namespace: 'sessionDelete',
          method: 'delete',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'sessionId',
            wire: 'sessionId',
            source: 'json',
            codec: {
              mode: 'strict',
              typeSymbol: `${PKG}#${ENDPOINT}:sessionId`,
              create: () => z.string(),
            },
          }],
          result: {
            mode: 'strict',
            typeSymbol: `${PKG}#${ENDPOINT}:result`,
            create: () => z.object({ sessionId: z.string(), deleted: z.literal(true) }),
          },
        }],
      })
      ctx.effect(() => () => {
        void unmountRemote()
      }, 'session-delete: remote namespace')
      ctx.effect(insertStyles, 'session-delete: stylesheet')
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'session-delete: dictionaries')

      ctx.slots.inject('sidebar.workspaces.session.menu.item', function* () {
        yield ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-delete',
          order: 500,
          locale: LOCALE_NS,
        }, DeleteSessionMenuItem)
      })
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-delete-confirm',
          locale: LOCALE_NS,
          inject: () => ({
            usePendingRequest: usePending,
            deleteSession: (sessionId) => callDelete(ctx, sessionId),
          }),
        }, DeleteSessionConfirmDialog)
      })
    }

    return { apply, inject }
  },
})
