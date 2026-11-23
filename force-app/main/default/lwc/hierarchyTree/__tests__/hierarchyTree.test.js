import { createElement } from 'lwc';
import HierarchyTree from 'c/hierarchyTree';
import getHierarchy from '@salesforce/apex/HierarchyTreeController.getHierarchy';
import { refreshApex } from '@salesforce/apex';
import { navigateCalls, resetNavigationCalls } from 'lightning/navigation';

jest.mock(
	'@salesforce/apex/HierarchyTreeController.getHierarchy',
	() => {
		const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
		return { default: createApexTestWireAdapter(jest.fn()) };
	},
	{ virtual: true }
);

jest.mock('@salesforce/apex', () => ({ refreshApex: jest.fn(() => Promise.resolve()) }), { virtual: true });

const HIERARCHY_NODES = require('./data/hierarchyNodes.json');
const PLURAL_LABEL = 'Locations';

function mount(props = {}) {
	const element = createElement('c-hierarchy-tree', { is: HierarchyTree });
	Object.assign(element, props);
	document.body.appendChild(element);
	return element;
}

// Ten microtask turns: enough for the wire, the URL requests and the re-render that follows them.
function flush(turnsLeft = 10) {
	return turnsLeft === 0 ? Promise.resolve() : Promise.resolve().then(() => flush(turnsLeft - 1));
}

async function mountWithData(props = {}, data = {}) {
	const element = mount(props);
	getHierarchy.emit({ nodes: HIERARCHY_NODES, isTruncated: false, objectPluralLabel: PLURAL_LABEL, ...data });
	await flush();
	return element;
}

const byDataId = (element, dataId) => element.shadowRoot.querySelector('[data-id="' + dataId + '"]');
const allByDataId = (element, dataId) => Array.from(element.shadowRoot.querySelectorAll('[data-id="' + dataId + '"]'));
const treeItems = element => Array.from(element.shadowRoot.querySelectorAll('[role="treeitem"]'));
const nameOf = item => item.querySelector('.tree-row__name').textContent.trim();
const rowLabels = element => treeItems(element).map(nameOf);
const itemFor = (element, label) => treeItems(element).find(item => nameOf(item) === label);
const statusText = element => byDataId(element, 'status').textContent;

function pressKey(target, key) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function search(element, value) {
	byDataId(element, 'search').dispatchEvent(new CustomEvent('change', { detail: { value } }));
	await flush();
}

async function zoomInto(element, label) {
	itemFor(element, label).querySelector('[data-id="zoom"]').click();
	await flush();
}

