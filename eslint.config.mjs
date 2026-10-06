// ESLint flat config.
//
// Scope: the React frontend (`src/**`) and the CJS API (`api/**`). The
// TypeScript build configs are type-checked by Vite/`tsc`, so they are ignored.
//
// On the react-hooks plugin: only the two classic rules are enabled
// (`rules-of-hooks`, `exhaustive-deps`). The plugin's newer "React Compiler"
// rules (immutability, refs, set-state-in-effect, preserve-manual-memoization)
// are not enabled, because this project does not use the React Compiler and
// those rules flag large amounts of ordinary, working component code.

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const unusedVars = ['error', {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^(_|React)$',
  // `const { password: _, ...safe } = user` is how secrets are stripped.
  ignoreRestSiblings: true,
}]

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Without these two, every component referenced only from JSX looks unused.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
      'no-unused-vars': unusedVars,
      // `catch {}` is used deliberately for best-effort cleanup (writing to an
      // already-closed SSE stream, aborting a transaction that is gone).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['api/**/*.{cjs,js}', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['api/**/*.mjs', '*.config.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },
]
