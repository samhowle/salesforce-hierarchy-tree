/* hierarchyTree.js  ***************************************************************************************************
 * Draws any self-referencing hierarchy as a tree, a tree with columns, or an org chart of cards. Names link to their
 * records, any branch can be zoomed into with a breadcrumb back out, and a section banner says when the view is part
 * of the hierarchy rather than all of it. Columns and the chart fall back to narrow forms in a narrow space.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * @test		__tests__/hierarchyTree.test.js, __tests__/hierarchyTreeModel.test.js
 *********************************************************************************************************************/
import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import getHierarchy from '@salesforce/apex/HierarchyTreeController.getHierarchy';
import {
	buildHierarchyIndex,
	getAncestorKeys,
	getAvatarText,
	getChartTree,
	getDescendantCounts,
	getExpandableKeys,
	getIdKey,
	getInitialExpandedKeys,
	getNormalizedTerm,
	getSearchKeys,
	getVisibleRows,
	isWithinBranch,
	pruneInactiveBranches
} from './hierarchyTreeModel';

const DATA_SOURCE_SAMPLE = 'Sample';
const DATA_SOURCE_RECORDS = 'Records';
const DATA_SOURCES = [DATA_SOURCE_SAMPLE, DATA_SOURCE_RECORDS];
const DEFAULT_EXPAND_DEPTH = 2;
const MAX_EXPAND_DEPTH = 20;
const MAX_RENDERED_ROWS = 500;
const BRANCH_COLOR_COUNT = 6;
const DEEPEST_STYLED_LEVEL = 3;
const LAYOUT_TREE = 'Tree';
const LAYOUT_COLUMNS = 'Columns';
const LAYOUT_ORG_CHART = 'Org chart';
const LAYOUTS = [LAYOUT_TREE, LAYOUT_COLUMNS, LAYOUT_ORG_CHART];
// Below this width, in pixels of the component itself, columns give way to the plain tree and the chart stacks.
const NARROW_WIDTH = 640;
const NUMERIC_TYPES = new Set(['currency', 'double', 'integer', 'long', 'percent']);
const CARD_VARIANTS = ['root', 'branch', 'compact'];
const MAX_CARD_DETAILS = 2;
const MAX_COMPACT_CARD_DETAILS = 1;
const SUBTITLE_SEPARATOR = ' · ';
const RECORD_PAGE_TYPE = 'standard__recordPage';

// Every string the component shows, in one place, ready to move to Custom Labels. {0} and {1} are filled in order.
const LABELS = {
	allRecords: 'All {0}',
	backToBranch: 'Back to {0}',
	below: '{0} below',
	belowColumn: 'Below',
	breadcrumb: 'Hierarchy path',
	collapse: 'Collapse {0}',
	collapseAll: 'Collapse all',
	defaultPluralLabel: 'Records',
	defaultTitle: 'Hierarchy',
	empty: 'No records to show.',
	error: 'Error',
	expand: 'Expand {0}',
	expandAll: 'Expand all',
	hiddenRows: '{0} more rows are not shown. Search or zoom in to see them.',
	inactive: 'Inactive',
	loading: 'Loading',
	lockedRootMissing: 'The top record set for this component was not found, or is not shared with you.',
	matchCount: '{0} matches',
	matchOne: '1 match',
	nameColumn: 'Name',
	no: 'No',
	noMatches: 'No names match "{0}".',
	refresh: 'Refresh',
	sampleNotice: 'Showing sample data. Set Data source to Records to show real records.',
	search: 'Search',
	searchPlaceholder: 'Search {0}',
	sectionDetail: 'showing {0} and the {1} records below it.',
	sectionDetailLeaf: 'showing {0}.',
	sectionDetailOne: 'showing {0} and the 1 record below it.',
	sectionView: 'Section view',
	showFull: 'Show full hierarchy',
	truncated: 'Showing the first {0} records only. Set a top record to see a smaller part of the hierarchy.',
	unknownError: 'The hierarchy could not be loaded.',
	viewingFull: 'Showing the full hierarchy.',
	yes: 'Yes',
	zoomIn: 'Zoom in on {0}',
	zoomInSelected: 'Zoom in on the selected row'
};

function formatLabel(template, ...values) {
	return values.reduce((text, val, position) => text.replace('{' + position + '}', val), template);
}

function toBoolean(value) {
	return value === true || value === 'true';
}