describe('c-hierarchy-tree', () => {
	beforeEach(() => {
		resetNavigationCalls();
		refreshApex.mockClear();
		Element.prototype.scrollIntoView = jest.fn();
	});

	afterEach(() => {
		while (document.body.firstChild) {
			document.body.removeChild(document.body.firstChild);
		}
	});

	describe('loading and configuration', () => {
		it('shows a spinner until the data arrives', () => {
			const element = mount();
			expect(byDataId(element, 'loading')).not.toBeNull();
			expect(treeItems(element)).toHaveLength(0);
		});

		it('passes the design attributes to the controller', async () => {
			mount({
				hierarchySource: 'Records',
				hierarchyObjectApiName: 'AOR__c',
				parentFieldApiName: 'ParentAOR__c',
				labelFieldApiName: 'Name',
				typeFieldApiName: 'Type__c',
				activeFieldApiName: 'IsActive__c'
			});
			await flush();
			expect(getHierarchy.getLastConfig()).toEqual({
				dataSource: 'Records',
				objectApiName: 'AOR__c',
				parentFieldApiName: 'ParentAOR__c',
				labelFieldApiName: 'Name',
				typeFieldApiName: 'Type__c',
				activeFieldApiName: 'IsActive__c'
			});
		});

		it('falls back to Sample for an unknown data source and clamps the open levels', () => {
			const element = mount({ hierarchySource: 'Bogus', expandDepth: '99' });
			expect(element.hierarchySource).toBe('Sample');
			expect(element.expandDepth).toBe(20);
			element.expandDepth = 'not a number';
			expect(element.expandDepth).toBe(2);
			element.expandDepth = -3;
			expect(element.expandDepth).toBe(0);
		});

		it('shows a controller error inline', async () => {
			const element = mount({ hierarchySource: 'Records' });
			getHierarchy.error({ message: 'Unknown object: Nope__c.' });
			await flush();
			expect(byDataId(element, 'error').textContent).toContain('Unknown object: Nope__c.');
			expect(treeItems(element)).toHaveLength(0);
		});

		it('refreshes through refreshApex', async () => {
			const element = await mountWithData();
			byDataId(element, 'refresh').click();
			await flush();
			expect(refreshApex).toHaveBeenCalledTimes(1);
		});

		it('hides the search box when asked', async () => {
			const element = await mountWithData({ hideSearch: true });
			expect(byDataId(element, 'search')).toBeNull();
		});
	});

	describe('the tree', () => {
		it('opens two levels by default and draws names, badges and counts', async () => {
			const element = await mountWithData();
			expect(rowLabels(element)).toEqual([
				'Global',
				'Americas',
				'Canada',
				'United States',
				'APAC',
				'EMEA',
				'Germany'
			]);
			const globalItem = itemFor(element, 'Global');
			expect(globalItem.querySelector('[data-id="type-badge"]').textContent).toBe('Global');
			expect(globalItem.querySelector('[data-id="count"]').textContent).toBe('9 below');
			expect(byDataId(element, 'sample-notice')).not.toBeNull();
			expect(byDataId(element, 'breadcrumb')).toBeNull();
		});

		it('sets the tree roles, levels, positions and one tab stop', async () => {
			const element = await mountWithData();
			const items = treeItems(element);
			expect(items[0].getAttribute('aria-level')).toBe('1');
			expect(items[0].getAttribute('aria-expanded')).toBe('true');
			expect(items[0].getAttribute('tabindex')).toBe('0');
			const unitedStates = itemFor(element, 'United States');
			expect(unitedStates.getAttribute('aria-level')).toBe('3');
			expect(unitedStates.getAttribute('aria-posinset')).toBe('2');
			expect(unitedStates.getAttribute('aria-setsize')).toBe('2');
			expect(unitedStates.getAttribute('aria-expanded')).toBe('false');
			expect(itemFor(element, 'Canada').hasAttribute('aria-expanded')).toBe(false);
			expect(items.filter(item => item.getAttribute('tabindex') === '0')).toHaveLength(1);
		});

		it('sizes names by level and marks each branch with its own color', async () => {
			const element = await mountWithData({ expandDepth: 5 });
			const classesOf = label => itemFor(element, label).classList;
			expect(classesOf('Global').contains('tree-row_level-1')).toBe(true);
			expect(classesOf('Global').contains('tree-row_branch')).toBe(false);
			expect(classesOf('Americas').contains('tree-row_level-2')).toBe(true);
			expect(classesOf('Americas').contains('tree-row_branch-1')).toBe(true);
			expect(classesOf('Boston Office').contains('tree-row_level-3')).toBe(true);
			expect(classesOf('Boston Office').contains('tree-row_branch-1')).toBe(true);
			expect(classesOf('APAC').contains('tree-row_branch-2')).toBe(true);
			expect(classesOf('Berlin Office').contains('tree-row_branch-3')).toBe(true);
			expect(byDataId(element, 'tree').classList.contains('tree_plain')).toBe(false);
		});

		it('numbers the branches again from the view after a zoom, and can drop the colors', async () => {
			const element = await mountWithData({ expandDepth: 5 });
			await zoomInto(element, 'Americas');
			expect(itemFor(element, 'Americas').classList.contains('tree-row_level-1')).toBe(true);
			expect(itemFor(element, 'Americas').classList.contains('tree-row_branch')).toBe(false);
			expect(itemFor(element, 'United States').classList.contains('tree-row_branch-2')).toBe(true);
			element.hideBranchColors = true;
			await flush();
			expect(byDataId(element, 'tree').classList.contains('tree_plain')).toBe(true);
		});

		it('draws sample names as plain text, not links', async () => {
			const element = await mountWithData();
			expect(allByDataId(element, 'name-link')).toHaveLength(0);
		});

		it('opens and closes a branch from its chevron', async () => {
			const element = await mountWithData();
			itemFor(element, 'United States').querySelector('[data-id="toggle"]').click();
			await flush();
			expect(rowLabels(element)).toContain('Boston Office');
			itemFor(element, 'United States').querySelector('[data-id="toggle"]').click();
			await flush();
			expect(rowLabels(element)).not.toContain('Boston Office');
		});

		it('expands everything and collapses back to the top row and its children', async () => {
			const element = await mountWithData();
			byDataId(element, 'expand-all').click();
			await flush();
			expect(treeItems(element)).toHaveLength(10);
			byDataId(element, 'collapse-all').click();
			await flush();
			expect(rowLabels(element)).toEqual(['Global', 'Americas', 'APAC', 'EMEA']);
		});

		it('mutes an inactive record and can hide it with its branch', async () => {
			const element = await mountWithData({ expandDepth: 5 });
			const austin = itemFor(element, 'Austin Office');
			expect(austin.classList.contains('tree-row_inactive')).toBe(true);
			expect(austin.textContent).toContain('Inactive');
			element.hideInactive = true;
			await flush();
			expect(rowLabels(element)).not.toContain('Austin Office');
			expect(itemFor(element, 'Global').querySelector('[data-id="count"]').textContent).toBe('8 below');
		});

		it('warns when the controller held records back', async () => {
			const element = await mountWithData({}, { isTruncated: true });
			expect(byDataId(element, 'truncated').textContent).toContain('first 10 records');
		});

		it('caps the rows it draws and says how many it held back', async () => {
			const nodes = [{ recordId: 'top', parentId: null, label: 'Top', isActive: true }];
			for (let i = 1; i <= 600; i++) {
				nodes.push({ recordId: 'child-' + i, parentId: 'top', label: 'Child ' + i, isActive: true });
			}
			const element = await mountWithData({ expandDepth: 1 }, { nodes });
			expect(treeItems(element)).toHaveLength(500);
			expect(byDataId(element, 'hidden-rows').textContent).toContain('101 more rows');
		});

		it('says so when there is nothing to show', async () => {
			const element = await mountWithData({}, { nodes: [] });
			expect(byDataId(element, 'empty').textContent).toBe('No records to show.');
		});
	});

	describe('zooming', () => {
		it('zooms into a branch with a breadcrumb and a section banner', async () => {
			const element = await mountWithData();
			await zoomInto(element, 'Americas');
			expect(rowLabels(element)).toEqual(['Americas', 'Canada', 'United States']);
			expect(allByDataId(element, 'crumb').map(crumb => crumb.textContent.trim())).toEqual([
				'All Locations',
				'Global'
			]);
			expect(byDataId(element, 'breadcrumb').querySelector('[aria-current="location"]').textContent).toBe(
				'Americas'
			);
			expect(byDataId(element, 'section-banner').textContent).toContain(
				'showing Americas and the 4 records below it.'
			);
			expect(statusText(element)).toContain('Section view');
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'Americas'));
		});

		it('names every level above the view in the breadcrumb and climbs back from a crumb', async () => {
			const element = await mountWithData();
			await zoomInto(element, 'Americas');
			await zoomInto(element, 'United States');
			const crumbs = allByDataId(element, 'crumb');
			expect(crumbs.map(crumb => crumb.textContent.trim())).toEqual(['All Locations', 'Global', 'Americas']);
			crumbs[2].click();
			await flush();
			expect(rowLabels(element)[0]).toBe('Americas');
		});

		it('goes back to the full hierarchy', async () => {
			const element = await mountWithData();
			await zoomInto(element, 'EMEA');
			byDataId(element, 'show-full').click();
			await flush();
			expect(byDataId(element, 'breadcrumb')).toBeNull();
			expect(rowLabels(element)[0]).toBe('Global');
			expect(statusText(element)).toBe('Showing the full hierarchy.');
		});

		it('says when the view is a single record', async () => {
			const element = await mountWithData({ rootRecordId: 'n05' });
			expect(byDataId(element, 'section-banner').textContent).toContain('showing Canada.');
		});

		it('zooms into the selected row from the toolbar', async () => {
			const element = await mountWithData();
			const toolbarZoom = byDataId(element, 'toolbar-zoom');
			itemFor(element, 'Canada').click();
			await flush();
			expect(toolbarZoom.disabled).toBe(true);
			itemFor(element, 'Americas').click();
			await flush();
			expect(toolbarZoom.disabled).toBe(false);
			expect(toolbarZoom.alternativeText).toBe('Zoom in on Americas');
			toolbarZoom.click();
			await flush();
			expect(rowLabels(element)[0]).toBe('Americas');
		});

		it('starts zoomed in on the top record and can still go above it', async () => {
			const element = await mountWithData({ rootRecordId: 'n02' });
			expect(rowLabels(element)[0]).toBe('Americas');
			expect(allByDataId(element, 'crumb').map(crumb => crumb.textContent.trim())).toEqual([
				'All Locations',
				'Global'
			]);
		});

		it('locks the view to the top record', async () => {
			const element = await mountWithData({ rootRecordId: 'n02', isRootLocked: true });
			expect(byDataId(element, 'breadcrumb')).toBeNull();
			expect(rowLabels(element)).toEqual([
				'Americas',
				'Canada',
				'United States',
				'Austin Office',
				'Boston Office'
			]);
			await zoomInto(element, 'United States');
			expect(allByDataId(element, 'crumb').map(crumb => crumb.textContent.trim())).toEqual(['Americas']);
			expect(byDataId(element, 'show-full').label).toBe('Back to Americas');
			byDataId(element, 'show-full').click();
			await flush();
			expect(rowLabels(element)[0]).toBe('Americas');
		});

		it('reports a locked top record that is missing from the hierarchy', async () => {
			const element = await mountWithData({ rootRecordId: 'missing', isRootLocked: true });
			expect(byDataId(element, 'error').textContent).toContain('was not found, or is not shared with you');
		});
	});

	describe('search', () => {
		it('shows the matches with the path down to each, and restores the view when cleared', async () => {
			const element = await mountWithData();
			await search(element, '  BOSTON ');
			expect(rowLabels(element)).toEqual(['Global', 'Americas', 'United States', 'Boston Office']);
			expect(itemFor(element, 'Boston Office').classList.contains('tree-row_match')).toBe(true);
			expect(statusText(element)).toBe('1 match');
			await search(element, '');
			expect(rowLabels(element)).toEqual([
				'Global',
				'Americas',
				'Canada',
				'United States',
				'APAC',
				'EMEA',
				'Germany'
			]);
		});

		it('counts several matches and opens a matched branch on request', async () => {
			const element = await mountWithData();
			await search(element, 'united');
			expect(statusText(element)).toBe('1 match');
			itemFor(element, 'United States').querySelector('[data-id="toggle"]').click();
			await flush();
			expect(rowLabels(element)).toContain('Boston Office');
			await search(element, 'office');
			expect(statusText(element)).toBe('3 matches');
		});

		it('searches within the zoomed view only', async () => {
			const element = await mountWithData();
			await zoomInto(element, 'EMEA');
			await search(element, 'office');
			expect(rowLabels(element)).toEqual(['EMEA', 'Germany', 'Berlin Office']);
		});

		it('says when nothing matches', async () => {
			const element = await mountWithData();
			await search(element, 'zzz');
			expect(byDataId(element, 'empty').textContent).toBe('No names match "zzz".');
		});

		it('expands and collapses within the search results', async () => {
			const element = await mountWithData();
			await search(element, 'united');
			byDataId(element, 'expand-all').click();
			await flush();
			expect(rowLabels(element)).toEqual([
				'Global',
				'Americas',
				'United States',
				'Austin Office',
				'Boston Office'
			]);
			byDataId(element, 'collapse-all').click();
			await flush();
			expect(rowLabels(element)).toEqual(['Global', 'Americas']);
		});
	});

	describe('keyboard', () => {
		it('moves the tab stop with the arrow, Home and End keys', async () => {
			const element = await mountWithData();
			pressKey(treeItems(element)[0], 'ArrowDown');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'Americas'));
			pressKey(itemFor(element, 'Americas'), 'End');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'Germany'));
			pressKey(itemFor(element, 'Germany'), 'ArrowUp');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'EMEA'));
			pressKey(itemFor(element, 'EMEA'), 'Home');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'Global'));
		});

		it('opens and closes with Right and Left, and moves to the parent and first child', async () => {
			const element = await mountWithData();
			itemFor(element, 'United States').click();
			await flush();
			pressKey(itemFor(element, 'United States'), 'ArrowRight');
			await flush();
			expect(rowLabels(element)).toContain('Austin Office');
			pressKey(itemFor(element, 'United States'), 'ArrowRight');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'Austin Office'));
			pressKey(itemFor(element, 'Austin Office'), 'ArrowLeft');
			await flush();
			expect(element.shadowRoot.activeElement).toBe(itemFor(element, 'United States'));
			pressKey(itemFor(element, 'United States'), 'ArrowLeft');
			await flush();
			expect(rowLabels(element)).not.toContain('Austin Office');
		});

		it('ignores keys it does not handle and Enter on sample rows', async () => {
			const element = await mountWithData();
			const first = treeItems(element)[0];
			pressKey(first, 'a');
			pressKey(first, 'Enter');
			await flush();
			expect(navigateCalls).toHaveLength(0);
		});
	});

	describe('record links', () => {
		it('links each name to its record page', async () => {
			const element = await mountWithData({ hierarchySource: 'Records' });
			const link = itemFor(element, 'Americas').querySelector('[data-id="name-link"]');
			expect(link.getAttribute('href')).toBe('/lightning/r/n02/view');
		});

		it('navigates on a plain click and leaves a modified click to the browser', async () => {
			const element = await mountWithData({ hierarchySource: 'Records' });
			const link = itemFor(element, 'Americas').querySelector('[data-id="name-link"]');
			const plainClick = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true });
			link.dispatchEvent(plainClick);
			expect(plainClick.defaultPrevented).toBe(true);
			expect(navigateCalls).toHaveLength(1);
			expect(navigateCalls[0].pageReference).toEqual({
				type: 'standard__recordPage',
				attributes: { recordId: 'n02', actionName: 'view' }
			});
			const newTabClick = new MouseEvent('click', { button: 0, ctrlKey: true, bubbles: true, cancelable: true });
			link.dispatchEvent(newTabClick);
			expect(newTabClick.defaultPrevented).toBe(false);
			expect(navigateCalls).toHaveLength(1);
		});

		it('opens the record with Enter on its row', async () => {
			const element = await mountWithData({ hierarchySource: 'Records' });
			pressKey(treeItems(element)[0], 'Enter');
			expect(navigateCalls).toHaveLength(1);
			expect(navigateCalls[0].pageReference.attributes.recordId).toBe('n01');
		});
	});

	describe('record-page mode', () => {
		it('highlights the current record, opens its path and scrolls to it', async () => {
			const element = await mountWithData({ recordId: 'n08', expandDepth: 1 });
			const boston = itemFor(element, 'Boston Office');
			expect(boston.getAttribute('aria-current')).toBe('page');
			expect(boston.classList.contains('tree-row_current')).toBe(true);
			expect(boston.getAttribute('tabindex')).toBe('0');
			expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
		});

		it('reveals a record set after the data loaded', async () => {
			const element = await mountWithData({ expandDepth: 1 });
			element.recordId = 'n09';
			await flush();
			expect(itemFor(element, 'Berlin Office').getAttribute('aria-current')).toBe('page');
		});

		it('starts at the current record when asked', async () => {
			const element = await mountWithData({ recordId: 'n04', shouldStartAtRecord: true });
			expect(rowLabels(element)[0]).toBe('United States');
			expect(byDataId(element, 'breadcrumb').querySelector('[aria-current="location"]').textContent).toBe(
				'United States'
			);
		});

		it('ignores a current record outside a locked branch', async () => {
			const element = await mountWithData({ recordId: 'n09', rootRecordId: 'n02', isRootLocked: true });
			expect(rowLabels(element)).not.toContain('Berlin Office');
			expect(element.shadowRoot.querySelector('[aria-current="page"]')).toBeNull();
		});
	});
});
