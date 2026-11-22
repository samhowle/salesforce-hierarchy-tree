const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

// sfdx-lwc-jest supplies the LWC preset (compiler, jsdom, lightning/* stubs); this file adds a navigation mock that
// records calls, and coverage floors that fail the run on a breach.
module.exports = {
	...jestConfig,
	// Only *.test.js files are suites: the fixture data beside the tests is not one.
	testMatch: ['**/__tests__/**/*.test.js'],
	modulePathIgnorePatterns: ['<rootDir>/.localdevserver'],
	testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.sfdx/', '<rootDir>/.sf/'],
	moduleNameMapper: {
		'^lightning/navigation$': '<rootDir>/force-app/test/jest-mocks/lightning/navigation/navigation'
	},
	collectCoverageFrom: ['force-app/main/default/lwc/**/*.js', '!**/__tests__/**', '!**/jsconfig.json'],
	coverageThreshold: {
		global: {
			statements: 85,
			branches: 75,
			functions: 85,
			lines: 85
		}
	}
};
