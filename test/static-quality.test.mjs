import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {ESLint} from 'eslint';

const projectRoot = new URL('../', import.meta.url);
const expectedRules = ['eqeqeq', 'no-undef', 'no-unused-vars'];
const firstPartyFiles = [
  'bin/tmpose-kamishibai.mjs',
  'eslint.config.mjs',
  'scripts/build-site.mjs',
  'site/site-shell.js',
  'src/builder/index.js',
  'test/turbowarp-vm.test.mjs',
];
const vendoredExtensions = [
  'app/extensions/kubohiroyaassetmanager.js',
  'app/extensions/kubohiroyaasyncinput.js',
  'app/extensions/kubohiroyaruntimeexpression.js',
  'app/extensions/kubohiroyatextlines.js',
  'app/extensions/text.js',
  'app/extensions/kubohiroyatm.js',
];

test('applies static quality rules to every first-party code area', async () => {
  const eslint = new ESLint({cwd: new URL('.', projectRoot).pathname});
  for (const filename of firstPartyFiles) {
    const config = await eslint.calculateConfigForFile(filename);
    for (const rule of expectedRules) {
      assert.equal(config.rules[rule][0], 2, `${rule} is not enabled for ${filename}`);
    }
  }
});

test('rejects undefined and unused variables in newly added first-party code', async () => {
  const eslint = new ESLint({cwd: new URL('.', projectRoot).pathname});
  const [result] = await eslint.lintText('const unused = 1; missingFunction();\n', {
    filePath: 'scripts/static-quality-contract-probe.mjs',
  });

  assert.deepEqual(result.messages.map(({ruleId}) => ruleId).sort(), [
    'no-undef',
    'no-unused-vars',
  ]);
});

test('excludes only upstream-synchronized extension artifacts from local linting', async () => {
  const eslint = new ESLint({cwd: new URL('.', projectRoot).pathname});
  for (const filename of vendoredExtensions) {
    assert.equal(await eslint.isPathIgnored(filename), true, `${filename} must remain vendored`);
  }
});

test('uses repository-wide lint and format commands', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(packageJson.scripts.lint, 'eslint .');
  assert.match(packageJson.scripts.format, /^prettier --check /u);
  assert.match(packageJson.scripts.format, /\*\*\/\*\.\{js,mjs,cjs\}/u);
});
