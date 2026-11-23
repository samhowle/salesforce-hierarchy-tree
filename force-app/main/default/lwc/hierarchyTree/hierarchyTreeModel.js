/* hierarchyTreeModel.js  *********************************************************************************************
 * Pure functions behind c-hierarchy-tree: index a flat list of nodes into a tree, count what sits below each node,
 * and flatten the expanded part of the current view into the rows the template draws. No DOM, no platform imports.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * @test		__tests__/hierarchyTreeModel.test.js
 *********************************************************************************************************************/

export const BLANK_LABEL = '(no name)';

const SALESFORCE_ID_PATTERN = /^[a-zA-Z0-9]{18}$/;
const ID_KEY_LENGTH = 15;

// Index
// An 18-character Salesforce Id and its 15-character form name the same record; both reduce to the 15-character key.
// Anything else (the sample data's keys) is its own key.
export function getIdKey(recordId) {
	if (!recordId) {
		return '';
	}
	const text = String(recordId);
	return SALESFORCE_ID_PATTERN.test(text) ? text.substring(0, ID_KEY_LENGTH) : text;
}

function compareEntries(left, right) {
	const byLabel = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
	if (byLabel !== 0) {
		return byLabel;
	}
	if (left.key === right.key) {
		return 0;
	}
	return left.key < right.key ? -1 : 1;
}

function getSortedKeys(keys, nodeMap) {
	return keys
		.map(key => nodeMap.get(key))
		.sort(compareEntries)
		.map(entry => entry.key);
}

function buildChildKeyMap(nodeMap) {
	const childKeyMap = new Map();
	nodeMap.forEach(entry => {
		if (!entry.parentKey) {
			return;
		}
		if (!childKeyMap.has(entry.parentKey)) {
			childKeyMap.set(entry.parentKey, []);
		}
		childKeyMap.get(entry.parentKey).push(entry.key);
	});
	return childKeyMap;
}

function markReachable(startKey, childKeyMap, reachedKeySet) {
	const pendingKeys = [startKey];
	while (pendingKeys.length > 0) {
		const key = pendingKeys.pop();
		if (reachedKeySet.has(key)) {
			continue;
		}
		reachedKeySet.add(key);
		(childKeyMap.get(key) || []).forEach(childKey => pendingKeys.push(childKey));
	}
}

// A node no root reaches sits on a cycle or hangs from one; walking up from it repeats a key, and the walk from that
// first repeated key back to itself is the cycle.
function getCycleKeys(startKey, nodeMap) {
	const walkedKeys = [];
	const walkedKeySet = new Set();
	let currentKey = startKey;
	while (currentKey && !walkedKeySet.has(currentKey)) {
		walkedKeySet.add(currentKey);
		walkedKeys.push(currentKey);
		currentKey = nodeMap.get(currentKey).parentKey;
	}
	return walkedKeys.slice(walkedKeys.indexOf(currentKey));
}

// Every node must be drawn exactly once. A cycle has no root, so its lowest-sorting member is promoted to one and the
// rest of the cycle, and anything hanging from it, sits below that member.
function breakCycles(nodeMap) {
	const reachedKeySet = new Set();
	let childKeyMap = buildChildKeyMap(nodeMap);
	nodeMap.forEach(entry => {
		if (!entry.parentKey) {
			markReachable(entry.key, childKeyMap, reachedKeySet);
		}
	});
	const unreachedEntries = () => Array.from(nodeMap.values()).filter(entry => !reachedKeySet.has(entry.key));
	let orphans = unreachedEntries();
	while (orphans.length > 0) {
		const cycleKeys = getCycleKeys(orphans[0].key, nodeMap);
		const promotedKey = getSortedKeys(cycleKeys, nodeMap)[0];
		nodeMap.get(promotedKey).parentKey = '';
		nodeMap.get(promotedKey).isCycleBreak = true;
		childKeyMap = buildChildKeyMap(nodeMap);
		markReachable(promotedKey, childKeyMap, reachedKeySet);
		orphans = unreachedEntries();
	}
}

/**
 * @param {Array} nodes flat nodes from the controller: { recordId, parentId, label, typeLabel, isActive }
 * @return {Object} { nodeMap, childKeyMap, rootKeys }; children and roots sorted by label, then by key
 */
