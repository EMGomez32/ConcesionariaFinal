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
      // Regla nueva de eslint-plugin-react-hooks 7.1 (consejo de rendimiento del React
      // Compiler, no un bug): marca ~37 lugares que sincronizan estado en un effect y hoy
      // funcionan. Queda como aviso para no reescribir 18 pantallas dentro de una
      // actualización de dependencias; se corrigen aparte, de a una y probadas.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
