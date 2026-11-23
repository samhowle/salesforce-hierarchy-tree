/* hierarchyTreeCard.js  **********************************************************************************************
 * One card in c-hierarchy-tree's org chart: an avatar, the name as a link, a short subtitle, a few details and a zoom
 * button. It holds no state; the parent passes a ready-made card and handles the zoom and navigate events.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * @test		../hierarchyTree/__tests__/hierarchyTree.test.js
 *********************************************************************************************************************/
import { LightningElement, api } from 'lwc';

const LONG_AVATAR_LENGTH = 4;

export default class HierarchyTreeCard extends LightningElement {
	/**
	 * { key, recordId, label, url, hasLink, avatarText, subtitle, details: [{ key, text }], countText, canZoom,
	 *   zoomLabel, inactiveText, isActive, isCurrent, variant: 'root' | 'branch' | 'compact' }
	 */
	@api card;

	@api
	focus() {
		const target = this.refs.link || this.refs.card;
		if (target) {
			target.focus();
		}
	}

	get cardClass() {
		const classNames = ['card', 'card_' + this.card.variant];
		if (this.card.isCurrent) {
			classNames.push('card_current');
		}
		if (!this.card.isActive) {
			classNames.push('card_inactive');
		}
		return classNames.join(' ');
	}

	get avatarClass() {
		return this.card.avatarText.length >= LONG_AVATAR_LENGTH ? 'card__avatar card__avatar_long' : 'card__avatar';
	}

	get ariaCurrent() {
		return this.card.isCurrent ? 'page' : null;
	}

	get hasFoot() {
		return Boolean(this.card.countText) || this.card.canZoom;
	}

	// A plain left click navigates inside Lightning or the site; a modified or middle click is left to the browser.
	onNameClick(event) {
		const isPlainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		if (!isPlainClick) {
			return;
		}
		event.preventDefault();
		this.dispatchEvent(new CustomEvent('navigate', { detail: { recordId: this.card.recordId } }));
	}

	onZoomClick() {
		this.dispatchEvent(new CustomEvent('zoom', { detail: { key: this.card.key } }));
	}
}
