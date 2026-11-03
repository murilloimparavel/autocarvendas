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
type ListConfig = { access?: any; ui?: { hideCreate?: unknown; [key: string]: unknown }; [key: string]: unknown }

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
