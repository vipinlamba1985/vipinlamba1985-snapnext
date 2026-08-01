/**
 * ESLint flat config.
 *
 * Background: ESLint 9 defaults to flat config, and the legacy `.eslintrc.json`
 * could not be loaded against eslint-config-next 16 — every invocation died with
 * "Converting circular structure to JSON". Lint had therefore been silently
 * non-functional; CI kept the step non-blocking, which hid the breakage.
 *
 * eslint-config-next 16 ships a native flat config array, so this consumes it
 * directly rather than bridging through FlatCompat.
 *
 * Severity policy: the goal is a clean *error* baseline so a real regression
 * stands out and the CI step can eventually become a gate. Nothing is disabled
 * to hide a defect — see the two scoped blocks below for the reasoning.
 */
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * React Compiler-era advisories from eslint-plugin-react-hooks v6. These flag
 * discouraged-but-working patterns (setState inside an effect, deps hygiene)
 * rather than defects, and the existing codebase has ~75 instances. They stay
 * reported as warnings — visible and fixable incrementally — instead of being
 * turned off or triggering a codebase-wide rewrite in an unrelated change.
 */
const REACT_COMPILER_ADVISORIES = {
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/exhaustive-deps': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/static-components': 'warn',
};

export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'native/**',
      'native-web/**',
      'public/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.{js,jsx,mjs}'],
    rules: REACT_COMPILER_ADVISORIES,
  },
  {
    // Server-side modules contain no React. The hook rules misfire here: any
    // plain helper named use* (e.g. useGatewayV2, a server feature-flag read)
    // is mistaken for a React hook.
    files: ['lib/**', 'app/api/**', 'scripts/**', 'server.js', 'middleware.js'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/react-compiler': 'off',
    },
  },
  {
    // Node's built-in test runner suites are ESM run outside the bundler.
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
];
