import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Experimental react-compiler rule: false-positives on custom hooks that
      // return a ref-setter callback (it taints the whole returned object, e.g.
      // flagging plain state like `editor.imageSize.w`). The real rules of hooks
      // and exhaustive-deps stay on.
      'react-hooks/refs': 'off',
      // Also experimental: flags standard `e.preventDefault()` in event handlers
      // as a render-phase mutation. Off until it stabilizes.
      'react-hooks/immutability': 'off',
    },
  },
])