// A checkbox column reads Yes or No; every other value arrives from Apex as display text.
function getCellText(column, value) {
	if (column && column.dataType === 'boolean') {
		if (value === 'true') {
			return LABELS.yes;
		}
		return value === 'false' ? LABELS.no : '';
	}
	return value || '';
}

function getCellClass(baseClass, column) {
	return NUMERIC_TYPES.has(column.dataType) ? baseClass + ' tree-cell_number' : baseClass;
}

function getErrorMessage(error) {
	const errors = Array.isArray(error) ? error : [error];
	const messages = errors
		.map(item => {
			if (item && item.body && Array.isArray(item.body)) {
				return item.body.map(entry => entry.message).join(', ');
			}
			if (item && item.body && typeof item.body.message === 'string') {
				return item.body.message;
			}
			return item && typeof item.message === 'string' ? item.message : '';
		})
		.filter(message => message);
	return messages.length > 0 ? messages.join(', ') : LABELS.unknownError;
}

export default class HierarchyTree extends NavigationMixin(LightningElement) {
	@api cardTitle = LABELS.defaultTitle;
	@api iconName = 'standard:hierarchy';
	/** Not objectApiName: a record page fills that one in with the page's own object. */
	@api hierarchyObjectApiName = 'Account';
	@api parentFieldApiName = 'ParentId';
	@api labelFieldApiName = 'Name';
	@api typeFieldApiName = 'Type';
	@api activeFieldApiName = '';
	@api hideSearch = false;
	@api hideBranchColors = false;
	/** Up to five comma-separated fields for the columns and the org-chart cards. */
	@api columnFieldApiNames = '';
	/** A short text field, such as a code, for the org-chart avatars. */
	@api avatarFieldApiName = '';

	/** 'Tree' (the default; any unknown value falls back to it), 'Columns' or 'Org chart'. */
	@api
	get layout() {
		return this._layout;
	}
	set layout(value) {
		this._layout = LAYOUTS.includes(value) ? value : LAYOUT_TREE;
		this.refreshRows();
	}

	/** 'Sample' (the default; any unknown value falls back to it) or 'Records'. */
	@api
	get hierarchySource() {
		return this._hierarchySource;
	}
	set hierarchySource(value) {
		this._hierarchySource = DATA_SOURCES.includes(value) ? value : DATA_SOURCE_SAMPLE;
	}

	/** Levels open below the view's top at start: 0 to 20. */
	@api
	get expandDepth() {
		return this._expandDepth;
	}
	set expandDepth(value) {
		const depth = parseInt(value, 10);
		this._expandDepth = Number.isNaN(depth) ? DEFAULT_EXPAND_DEPTH : Math.min(Math.max(depth, 0), MAX_EXPAND_DEPTH);
		this.resetView();
	}

	@api
	get hideInactive() {
		return this._hideInactive;
	}
	set hideInactive(value) {
		this._hideInactive = toBoolean(value);
		this.resetView();
	}

	/** The view starts zoomed in on this record; with isRootLocked, viewers cannot go above it. */
	@api
	get rootRecordId() {
		return this._rootRecordId;
	}
	set rootRecordId(value) {
		this._rootRecordId = value ? String(value).trim() : '';
		this.resetView();
	}

	@api
	get isRootLocked() {
		return this._isRootLocked;
	}
	set isRootLocked(value) {
		this._isRootLocked = toBoolean(value);
		this.resetView();
	}

	@api
	get shouldStartAtRecord() {
		return this._shouldStartAtRecord;
	}
	set shouldStartAtRecord(value) {
		this._shouldStartAtRecord = toBoolean(value);
		this.resetView();
	}

	/** Filled in by a record page, or by {!Route.recordId} on a site: that record is highlighted and revealed. */
	@api
	get recordId() {
		return this._recordId;
	}
	set recordId(value) {
		this._recordId = value ? String(value) : '';
		if (this._index && this._isViewReady) {
			this.revealCurrentRecord();
			this.refreshRows();
		}
	}

	_hierarchySource = DATA_SOURCE_SAMPLE;
	_layout = LAYOUT_TREE;
	_expandDepth = DEFAULT_EXPAND_DEPTH;
	_hideInactive = false;
	_rootRecordId = '';
	_isRootLocked = false;
	_shouldStartAtRecord = false;
	_recordId = '';