export function buildHierarchyIndex(nodes) {
	const nodeMap = new Map();
	(nodes || []).forEach(node => {
		const key = node ? getIdKey(node.recordId) : '';
		if (!key || nodeMap.has(key)) {
			return;
		}
		const label = node.label ? String(node.label).trim() : '';
		nodeMap.set(key, {
			key,
			recordId: String(node.recordId),
			parentKey: getIdKey(node.parentId),
			label: label || BLANK_LABEL,
			typeLabel: node.typeLabel ? String(node.typeLabel) : '',
			isActive: node.isActive !== false,
			isCycleBreak: false
		});
	});
	// A parent that is missing (deleted, filtered or not shared with the user) or is the node itself makes a root.
	nodeMap.forEach(entry => {
		if (entry.parentKey === entry.key || !nodeMap.has(entry.parentKey)) {
			entry.parentKey = '';
		}
	});
	breakCycles(nodeMap);
	const childKeyMap = buildChildKeyMap(nodeMap);
	childKeyMap.forEach((childKeys, parentKey) => childKeyMap.set(parentKey, getSortedKeys(childKeys, nodeMap)));
	const rootKeys = getSortedKeys(
		Array.from(nodeMap.values())
			.filter(entry => !entry.parentKey)
			.map(entry => entry.key),
		nodeMap
	);
	return { nodeMap, childKeyMap, rootKeys };
}

export function getChildKeys(index, key) {
	return index.childKeyMap.get(key) || [];
}

// Every key under the given keys, the given keys included, parents before children.
export function getBranchKeys(index, startKeys) {
	const branchKeys = [];
	const pendingKeys = [...startKeys].reverse();
	while (pendingKeys.length > 0) {
		const key = pendingKeys.pop();
		branchKeys.push(key);
		const childKeys = getChildKeys(index, key);
		for (let i = childKeys.length - 1; i >= 0; i--) {
			pendingKeys.push(childKeys[i]);
		}
	}
	return branchKeys;
}

/**
 * @return {Map} key to the number of nodes below it, at any depth
 */
export function getDescendantCounts(index) {
	const countMap = new Map();
	const topDownKeys = getBranchKeys(index, index.rootKeys);
	for (let i = topDownKeys.length - 1; i >= 0; i--) {
		const key = topDownKeys[i];
		const childTotal = getChildKeys(index, key).reduce((total, childKey) => total + countMap.get(childKey) + 1, 0);
		countMap.set(key, childTotal);
	}
	return countMap;
}

// Inactive nodes are removed with everything below them, so an active child never shows as a false root.
export function pruneInactiveBranches(index) {
	const inactiveKeys = Array.from(index.nodeMap.values())
		.filter(entry => !entry.isActive)
		.map(entry => entry.key);
	const droppedKeySet = new Set(getBranchKeys(index, inactiveKeys));
	const keptNodes = Array.from(index.nodeMap.values())
		.filter(entry => !droppedKeySet.has(entry.key))
		.map(entry => ({
			recordId: entry.recordId,
			parentId: entry.parentKey,
			label: entry.label,
			typeLabel: entry.typeLabel,
			isActive: entry.isActive
		}));
	return buildHierarchyIndex(keptNodes);
}

// Paths
/**
 * @return {Array} the keys above the node, top first; the walk stops below stopAtKey when it meets it
 */
export function getAncestorKeys(index, key, stopAtKey) {
	const ancestorKeys = [];
	const entry = index.nodeMap.get(key);
	let currentKey = entry ? entry.parentKey : '';
	while (currentKey && currentKey !== stopAtKey && ancestorKeys.length < index.nodeMap.size) {
		ancestorKeys.unshift(currentKey);
		currentKey = index.nodeMap.get(currentKey).parentKey;
	}
	return ancestorKeys;
}

export function isWithinBranch(index, key, branchKey) {
	if (!index.nodeMap.has(key)) {
		return false;
	}
	if (!branchKey || key === branchKey) {
		return true;
	}
	return getAncestorKeys(index, key, '').includes(branchKey);
}

// Expansion
/**
 * @param {Number} expandDepth levels open below each view root: 0 shows the roots closed, 1 opens the roots
 * @return {Set} keys of the nodes with children that start open
 */
export function getInitialExpandedKeys(index, viewRootKeys, expandDepth) {
	const expandedKeySet = new Set();
	let levelKeys = viewRootKeys.filter(key => index.nodeMap.has(key));
	for (let i = 0; i < expandDepth && levelKeys.length > 0; i++) {
		const nextLevelKeys = [];
		levelKeys.forEach(key => {
			const childKeys = getChildKeys(index, key);
			if (childKeys.length > 0) {
				expandedKeySet.add(key);
				nextLevelKeys.push(...childKeys);
			}
		});
		levelKeys = nextLevelKeys;
	}
	return expandedKeySet;
}

export function getExpandableKeys(index, viewRootKeys, filterKeySet) {
	return getBranchKeys(index, viewRootKeys).filter(key => {
		const childKeys = getChildKeys(index, key);
		return filterKeySet ? childKeys.some(childKey => filterKeySet.has(childKey)) : childKeys.length > 0;
	});
}

