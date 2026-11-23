import {
	BLANK_LABEL,
	buildHierarchyIndex,
	getAncestorKeys,
	getBranchIndexMap,
	getBranchKeys,
	getDescendantCounts,
	getExpandableKeys,
	getIdKey,
	getInitialExpandedKeys,
	getNormalizedTerm,
	getSearchKeys,
	getVisibleRows,
	isWithinBranch,
	pruneInactiveBranches
} from '../hierarchyTreeModel';

const HIERARCHY_NODES = require('./data/hierarchyNodes.json');

const ACCOUNT_ID_18 = '001000000000001AAA';
const ACCOUNT_ID_15 = '001000000000001';
const CHILD_ID_18 = '001000000000002AAA';

function node(recordId, parentId, label, extra = {}) {
	return { recordId, parentId, label, typeLabel: '', isActive: true, ...extra };
}

function labelsOf(index, keys) {
	return keys.map(key => index.nodeMap.get(key).label);
}

describe('hierarchyTreeModel', () => {
	describe('getIdKey', () => {
		it('reduces an 18-character Id to its 15-character form', () => {
			expect(getIdKey(ACCOUNT_ID_18)).toBe(ACCOUNT_ID_15);
			expect(getIdKey(ACCOUNT_ID_15)).toBe(ACCOUNT_ID_15);
		});

		it('keeps any other key as it is and turns a blank into an empty key', () => {
			expect(getIdKey('sample-001')).toBe('sample-001');
			expect(getIdKey(null)).toBe('');
			expect(getIdKey(undefined)).toBe('');
		});
	});

	describe('buildHierarchyIndex', () => {
		it('builds an empty index from no nodes', () => {
			const index = buildHierarchyIndex(null);
			expect(index.rootKeys).toEqual([]);
			expect(index.nodeMap.size).toBe(0);
		});

		it('sorts roots and children by label, ignoring case', () => {
			const index = buildHierarchyIndex(HIERARCHY_NODES);
			expect(labelsOf(index, index.rootKeys)).toEqual(['Global']);
			expect(labelsOf(index, index.childKeyMap.get('n01'))).toEqual(['Americas', 'APAC', 'EMEA']);
			expect(labelsOf(index, index.childKeyMap.get('n02'))).toEqual(['Canada', 'United States']);
		});

		it('breaks a tie between equal labels by key', () => {
			const index = buildHierarchyIndex([node('b', null, 'Same'), node('a', null, 'same')]);
			expect(index.rootKeys).toEqual(['a', 'b']);
		});

		it('gives a blank label the fallback and keeps the first of two nodes with one Id', () => {
			const index = buildHierarchyIndex([node('a', null, '  '), node('a', null, 'Second')]);
			expect(index.nodeMap.size).toBe(1);
			expect(index.nodeMap.get('a').label).toBe(BLANK_LABEL);
		});

		it('skips a node without an Id', () => {
			const index = buildHierarchyIndex([node('', null, 'No id'), null, node('a', null, 'Kept')]);
			expect(index.rootKeys).toEqual(['a']);
		});

		it('makes a root of a node whose parent is missing or is the node itself', () => {
			const index = buildHierarchyIndex([
				node('a', 'gone', 'Orphan'),
				node('b', 'b', 'Self'),
				node('c', null, 'Top')
			]);
			expect(labelsOf(index, index.rootKeys)).toEqual(['Orphan', 'Self', 'Top']);
		});

		it('matches a parent given as an 18-character Id to a node given as a 15-character one', () => {
			const index = buildHierarchyIndex([
				node(ACCOUNT_ID_15, null, 'Parent'),
				node(CHILD_ID_18, ACCOUNT_ID_18, 'Child')
			]);
			expect(index.rootKeys).toEqual([ACCOUNT_ID_15]);
			expect(labelsOf(index, index.childKeyMap.get(ACCOUNT_ID_15))).toEqual(['Child']);
		});

		it('promotes the lowest-sorting member of a two-node cycle to a root', () => {
			const index = buildHierarchyIndex([node('x', 'y', 'Zulu'), node('y', 'x', 'Alpha')]);
			expect(labelsOf(index, index.rootKeys)).toEqual(['Alpha']);
			expect(labelsOf(index, index.childKeyMap.get('y'))).toEqual(['Zulu']);
			expect(index.nodeMap.get('y').isCycleBreak).toBe(true);
		});

		it('keeps every node of a three-node cycle and the branch hanging from it', () => {
			const index = buildHierarchyIndex([
				node('a', 'c', 'Charlie'),
				node('b', 'a', 'Bravo'),
				node('c', 'b', 'Delta'),
				node('d', 'b', 'Alpha leaf')
			]);
			const allKeys = getBranchKeys(index, index.rootKeys);
			expect(labelsOf(index, index.rootKeys)).toEqual(['Bravo']);
			expect(allKeys.sort()).toEqual(['a', 'b', 'c', 'd']);
		});
	});

	describe('counts and pruning', () => {
		it('counts every node below each node', () => {
			const countMap = getDescendantCounts(buildHierarchyIndex(HIERARCHY_NODES));
			expect(countMap.get('n01')).toBe(9);
			expect(countMap.get('n02')).toBe(4);
			expect(countMap.get('n04')).toBe(2);
			expect(countMap.get('n10')).toBe(0);
		});

		it('removes an inactive node with everything below it', () => {
			const nodes = [...HIERARCHY_NODES, node('n11', 'n07', 'Austin Annex')];
			const index = pruneInactiveBranches(buildHierarchyIndex(nodes));
			expect(index.nodeMap.has('n07')).toBe(false);
			expect(index.nodeMap.has('n11')).toBe(false);
			expect(index.rootKeys).toEqual(['n01']);
			expect(getDescendantCounts(index).get('n04')).toBe(1);
		});
	});

	describe('paths', () => {
		const index = buildHierarchyIndex(HIERARCHY_NODES);

		it('lists the ancestors top first and stops below a given key', () => {
			expect(getAncestorKeys(index, 'n08', '')).toEqual(['n01', 'n02', 'n04']);
			expect(getAncestorKeys(index, 'n08', 'n02')).toEqual(['n04']);
			expect(getAncestorKeys(index, 'missing', '')).toEqual([]);
		});

		it('tells whether a node sits in a branch', () => {
			expect(isWithinBranch(index, 'n08', 'n02')).toBe(true);
			expect(isWithinBranch(index, 'n02', 'n02')).toBe(true);
			expect(isWithinBranch(index, 'n09', 'n02')).toBe(false);
			expect(isWithinBranch(index, 'n09', '')).toBe(true);
			expect(isWithinBranch(index, 'missing', '')).toBe(false);
		});
	});

	describe('expansion', () => {
		const index = buildHierarchyIndex(HIERARCHY_NODES);

		it('opens nothing at depth 0 and the view roots at depth 1', () => {
			expect(getInitialExpandedKeys(index, ['n01'], 0).size).toBe(0);
			expect([...getInitialExpandedKeys(index, ['n01'], 1)]).toEqual(['n01']);
		});

		it('opens only nodes with children, down to the depth asked for', () => {
			expect([...getInitialExpandedKeys(index, ['n01'], 2)].sort()).toEqual(['n01', 'n02', 'n03']);
			expect([...getInitialExpandedKeys(index, ['n01'], 99)].sort()).toEqual(['n01', 'n02', 'n03', 'n04', 'n06']);
		});

		it('counts depth from the view root and ignores an unknown root', () => {
			expect([...getInitialExpandedKeys(index, ['n02', 'missing'], 1)]).toEqual(['n02']);
		});

		it('lists the nodes that can open, within a filter when one is given', () => {
			expect(getExpandableKeys(index, ['n02'], null).sort()).toEqual(['n02', 'n04']);
			expect(getExpandableKeys(index, ['n01'], new Set(['n03', 'n06']))).toEqual(['n01', 'n03']);
		});
	});

	describe('search', () => {
		const index = buildHierarchyIndex(HIERARCHY_NODES);

		it('treats a blank or whitespace-only term as no search', () => {
			expect(getNormalizedTerm('   ')).toBe('');
			expect(getSearchKeys(index, ['n01'], '  ').matchKeySet.size).toBe(0);
		});

		it('matches case-insensitively and shows the path to each match and the branch below it', () => {
			const result = getSearchKeys(index, ['n01'], ' united ');
			expect([...result.matchKeySet]).toEqual(['n04']);
			expect([...result.expandedKeySet].sort()).toEqual(['n01', 'n02']);
			expect([...result.filterKeySet].sort()).toEqual(['n01', 'n02', 'n04', 'n07', 'n08']);
		});

		it('searches only within the current view', () => {
			const result = getSearchKeys(index, ['n03'], 'office');
			expect([...result.matchKeySet]).toEqual(['n09']);
			expect(result.filterKeySet.has('n01')).toBe(false);
		});

		it('takes regular-expression characters in the term literally', () => {
			const special = buildHierarchyIndex([node('a', null, 'R&D (East)'), node('b', null, 'RD East')]);
			expect([...getSearchKeys(special, special.rootKeys, '(east)').matchKeySet]).toEqual(['a']);
			expect(getSearchKeys(special, special.rootKeys, '.*').matchKeySet.size).toBe(0);
		});
	});

	describe('getVisibleRows', () => {
		const index = buildHierarchyIndex(HIERARCHY_NODES);
		const countMap = getDescendantCounts(index);

		it('shows only the view roots when nothing is open', () => {
			const { rows } = getVisibleRows(index, { viewRootKeys: ['n01'], expandedKeySet: new Set() });
			expect(rows.map(row => row.label)).toEqual(['Global']);
			expect(rows[0]).toMatchObject({ level: 1, posInSet: 1, setSize: 1, hasChildren: true, isExpanded: false });
		});

		it('walks open nodes depth first with levels and positions among shown siblings', () => {
			const { rows } = getVisibleRows(index, {
				viewRootKeys: ['n01'],
				expandedKeySet: new Set(['n01', 'n02']),
				countMap
			});
			expect(rows.map(row => row.label)).toEqual([
				'Global',
				'Americas',
				'Canada',
				'United States',
				'APAC',
				'EMEA'
			]);
			expect(rows[3]).toMatchObject({ level: 3, posInSet: 2, setSize: 2, descendantCount: 2, parentKey: 'n02' });
			expect(rows[4]).toMatchObject({ level: 2, posInSet: 2, setSize: 3, hasChildren: false });
		});

		it('gives a view root no parent key, even when it has a parent in the index', () => {
			const { rows } = getVisibleRows(index, { viewRootKeys: ['n04'], expandedKeySet: new Set() });
			expect(rows[0]).toMatchObject({ level: 1, parentKey: '' });
		});

		it('shows only filtered keys and counts sibling positions among them', () => {
			const { rows } = getVisibleRows(index, {
				viewRootKeys: ['n01'],
				expandedKeySet: new Set(['n01', 'n02']),
				filterKeySet: new Set(['n01', 'n02', 'n04']),
				matchKeySet: new Set(['n04'])
			});
			expect(rows.map(row => row.label)).toEqual(['Global', 'Americas', 'United States']);
			expect(rows[2]).toMatchObject({ posInSet: 1, setSize: 1, isMatch: true, hasChildren: false });
		});

		it('marks the current record', () => {
			const { rows } = getVisibleRows(index, {
				viewRootKeys: ['n02'],
				expandedKeySet: new Set(['n02']),
				currentRecordKey: 'n05'
			});
			expect(rows.filter(row => row.isCurrentRecord).map(row => row.label)).toEqual(['Canada']);
		});

		it('numbers the branches of a view in order, across every view root', () => {
			expect([...getBranchIndexMap(index, ['n01']).entries()]).toEqual([
				['n02', 0],
				['n10', 1],
				['n03', 2]
			]);
			expect([...getBranchIndexMap(index, ['n02', 'n03', 'unknown']).entries()]).toEqual([
				['n05', 0],
				['n04', 1],
				['n06', 2]
			]);
		});

		it('gives each row the branch index of the level-2 row above it, and the view root none', () => {
			const { rows } = getVisibleRows(index, {
				viewRootKeys: ['n01'],
				expandedKeySet: new Set(getExpandableKeys(index, ['n01'], null))
			});
			const branchByLabel = Object.fromEntries(rows.map(row => [row.label, row.branchIndex]));
			expect(branchByLabel).toMatchObject({ Global: -1, Americas: 0, 'Boston Office': 0, APAC: 1, EMEA: 2 });
			expect(branchByLabel['Berlin Office']).toBe(2);
		});

		it('keeps a branch index while a filter hides the branches before it', () => {
			const { rows } = getVisibleRows(index, {
				viewRootKeys: ['n01'],
				expandedKeySet: new Set(['n01', 'n03']),
				filterKeySet: new Set(['n01', 'n03', 'n06'])
			});
			expect(rows.map(row => row.branchIndex)).toEqual([-1, 2, 2]);
		});

		it('stops at the row cap and counts what it held back', () => {
			const { rows, hiddenRowCount } = getVisibleRows(index, {
				viewRootKeys: ['n01'],
				expandedKeySet: new Set(getExpandableKeys(index, ['n01'], null)),
				maxRows: 4
			});
			expect(rows).toHaveLength(4);
			expect(hiddenRowCount).toBe(6);
		});
	});
});
