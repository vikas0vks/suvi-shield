import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'src/generated/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['tests/**/*.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['tests/filter-compiler.test.ts'],
    extends: [tseslint.configs.disableTypeChecked]
  },
  {
    files: ['src/injected/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off'
    }
  }
);
