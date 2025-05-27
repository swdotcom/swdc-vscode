import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';

export default defineConfig([globalIgnores(['**/out', '**/dist', '**/*.d.ts']), {
    plugins: {
        '@typescript-eslint': typescriptEslint,
    },

    languageOptions: {
        globals: {
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 6,
        sourceType: 'module',
    },

    rules: {
        curly: 'warn',
        eqeqeq: 'warn',
        'no-throw-literal': 'warn',
        quotes: ['warn', 'single'],
    },
}]);