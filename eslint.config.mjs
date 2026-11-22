import globals from 'globals';

const rules = {
  eqeqeq: 'error',
  'no-undef': 'error',
  'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'tmp/**',
      // These files are immutable build artifacts synchronized from their upstream repositories.
      'app/extensions/kubohiroyaassetcache.js',
      'app/extensions/kubohiroyaasyncinput.js',
      'app/extensions/kubohiroyaruntimeexpression.js',
      'app/extensions/kubohiroyatextlines.js',
      'app/extensions/kubohiroyasvgtext.js',
      'app/extensions/kubohiroyabubble.js',
      'app/extensions/kubohiroyatm.js',
    ],
  },
  {
    files: [
      'bin/**/*.{js,mjs,cjs}',
      'docs/**/*.{js,mjs,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'src/**/*.{js,mjs,cjs}',
      'test/**/*.{js,mjs,cjs}',
      '*.{js,mjs,cjs}',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules,
  },
  {
    files: ['site/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules,
  },
  {
    files: ['app/extensions/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Scratch: 'readonly',
      },
    },
    rules,
  },
];
