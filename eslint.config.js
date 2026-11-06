import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// La lógica pura (core y game) no puede depender de Three.js, del DOM ni de Math.random:
// así se mantiene determinista y testeable.
const pureLogicRules = {
  'no-restricted-imports': [
    'error',
    { patterns: [{ group: ['three', 'three/*'], message: 'La lógica pura no importa three.' }] },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'La lógica pura no toca el DOM.' },
    { name: 'document', message: 'La lógica pura no toca el DOM.' },
    { name: 'localStorage', message: 'La persistencia vive en src/save.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Usa el RNG con semilla de core/rng.ts.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
    rules: pureLogicRules,
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Usa textContent y creación de nodos.',
        },
        {
          selector: "MemberExpression[object.name='document'][property.name='write']",
          message: 'document.write está prohibido.',
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
