import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default ts.config(
  { ignores: ['node_modules/**', 'dist/**', '.next/**', 'next-env.d.ts', 'coverage/**', 'data/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }] } },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      ...a11y.configs.recommended.rules,
      // Named scroll regions must be focusable for keyboard scrolling.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region'] }],
    },
  },
);
