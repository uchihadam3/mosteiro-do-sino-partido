// ESLint 9 flat config: TypeScript sources of the engine, content and web app.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/web/public/**', 'test-results/**', 'playwright-report/**', 'tools/python/**', '**/*.cjs'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // the engine passes loosely-typed handler args on purpose (serialisable op payloads)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
