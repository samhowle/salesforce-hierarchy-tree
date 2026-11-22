// Flat config for ESLint 9, which @salesforce/eslint-config-lwc@4 requires. Its `recommended` set already carries
// the Jest plugin, Jest globals and the Babel parser with decorator support.
const lwcConfig = require('@salesforce/eslint-config-lwc');

module.exports = [
	{ ignores: ['node_modules/**', 'coverage/**', '.sfdx/**', '.sf/**', '.localdevserver/**'] },
	...lwcConfig.configs.recommended,
	{
		files: ['**/lwc/**/__tests__/**/*.js', 'force-app/test/**/*.js'],
		// jest.mock factories and JSON fixtures are loaded with require.
		languageOptions: {
			globals: { require: 'readonly' }
		},
		rules: {
			'@lwc/lwc/no-unexpected-wire-adapter-usages': 'off'
		}
	}
];