	_wiredResult;
	_sourceIndex;
	_index;
	_countMap = new Map();
	_objectPluralLabel = LABELS.defaultPluralLabel;
	_loadedNodeCount = 0;
	_isTruncated = false;
	_isLoading = true;
	_isRefreshing = false;
	_errorMessage = '';
	_isViewReady = false;
	_viewRootKey = '';
	_expandedKeySet = new Set();
	_searchTerm = '';
	_search = null;
	_activeKey = '';
	_rows = [];
	_chartRoots = [];
	_hiddenRowCount = 0;
	_labelFieldLabel = '';
	_typeFieldLabel = '';
	_columns = [];
	_isNarrow = false;
	_resizeObserver = null;
	_urlMap = new Map();
	_pendingUrlKeySet = new Set();
	_statusMessage = '';
	_focusKeyAfterRender = '';
	_shouldScrollToRecord = false;

	@wire(getHierarchy, {
		dataSource: '$hierarchySource',
		objectApiName: '$hierarchyObjectApiName',
		parentFieldApiName: '$parentFieldApiName',
		labelFieldApiName: '$labelFieldApiName',
		typeFieldApiName: '$typeFieldApiName',
		activeFieldApiName: '$activeFieldApiName',
		columnFieldApiNames: '$columnFieldApiNames',
		avatarFieldApiName: '$avatarFieldApiName'
	})
	wiredHierarchy(result) {
		this._wiredResult = result;
		if (result.data) {
			this.loadData(result.data);
		} else if (result.error) {
			this._errorMessage = getErrorMessage(result.error);
			this._isLoading = false;
		}
	}

	renderedCallback() {
		this.observeWidth();
		if (this._focusKeyAfterRender) {
			const selector = this.isOrgChart ? 'c-hierarchy-tree-card' : '.tree-row';
			const item = this.template.querySelector(selector + '[data-key="' + this._focusKeyAfterRender + '"]');
			this._focusKeyAfterRender = '';
			if (item) {
				item.focus();
			}
		}
		if (this._shouldScrollToRecord) {
			const currentItem = this.template.querySelector('.tree-row_current, .chart-card_current');
			if (currentItem) {
				this._shouldScrollToRecord = false;
				if (typeof currentItem.scrollIntoView === 'function') {
					currentItem.scrollIntoView({ block: 'nearest' });
				}
			}
		}
	}

