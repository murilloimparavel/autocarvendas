/**
 * Admin create buttons follow the list's own create access.
 *
 * Many lists deny generic create by design (records come only from workflow
 * commands), and role-based lists deny it to people without the permission.
 * Without this, the dashboard still shows "Create X" and the form always fails
 * with "Access denied". For every list that does not set `ui.hideCreate`
 * itself, hideCreate evaluates the list's operation-level create rule for the
 * current session. Access rules are not changed; this only reads them.
 *
 * Plain module: no @/ imports.
 */
type ListConfig = { access?: any; ui?: { hideCreate?: unknown; itemView?: unknown; [key: string]: unknown }; [key: string]: unknown }

function createRule(access: any): ((args: any) => unknown) | undefined {
  if (typeof access === 'function') return access
  const operation = access?.operation
  if (typeof operation === 'function') return operation
  if (typeof operation?.create === 'function') return operation.create
  return undefined
}

export async function createAllowed(listKey: string, list: ListConfig, args: { session?: unknown; context: unknown }) {
  const rule = createRule(list.access)
  if (!rule) return true
  try {
    return Boolean(await rule({ session: args.session, context: args.context, listKey, operation: 'create' }))
  } catch {
    return false
  }
}

export function withCreateAwareUi<T extends Record<string, ListConfig>>(lists: T): T {
  const out: Record<string, ListConfig> = {}
  for (const [listKey, list] of Object.entries(lists)) {
    if (list.ui?.hideCreate !== undefined || !createRule(list.access)) {
      out[listKey] = list
      continue
    }
    out[listKey] = {
      ...list,
      ui: {
        ...list.ui,
        hideCreate: async (args: { session?: unknown; context: unknown }) => !(await createAllowed(listKey, list, args)),
      },
    }
  }
  return out as T
}

/**
 * Item pages follow the list's own update access (E-commerce-style: the UI mirrors the rule).
 *
 * Lists whose generic update is denied (workflow-owned records) or filtered to the caller's own
 * records otherwise render every field as editable with a Save that always fails with "Access
 * denied". For every list that does not set `ui.itemView.defaultFieldMode` itself, the default
 * item field mode is 'read' when the list's operation-level update rule refuses this session, or
 * when its update filter excludes this item; otherwise 'edit' (today's default). A field's own
 * `ui.itemView.fieldMode` still wins. Access rules are not changed; this only reads them, and an
 * error while reading a filter keeps today's 'edit' (the server still enforces the rule).
 */
type ItemModeArgs = { session?: unknown; context: any; item: { id?: unknown } & Record<string, unknown> }

function updateOperationRule(access: any): ((args: any) => unknown) | undefined {
  if (typeof access === 'function') return access
  const rules = access?.operation
  if (typeof rules === 'function') return rules
  if (typeof rules?.update === 'function') return rules.update
  return undefined
}

function updateFilterRule(access: any): ((args: any) => unknown) | undefined {
  const filter = access?.filter
  return typeof filter?.update === 'function' ? filter.update : undefined
}

const itemModeCache = new WeakMap<object, Map<string, Promise<'edit' | 'read'>>>()

export async function itemUpdateAllowed(listKey: string, list: ListConfig, args: ItemModeArgs): Promise<boolean> {
  const operation = updateOperationRule(list.access)
  if (operation) {
    try {
      if (!(await operation({ session: args.session, context: args.context, listKey, operation: 'update' }))) return false
    } catch {
      return false
    }
  }
  const filterRule = updateFilterRule(list.access)
  if (!filterRule || args.item?.id == null) return true
  try {
    const filter = await filterRule({ session: args.session, context: args.context, listKey, operation: 'update' })
    if (filter === true) return true
    if (filter === false) return false
    if (!filter || typeof filter !== 'object') return true
    const count = await args.context.sudo().db[listKey].count({ where: { AND: [{ id: { equals: String(args.item.id) } }, filter] } })
    return count > 0
  } catch {
    return true
  }
}

export function withItemViewAwareUi<T extends Record<string, ListConfig>>(lists: T): T {
  const out: Record<string, ListConfig> = {}
  for (const [listKey, list] of Object.entries(lists)) {
    const itemView = (list.ui?.itemView ?? {}) as Record<string, unknown>
    if (itemView.defaultFieldMode !== undefined || (!updateOperationRule(list.access) && !updateFilterRule(list.access))) {
      out[listKey] = list
      continue
    }
    out[listKey] = {
      ...list,
      ui: {
        ...list.ui,
        itemView: {
          ...itemView,
          // Called once per field; one decision per request and item.
          defaultFieldMode: (args: ItemModeArgs) => {
            const decide = () => itemUpdateAllowed(listKey, list, args).then(ok => (ok ? 'edit' : 'read') as 'edit' | 'read')
            if (!args.context || typeof args.context !== 'object') return decide()
            const key = JSON.stringify([listKey, String(args.item?.id), String((args.session as any)?.itemId ?? ''), String((args.session as any)?.listKey ?? '')])
            const scope = args.context as object
            let cache = itemModeCache.get(scope)
            if (!cache) itemModeCache.set(scope, (cache = new Map()))
            let decision = cache.get(key)
            if (!decision) cache.set(key, (decision = decide()))
            return decision
          },
        },
      },
    }
  }
  return out as T
}

/**
 * Delete buttons follow the list's own operation-level delete access (cannabis 2f96739 pattern).
 * Lists that set `ui.hideDelete` themselves keep it. hideDelete has no item argument, so a
 * per-item delete filter still decides on the server. Access rules are not changed.
 */
function deleteRule(access: any): ((args: any) => unknown) | undefined {
  if (typeof access === 'function') return access
  const operation = access?.operation
  if (typeof operation === 'function') return operation
  if (typeof operation?.delete === 'function') return operation.delete
  return undefined
}

export async function deleteAllowed(listKey: string, list: ListConfig, args: { session?: unknown; context: unknown }) {
  const rule = deleteRule(list.access)
  if (!rule) return true
  try {
    return Boolean(await rule({ session: args.session, context: args.context, listKey, operation: 'delete' }))
  } catch {
    return false
  }
}

export function withDeleteAwareUi<T extends Record<string, ListConfig>>(lists: T): T {
  const out: Record<string, ListConfig> = {}
  for (const [listKey, list] of Object.entries(lists)) {
    if ((list.ui as any)?.hideDelete !== undefined || !deleteRule(list.access)) {
      out[listKey] = list
      continue
    }
    out[listKey] = {
      ...list,
      ui: {
        ...list.ui,
        hideDelete: async (args: { session?: unknown; context: unknown }) => !(await deleteAllowed(listKey, list, args)),
      },
    }
  }
  return out as T
}
