import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'out/**',
      'webview-ui/dist/**',
      '*.vsix',
      'src/vendor/**',
    ],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // Pre-existing `any` casts are tracked tech debt (see #13 shared
    // types). Warn so CI stays green while new code avoids them.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['webview-ui/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
);