	disconnectedCallback() {
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}
	}

	// The width that matters is the component's own, not the window's: a narrow sidebar on a wide screen is narrow.
	observeWidth() {
		if (this._resizeObserver || typeof ResizeObserver !== 'function' || !this.refs.body) {
			return;
		}
		this._resizeObserver = new ResizeObserver(entries => {
			const width = entries.length > 0 ? entries[0].contentRect.width : 0;
			const isNarrow = width > 0 && width < NARROW_WIDTH;
			if (isNarrow !== this._isNarrow) {
				this._isNarrow = isNarrow;
				this.refreshRows();
			}
		});
		this._resizeObserver.observe(this.refs.body);
	}

	// Template state
	get labels() {
		return LABELS;
	}

	get isLoading() {
		return this._isLoading;
	}

	get isLockedRootMissing() {
		return Boolean(this._index && this.lockedRootKey && !this._index.nodeMap.has(this.lockedRootKey));
	}

	get hasError() {
		return Boolean(this._errorMessage) || this.isLockedRootMissing;
	}

	get errorText() {
		return this._errorMessage || LABELS.lockedRootMissing;
	}

	get isSample() {
		return this._hierarchySource === DATA_SOURCE_SAMPLE;
	}

	get showSearch() {
		return !toBoolean(this.hideSearch);
	}

	get searchTerm() {
		return this._searchTerm;
	}

	get searchPlaceholder() {
		return formatLabel(LABELS.searchPlaceholder, this._objectPluralLabel);
	}

	get isOrgChart() {
		return this._layout === LAYOUT_ORG_CHART;
	}

	get isColumns() {
		return this._layout === LAYOUT_COLUMNS && !this._isNarrow;
	}

	get showToolbar() {
		return !this.isOrgChart;
	}

	get isPlain() {
		return toBoolean(this.hideBranchColors);
	}

	get treeClass() {
		const classNames = ['tree'];
		if (this.isColumns) {
			classNames.push('tree_columns');
		}
		if (this.isPlain) {
			classNames.push('tree_plain');
		}
		return classNames.join(' ');
	}

	get treeRole() {
		return this.isColumns ? 'treegrid' : 'tree';
	}

	// Name column, one column per value (type first, when set), then the count.
	get treeStyle() {
		if (!this.isColumns) {
			return null;
		}
		const valueCount = this.columnHeaders.length - 1;
		const valueTracks = valueCount > 0 ? 'repeat(' + valueCount + ', minmax(6rem, 1fr)) ' : '';
		return '--hierarchy-tree-columns: minmax(14rem, 2.5fr) ' + valueTracks + 'minmax(4.5rem, 0.6fr)';
	}

	get nameColumnLabel() {
		return this._labelFieldLabel || LABELS.nameColumn;
	}

	get columnHeaders() {
		const headers = [];
		if (this._typeFieldLabel) {
			headers.push({ key: 'type', label: this._typeFieldLabel, cellClass: 'tree-head__cell' });
		}
		this._columns.forEach((column, position) => {
			headers.push({
				key: 'column-' + position,
				label: column.label,
				cellClass: getCellClass('tree-head__cell', column)
			});
		});
		headers.push({ key: 'below', label: LABELS.belowColumn, cellClass: 'tree-head__cell tree-cell_number' });
		return headers;
	}

	get chartClass() {
		const classNames = ['chart'];
		if (this._isNarrow) {
			classNames.push('chart_narrow');
		}
		if (this.isPlain) {
			classNames.push('chart_plain');
		}
		return classNames.join(' ');
	}

	get chartRoots() {
		return this._chartRoots;
	}

	get rows() {
		return this._rows;
	}

	get hasRows() {
		return this._rows.length > 0;
	}

	get hasContent() {
		return this.isOrgChart ? this._chartRoots.length > 0 : this.hasRows;
	}

	get isTreeEmpty() {
		return !this.hasRows;
	}

	get emptyText() {
		return this._search ? formatLabel(LABELS.noMatches, this._searchTerm.trim()) : LABELS.empty;
	}

	get hiddenRowsText() {
		return this._hiddenRowCount > 0 ? formatLabel(LABELS.hiddenRows, this._hiddenRowCount) : '';
	}

	get truncatedText() {
		return this._isTruncated ? formatLabel(LABELS.truncated, this._loadedNodeCount) : '';
	}

	get treeLabel() {
		return this.cardTitle || LABELS.defaultTitle;
	}

	get statusMessage() {
		return this._statusMessage;
	}

	get isZoomed() {
		return Boolean(this._viewRootKey && this._index && this._index.nodeMap.has(this._viewRootKey));
	}

	get breadcrumbs() {
		if (!this.isZoomed) {
			return [];
		}
		const index = this._index;
		const firstLabel = this.lockedRootKey
			? index.nodeMap.get(this.lockedRootKey).label
			: formatLabel(LABELS.allRecords, this._objectPluralLabel);
		const crumbs = [{ key: '', label: firstLabel, isCurrent: false }];
		getAncestorKeys(index, this._viewRootKey, this.lockedRootKey).forEach(key => {
			crumbs.push({ key, label: index.nodeMap.get(key).label, isCurrent: false });
		});
		crumbs.push({ key: this._viewRootKey, label: index.nodeMap.get(this._viewRootKey).label, isCurrent: true });
		return crumbs.map(crumb => ({ ...crumb, itemKey: 'crumb-' + (crumb.key || 'top') }));
	}

	get sectionDetail() {
		if (!this.isZoomed) {
			return '';
		}
		const label = this._index.nodeMap.get(this._viewRootKey).label;
		const count = this._countMap.get(this._viewRootKey) || 0;
		if (count === 0) {
			return formatLabel(LABELS.sectionDetailLeaf, label);
		}
		return count === 1
			? formatLabel(LABELS.sectionDetailOne, label)
			: formatLabel(LABELS.sectionDetail, label, count);
	}

	get showFullLabel() {
		return this.lockedRootKey
			? formatLabel(LABELS.backToBranch, this._index.nodeMap.get(this.lockedRootKey).label)
			: LABELS.showFull;
	}

	get activeRow() {
		return this._rows.find(row => row.key === this._activeKey);
	}

	get toolbarZoomLabel() {
		const row = this.activeRow;
		return row && row.canZoom ? formatLabel(LABELS.zoomIn, row.label) : LABELS.zoomInSelected;
	}

	get isToolbarZoomDisabled() {
		const row = this.activeRow;
		return !row || !row.canZoom;
	}

	// Derived keys
	get isRecordsSource() {
		return this._hierarchySource === DATA_SOURCE_RECORDS;
	}

	get lockedRootKey() {
		return this._isRootLocked ? getIdKey(this._rootRecordId) : '';
	}

	get currentRecordKey() {
		return getIdKey(this._recordId);
	}

	get topKeys() {
		if (!this._index) {
			return [];
		}
		return this.lockedRootKey ? [this.lockedRootKey] : this._index.rootKeys;
	}

	get viewRootKeys() {
		return this._viewRootKey ? [this._viewRootKey] : this.topKeys;
	}

	// Handlers
	onRefreshClick() {
		this._isRefreshing = true;
		return refreshApex(this._wiredResult).finally(() => {
			this._isRefreshing = false;
		});
	}

	onSearchChange(event) {
		this._searchTerm = event.detail && event.detail.value ? event.detail.value : '';
		this.refreshSearch();
		this.refreshRows();
		if (!this._search) {
			this._statusMessage = '';
			return;
		}
		const matchCount = this._search.matchKeySet.size;
		this._statusMessage = matchCount === 1 ? LABELS.matchOne : formatLabel(LABELS.matchCount, matchCount);
	}

	onExpandAllClick() {
		const filterKeySet = this._search ? this._search.filterKeySet : null;
		const expandableKeys = getExpandableKeys(this._index, this.viewRootKeys, filterKeySet);
		if (this._search) {
			this._search.expandedKeySet = new Set(expandableKeys);
		} else {
			expandableKeys.forEach(key => this._expandedKeySet.add(key));
		}
		this.refreshRows();
	}

	onCollapseAllClick() {
		const openKeys = this.viewRootKeys.length === 1 ? this.viewRootKeys : [];
		if (this._search) {
			this._search.expandedKeySet = new Set(openKeys);
		} else {
			this._expandedKeySet = new Set(openKeys);
		}
		this.refreshRows();
	}

	onRowClick(event) {
		const key = event.currentTarget.dataset.key;
		if (key !== this._activeKey) {
			this._activeKey = key;
			this.refreshRows();
		}
	}

	onToggleClick(event) {
		event.stopPropagation();
		const row = this.getRow(event.currentTarget.dataset.key);
		if (row) {
			this.setExpanded(row.key, !row.isExpanded);
		}
	}

	onNameClick(event) {
		const isPlainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		if (!isPlainClick) {
			return;
		}
		event.preventDefault();
		const row = this.getRow(event.currentTarget.dataset.key);
		if (row) {
			this.navigateToRecord(row.recordId);
		}
	}

	onZoomClick(event) {
		event.stopPropagation();
		this.zoomTo(event.currentTarget.dataset.key);
	}

	onToolbarZoomClick() {
		if (!this.isToolbarZoomDisabled) {
			this.zoomTo(this._activeKey);
		}
	}

	onCrumbClick(event) {
		this.zoomTo(event.currentTarget.dataset.key);
	}

	onShowFullClick() {
		this.zoomTo('');
	}

	onCardZoom(event) {
		this.zoomTo(event.detail.key);
	}

	onCardNavigate(event) {
		this.navigateToRecord(event.detail.recordId);
	}

	onTreeKeyDown(event) {
		const rowIndex = this._rows.findIndex(row => row.key === this._activeKey);
		if (rowIndex < 0) {
			return;
		}
		const row = this._rows[rowIndex];
		switch (event.key) {
			case 'ArrowDown':
				this.moveActive(rowIndex + 1);
				break;
			case 'ArrowUp':
				this.moveActive(rowIndex - 1);
				break;
			case 'Home':
				this.moveActive(0);
				break;
			case 'End':
				this.moveActive(this._rows.length - 1);
				break;
			case 'ArrowRight':
				this.onArrowRight(row, rowIndex);
				break;
			case 'ArrowLeft':
				this.onArrowLeft(row);
				break;
			case 'Enter':
				// Enter on a focused link inside the row is the link's own click; only the row itself is handled here.
				if (!event.target.classList.contains('tree-row') || !row.hasLink) {
					return;
				}
				this.navigateToRecord(row.recordId);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	onArrowRight(row, rowIndex) {
		if (row.hasChildren && !row.isExpanded) {
			this.setExpanded(row.key, true);
			this._focusKeyAfterRender = row.key;
			return;
		}
		if (row.isExpanded) {
			this.moveActive(rowIndex + 1);
		}
	}

	onArrowLeft(row) {
		if (row.isExpanded) {
			this.setExpanded(row.key, false);
			this._focusKeyAfterRender = row.key;
			return;
		}
		if (row.parentKey) {
			this.moveActive(this._rows.findIndex(item => item.key === row.parentKey));
		}
	}

	// View
	loadData(data) {
		this._errorMessage = '';
		this._isLoading = false;
		this._isTruncated = data.isTruncated === true;
		this._objectPluralLabel = data.objectPluralLabel || LABELS.defaultPluralLabel;
		this._loadedNodeCount = (data.nodes || []).length;
		this._labelFieldLabel = data.labelFieldLabel || '';
		this._typeFieldLabel = data.typeFieldLabel || '';
		this._columns = Array.isArray(data.columns) ? data.columns : [];
		this._sourceIndex = buildHierarchyIndex(data.nodes);
		if (!this._isRefreshing) {
			this._isViewReady = false;
			this._urlMap = new Map();
		}
		this.applyIndex();
	}

	resetView() {
		this._isViewReady = false;
		this.applyIndex();
	}

	applyIndex() {
		if (!this._sourceIndex) {
			return;
		}
		this._index = this._hideInactive ? pruneInactiveBranches(this._sourceIndex) : this._sourceIndex;
		this._countMap = getDescendantCounts(this._index);
		if (this._isViewReady) {
			this.keepViewValid();
		} else {
			this.initializeView();
		}
		this.refreshSearch();
		this.refreshRows();
	}

	initializeView() {
		const index = this._index;
		const recordKey = this.currentRecordKey;
		const rootKey = getIdKey(this._rootRecordId);
		let startKey = '';
		if (this._shouldStartAtRecord && index.nodeMap.has(recordKey) && this.isKeyUnderLock(recordKey)) {
			startKey = recordKey;
		} else if (!this._isRootLocked && index.nodeMap.has(rootKey)) {
			startKey = rootKey;
		}
		this._viewRootKey = startKey === this.lockedRootKey ? '' : startKey;
		this._expandedKeySet = getInitialExpandedKeys(index, this.viewRootKeys, this._expandDepth);
		this._activeKey = '';
		this._isViewReady = true;
		this.revealCurrentRecord();
	}

	keepViewValid() {
		const nodeMap = this._index.nodeMap;
		if (this._viewRootKey && !nodeMap.has(this._viewRootKey)) {
			this._viewRootKey = '';
		}
		this._expandedKeySet = new Set([...this._expandedKeySet].filter(key => nodeMap.has(key)));
	}

	isKeyUnderLock(key) {
		return isWithinBranch(this._index, key, this.lockedRootKey);
	}

	isKeyInView(key) {
		return isWithinBranch(this._index, key, this._viewRootKey || this.lockedRootKey);
	}

	revealCurrentRecord() {
		const recordKey = this.currentRecordKey;
		if (!recordKey || !this.isKeyInView(recordKey)) {
			return;
		}
		getAncestorKeys(this._index, recordKey, '')
			.filter(key => this.isKeyInView(key))
			.forEach(key => this._expandedKeySet.add(key));
		this._activeKey = recordKey;
		this._shouldScrollToRecord = true;
	}

	refreshSearch() {
		const term = getNormalizedTerm(this._searchTerm);
		this._search = term && this._index ? getSearchKeys(this._index, this.viewRootKeys, term) : null;
	}

	zoomTo(key) {
		const targetKey = key && key !== this.lockedRootKey ? key : '';
		this._viewRootKey = targetKey;
		this.viewRootKeys.forEach(rootKey => this._expandedKeySet.add(rootKey));
		this.refreshSearch();
		this._activeKey = this.viewRootKeys.length > 0 ? this.viewRootKeys[0] : '';
		this.refreshRows();
		this._focusKeyAfterRender = this._activeKey;
		this._statusMessage = this.isZoomed ? LABELS.sectionView + ': ' + this.sectionDetail : LABELS.viewingFull;
	}

	setExpanded(key, isExpanded) {
		const expandedKeySet = this._search ? this._search.expandedKeySet : this._expandedKeySet;
		if (isExpanded) {
			expandedKeySet.add(key);
		} else {
			expandedKeySet.delete(key);
		}
		this._activeKey = key;
		this.refreshRows();
	}

	moveActive(rowIndex) {
		if (rowIndex < 0 || rowIndex >= this._rows.length) {
			return;
		}
		this._activeKey = this._rows[rowIndex].key;
		this._focusKeyAfterRender = this._activeKey;
		this.refreshRows();
	}

	getRow(key) {
		return this._rows.find(row => row.key === key);
	}

	refreshRows() {
		if (!this._index) {
			this._rows = [];
			return;
		}
		const search = this._search;
		const { rows, hiddenRowCount } = getVisibleRows(this._index, {
			viewRootKeys: this.viewRootKeys,
			expandedKeySet: search ? search.expandedKeySet : this._expandedKeySet,
			filterKeySet: search ? search.filterKeySet : null,
			matchKeySet: search ? search.matchKeySet : null,
			currentRecordKey: this.currentRecordKey,
			countMap: this._countMap,
			maxRows: MAX_RENDERED_ROWS
		});
		if (!rows.some(row => row.key === this._activeKey)) {
			this._activeKey = rows.length > 0 ? rows[0].key : '';
		}
		this._hiddenRowCount = hiddenRowCount;
		this._rows = rows.map(row => this.getDecoratedRow(row));
		this._chartRoots = this.isOrgChart ? this.getChartRoots() : [];
		this.generateMissingUrls();
	}

	getDecoratedRow(row) {
		const isActiveRow = row.key === this._activeKey;
		const classNames = ['tree-row'];
		if (isActiveRow) {
			classNames.push('tree-row_active');
		}
		if (row.isCurrentRecord) {
			classNames.push('tree-row_current');
		}
		if (!row.isActive) {
			classNames.push('tree-row_inactive');
		}
		if (row.isMatch) {
			classNames.push('tree-row_match');
		}
		// Names get smaller down to level 3; every row under a level-2 row wears that branch's color.
		classNames.push('tree-row_level-' + Math.min(row.level, DEEPEST_STYLED_LEVEL));
		if (row.branchIndex >= 0) {
			classNames.push('tree-row_branch', 'tree-row_branch-' + ((row.branchIndex % BRANCH_COLOR_COUNT) + 1));
		}
		const guides = [];
		for (let i = 1; i < row.level; i++) {
			guides.push({ key: row.key + '-guide-' + i });
		}
		const isColumns = this.isColumns;
		return {
			...row,
			guides,
			role: isColumns ? 'row' : 'treeitem',
			cellRole: isColumns ? 'gridcell' : null,
			cells: isColumns ? this.getRowCells(row) : [],
			badgeText: isColumns ? '' : row.typeLabel,
			rowClass: classNames.join(' '),
			tabIndex: isActiveRow ? '0' : '-1',
			ariaExpanded: row.hasChildren ? String(row.isExpanded) : null,
			ariaCurrent: row.isCurrentRecord ? 'page' : null,
			nameId: 'name-' + row.key,
			detailId: 'detail-' + row.key,
			hasLink: this.isRecordsSource,
			url: this._urlMap.get(row.key) || null,
			toggleIcon: row.isExpanded ? 'utility:chevrondown' : 'utility:chevronright',
			toggleLabel: formatLabel(row.isExpanded ? LABELS.collapse : LABELS.expand, row.label),
			canZoom: row.descendantCount > 0 && row.key !== this._viewRootKey && !this.isOnlyViewRoot(row.key),
			zoomLabel: formatLabel(LABELS.zoomIn, row.label),
			countText: row.descendantCount > 0 && !isColumns ? formatLabel(LABELS.below, row.descendantCount) : '',
			inactiveText: row.isActive ? '' : LABELS.inactive
		};
	}

	// Zooming into the only record at the top would show the same view as a section, so it is not offered.
	isOnlyViewRoot(key) {
		const viewRootKeys = this.viewRootKeys;
		return viewRootKeys.length === 1 && viewRootKeys[0] === key;
	}

	getRowCells(row) {
		const cells = [];
		if (this._typeFieldLabel) {
			cells.push({ key: row.key + '-type', text: row.typeLabel, cellClass: 'tree-cell' });
		}
		this._columns.forEach((column, position) => {
			cells.push({
				key: row.key + '-column-' + position,
				text: getCellText(column, row.columnValues[position]),
				cellClass: getCellClass('tree-cell', column)
			});
		});
		cells.push({
			key: row.key + '-below',
			text: row.descendantCount > 0 ? String(row.descendantCount) : '',
			cellClass: 'tree-cell tree-cell_number'
		});
		return cells;
	}

	// Org chart
	getChartRoots() {
		return this._index ? getChartTree(this._index, this.viewRootKeys).map(node => this.getChartNode(node)) : [];
	}

	getChartNode(node) {
		const entry = node.entry;
		const count = this._countMap.get(node.key) || 0;
		const isCurrent = Boolean(this.currentRecordKey) && node.key === this.currentRecordKey;
		const variant = this._isNarrow ? 'compact' : CARD_VARIANTS[node.level - 1];
		const hostClasses = ['chart-card'];
		hostClasses.push(
			node.branchIndex >= 0
				? 'chart-card_branch-' + ((node.branchIndex % BRANCH_COLOR_COUNT) + 1)
				: 'chart-card_top'
		);
		if (isCurrent) {
			hostClasses.push('chart-card_current');
		}
		// Details are the column values, minus any that only repeat the avatar's code; a compact card keeps one.
		const details = entry.columnValues
			.map((value, position) => ({
				key: node.key + '-detail-' + position,
				text: getCellText(this._columns[position], value)
			}))
			.filter(detail => detail.text && detail.text !== entry.avatarText)
			.slice(0, variant === 'compact' ? MAX_COMPACT_CARD_DETAILS : MAX_CARD_DETAILS);
		const children = node.children.map(child => this.getChartNode(child));
		return {
			key: node.key,
			recordId: entry.recordId,
			hostClass: hostClasses.join(' '),
			children,
			hasChildren: children.length > 0,
			card: {
				key: node.key,
				recordId: entry.recordId,
				label: entry.label,
				url: this._urlMap.get(node.key) || null,
				hasLink: this.isRecordsSource,
				avatarText: getAvatarText(entry.avatarText, entry.label),
				subtitle: [entry.avatarText, entry.typeLabel].filter(text => text).join(SUBTITLE_SEPARATOR),
				details,
				countText: count > 0 ? formatLabel(LABELS.below, count) : '',
				canZoom: count > 0 && node.key !== this._viewRootKey && !this.isOnlyViewRoot(node.key),
				zoomLabel: formatLabel(LABELS.zoomIn, entry.label),
				inactiveText: entry.isActive ? '' : LABELS.inactive,
				isActive: entry.isActive,
				isCurrent,
				variant
			}
		};
	}

	getChartTargets() {
		const targets = [];
		const collect = nodes =>
			nodes.forEach(node => {
				targets.push({ key: node.key, recordId: node.recordId });
				collect(node.children);
			});
		collect(this._chartRoots);
		return targets;
	}

	// Links
	getRecordPageReference(recordId) {
		return { type: RECORD_PAGE_TYPE, attributes: { recordId, actionName: 'view' } };
	}

	navigateToRecord(recordId) {
		this[NavigationMixin.Navigate](this.getRecordPageReference(recordId));
	}

	// URLs are made only for rows or cards on screen, once per record; a failed one is tried again on the next redraw.
	generateMissingUrls() {
		if (!this.isRecordsSource) {
			return;
		}
		const targets = this.isOrgChart ? this.getChartTargets() : this._rows;
		const missingTargets = targets.filter(
			target => !this._urlMap.has(target.key) && !this._pendingUrlKeySet.has(target.key)
		);
		if (missingTargets.length === 0) {
			return;
		}
		missingTargets.forEach(target => this._pendingUrlKeySet.add(target.key));
		const requests = missingTargets.map(target =>
			this[NavigationMixin.GenerateUrl](this.getRecordPageReference(target.recordId))
				.then(url => ({ key: target.key, url }))
				.catch(() => ({ key: target.key, url: null }))
		);
		Promise.all(requests).then(results => {
			results.forEach(result => {
				this._pendingUrlKeySet.delete(result.key);
				if (result.url) {
					this._urlMap.set(result.key, result.url);
				}
			});
			this._rows = this._rows.map(row => {
				if (row.url || !this._urlMap.has(row.key)) {
					return row;
				}
				return { ...row, url: this._urlMap.get(row.key) };
			});
			if (this.isOrgChart) {
				this._chartRoots = this.getChartRoots();
			}
		});
	}
}
