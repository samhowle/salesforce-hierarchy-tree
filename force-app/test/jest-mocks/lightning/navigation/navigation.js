// Jest mock for lightning/navigation, in place of the sfdx-lwc-jest stub (jest.config.js, moduleNameMapper). The stub's
// Navigate does nothing and its GenerateUrl returns one fixed URL; this mock records every call and returns a URL per
// record, so a test can see which record a click navigated to. Lives outside the lwc tree and never deploys.
import { createTestWireAdapter } from '@salesforce/wire-service-jest-util';

export const CurrentPageReference = createTestWireAdapter(jest.fn());

const Navigate = Symbol('Navigate');
const GenerateUrl = Symbol('GenerateUrl');

export const navigateCalls = [];
export const generateUrlCalls = [];

export function resetNavigationCalls() {
	navigateCalls.length = 0;
	generateUrlCalls.length = 0;
}

export const NavigationMixin = Base => {
	return class extends Base {
		[Navigate](pageReference, shouldReplace) {
			navigateCalls.push({ pageReference, shouldReplace });
		}
		[GenerateUrl](pageReference) {
			generateUrlCalls.push(pageReference);
			const recordId = pageReference && pageReference.attributes ? pageReference.attributes.recordId : '';
			return Promise.resolve('/lightning/r/' + recordId + '/view');
		}
	};
};
NavigationMixin.Navigate = Navigate;
NavigationMixin.GenerateUrl = GenerateUrl;
