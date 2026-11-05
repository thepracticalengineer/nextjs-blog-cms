import { describe, expect, it } from 'vitest'
import { descendantIds, orderTree, parentOptions, siblingsOf, type TreeNode } from '@/features/pages/hierarchy'

const node = (id: string, parent: string | null, position: number): TreeNode => ({ id, title: id.toUpperCase(), slug: id, parent_id: parent, position })
// a > (b > d, c), e
const nodes = [node('e', null, 1), node('a', null, 0), node('c', 'a', 1), node('b', 'a', 0), node('d', 'b', 0)]

describe('page hierarchy helpers', () => {
  it('orders depth-first by sibling position with depths', () => {
    expect(orderTree(nodes).map(row => `${row.id}${row.depth}`)).toEqual(['a1', 'b2', 'd3', 'c2', 'e1'])
  })
  it('treats rows whose parent is not listed as top level and never loops', () => {
    expect(orderTree([node('x', 'missing', 0), node('y', null, 1)]).map(row => row.id)).toEqual(['x', 'y'])
  })
  it('finds descendants', () => {
    expect([...descendantIds(nodes, 'a')].sort()).toEqual(['b', 'c', 'd'])
    expect(descendantIds(nodes, 'd').size).toBe(0)
  })
  it('offers only parents that avoid cycles and keep depth within three levels', () => {
    expect(parentOptions(nodes, 'a').map(row => row.id)).toEqual([])
    expect(parentOptions(nodes, 'b').map(row => row.id)).toEqual(['a', 'e'])
    expect(parentOptions(nodes, 'e').map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(parentOptions(nodes, 'd').map(row => row.id)).toEqual(['a', 'b', 'c', 'e'])
  })
  it('lists siblings excluding the page itself', () => {
    expect(siblingsOf(nodes, 'a', 'b').map(row => row.id)).toEqual(['c'])
    expect(siblingsOf(nodes, null, 'x').map(row => row.id)).toEqual(['a', 'e'])
  })
})