// Search
export function getNormalizedTerm(searchTerm) {
	return searchTerm ? String(searchTerm).trim().toLowerCase() : '';
}

/**
 * Matching is a case-insensitive substring test, so regular-expression characters in the term are literal.
 * @return {Object} { matchKeySet, filterKeySet, expandedKeySet }: the matches; what may show (the matches, the path
 *         down to each from the view root, and everything below a match); and what starts open (that path)
 */
export function getSearchKeys(index, viewRootKeys, searchTerm) {
	const term = getNormalizedTerm(searchTerm);
	const matchKeySet = new Set();
	const filterKeySet = new Set();
	const expandedKeySet = new Set();
	if (!term) {
		return { matchKeySet, filterKeySet, expandedKeySet };
	}
	const viewKeys = getBranchKeys(index, viewRootKeys);
	const viewKeySet = new Set(viewKeys);
	viewKeys.forEach(key => {
		if (index.nodeMap.get(key).label.toLowerCase().includes(term)) {
			matchKeySet.add(key);
		}
	});
	matchKeySet.forEach(key => {
		getAncestorKeys(index, key, '')
			.filter(ancestorKey => viewKeySet.has(ancestorKey))
			.forEach(ancestorKey => {
				filterKeySet.add(ancestorKey);
				expandedKeySet.add(ancestorKey);
			});
		getBranchKeys(index, [key]).forEach(branchKey => filterKeySet.add(branchKey));
	});
	return { matchKeySet, filterKeySet, expandedKeySet };
}

// Rows
/**
 * Numbers the branches of a view: each child of a view root, in order, across all the view roots. Every child is
 * numbered, shown or not, so a branch keeps its number while a search hides its neighbours.
 * @return {Map} child key → branch index from 0
 */
export function getBranchIndexMap(index, viewRootKeys) {
	const branchIndexMap = new Map();
	viewRootKeys
		.filter(key => index.nodeMap.has(key))
		.forEach(key => {
			getChildKeys(index, key).forEach(childKey => branchIndexMap.set(childKey, branchIndexMap.size));
		});
	return branchIndexMap;
}

/**
 * Depth-first walk of the open part of the view. Positions in a set count only the siblings that are shown.
 * Each row carries the branch index of the level-2 row it sits under; view roots have -1.
 * @param {Object} options { viewRootKeys, expandedKeySet, filterKeySet (null shows all), matchKeySet,
 *        currentRecordKey, countMap, maxRows }
 * @return {Object} { rows, hiddenRowCount }: rows past maxRows are counted, not returned
 */
export function getVisibleRows(index, options) {
	const filterKeySet = options.filterKeySet || null;
	const matchKeySet = options.matchKeySet || new Set();
	const countMap = options.countMap || new Map();
	const maxRows = options.maxRows > 0 ? options.maxRows : Number.MAX_SAFE_INTEGER;
	const isShown = key => index.nodeMap.has(key) && (!filterKeySet || filterKeySet.has(key));
	const branchIndexMap = getBranchIndexMap(index, options.viewRootKeys);
	const rows = [];
	let hiddenRowCount = 0;
	const pending = [];
	const pushLevel = (keys, level, parentBranchIndex) => {
		const shownKeys = keys.filter(isShown);
		for (let i = shownKeys.length - 1; i >= 0; i--) {
			const branchIndex = level === 2 ? branchIndexMap.get(shownKeys[i]) : parentBranchIndex;
			pending.push({ key: shownKeys[i], level, posInSet: i + 1, setSize: shownKeys.length, branchIndex });
		}
	};
	pushLevel(options.viewRootKeys, 1, -1);
	while (pending.length > 0) {
		const item = pending.pop();
		const entry = index.nodeMap.get(item.key);
		const childKeys = getChildKeys(index, item.key).filter(isShown);
		const hasChildren = childKeys.length > 0;
		const isExpanded = hasChildren && options.expandedKeySet.has(item.key);
		if (rows.length < maxRows) {
			rows.push({
				key: entry.key,
				recordId: entry.recordId,
				parentKey: item.level > 1 ? entry.parentKey : '',
				label: entry.label,
				typeLabel: entry.typeLabel,
				isActive: entry.isActive,
				level: item.level,
				branchIndex: item.branchIndex,
				posInSet: item.posInSet,
				setSize: item.setSize,
				hasChildren,
				isExpanded,
				descendantCount: countMap.get(entry.key) || 0,
				isCurrentRecord: Boolean(options.currentRecordKey) && entry.key === options.currentRecordKey,
				isMatch: matchKeySet.has(entry.key)
			});
		} else {
			hiddenRowCount++;
		}
		if (isExpanded) {
			pushLevel(childKeys, item.level + 1, item.branchIndex);
		}
	}
	return { rows, hiddenRowCount };
}
