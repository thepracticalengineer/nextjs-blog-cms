/** Client-side mirror of the database hierarchy rules, for building choices only.
 * The database remains authoritative for cycles, depth and ordering. */
export const maxPageDepth = 3

export type TreeNode = { id: string; title: string; slug: string; parent_id: string | null; position: number }
export type TreeRow = TreeNode & { depth: number }

function childrenByParent(nodes: TreeNode[]) {
  const map = new Map<string | null, TreeNode[]>()
  for (const node of nodes) {
    const key = node.parent_id && nodes.some(other => other.id === node.parent_id) ? node.parent_id : null
    map.set(key, [...(map.get(key) ?? []), node])
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  return map
}

/** Depth-first rows with depth starting at 1, siblings in position order. */
export function orderTree(nodes: TreeNode[]): TreeRow[] {
  const children = childrenByParent(nodes)
  const rows: TreeRow[] = []
  const seen = new Set<string>()
  const visit = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      rows.push({ ...node, depth })
      visit(node.id, depth + 1)
    }
  }
  visit(null, 1)
  return rows
}

export function descendantIds(nodes: TreeNode[], id: string): Set<string> {
  const children = childrenByParent(nodes)
  const result = new Set<string>()
  const stack = [id]
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (!result.has(child.id)) { result.add(child.id); stack.push(child.id) }
    }
  }
  return result
}

function subtreeHeight(nodes: TreeNode[], id: string): number {
  const children = childrenByParent(nodes)
  const height = (node: string, guard: number): number =>
    guard > maxPageDepth + 1 ? guard : 1 + Math.max(0, ...(children.get(node) ?? []).map(child => height(child.id, guard + 1)))
  return height(id, 1)
}

/** Pages that `pageId` may be moved under without a cycle or exceeding the depth bound. */
export function parentOptions(nodes: TreeNode[], pageId: string): TreeRow[] {
  const excluded = descendantIds(nodes, pageId).add(pageId)
  const height = subtreeHeight(nodes, pageId)
  return orderTree(nodes).filter(row => !excluded.has(row.id) && row.depth + height <= maxPageDepth)
}

/** Active siblings under `parentId`, excluding the page itself, in order. */
export function siblingsOf(nodes: TreeNode[], parentId: string | null, pageId: string): TreeNode[] {
  return nodes.filter(node => node.parent_id === parentId && node.id !== pageId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}
