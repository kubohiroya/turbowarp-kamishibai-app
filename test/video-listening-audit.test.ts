import assert from 'node:assert/strict';
import {access, mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {test, beforeAll, afterAll} from 'vitest';
import {chromium} from 'playwright-core';
import type {Browser, Page} from 'playwright-core';
import {installAudit} from '../scripts/manual/video-listening-audit.ts';
import {verifySpeakerResult, runSpeakerListening} from '../scripts/manual/video-listening.ts';

let browser: Browser;
beforeAll(async () => {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
  ];
  let executable: string | undefined;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('/')) {
      if (
        await access(candidate).then(
          () => true,
          () => false,
        )
      ) {
        executable = candidate;
        break;
      }
    } else {
      const found = spawnSync('which', [candidate], {encoding: 'utf8'});
      if (found.status === 0) {
        executable = found.stdout.trim();
        break;
      }
    }
  }
  assert(executable, 'Chrome is required for the native-button regression; set CHROME_BIN');
  browser = await chromium.launch({executablePath: executable, headless: true});
});
afterAll(async () => {
  await browser?.close();
});

/** A deliberately fake VM: these tests verify input routing, never hearing or native media. */
async function fixture() {
  const page = await browser.newPage({viewport: {width: 1000, height: 700}});
  await page.setContent('<html><body><button id="host">Host control</button></body></html>');
  await page.evaluate(`globalThis.auditFixture={status:'initializing',starts:0,flags:0,stops:0,hostKeyups:0,hostKeydowns:0,hostClicks:0,hostPressedKeys:{},keyReleases:[],throwFlag:false,reports:[]};
    globalThis.vm={runtime:{_primitives:{kamishibairuntime4__statusReporter:()=>auditFixture.status}},
      start(){auditFixture.starts++},greenFlag(){auditFixture.flags++;if(auditFixture.throwFlag)throw Error('injected start failure');auditFixture.status='running'},stopAll(){auditFixture.stops++}};
    addEventListener('keyup',event=>auditFixture.keyReleases.push({trusted:event.isTrusted,key:event.key,target:event.target.tagName,id:event.target.id}),true);
    document.addEventListener('keydown',event=>{auditFixture.hostKeydowns++;auditFixture.hostPressedKeys[event.code||event.key]=true});
    document.addEventListener('keyup',event=>{auditFixture.hostKeyups++;delete auditFixture.hostPressedKeys[event.code||event.key];event.preventDefault()});
    document.querySelector('#host').addEventListener('click',()=>auditFixture.hostClicks++);`);
  await page.evaluate(
    `(${installAudit.toString()})({caseId:'automated-fake-vm',label:'Input regression (not a listening report)',index:1,total:1})`,
  );
  await page.locator('#speaker-listening-audit').waitFor();
  return page;
}
async function ready(page: Page) {
  await page.evaluate('auditFixture.status="ready"');
  await page.waitForFunction('!document.querySelector("#speaker-listening-audit button").disabled');
}
const start = '#speaker-listening-audit button:first-of-type';

for (const mode of ['mouse', 'Enter', 'Space'])
  test(`starts once with native ${mode} despite the host keyup cancellation`, async () => {
    const page = await fixture();
    try {
      await ready(page);
      if (mode === 'mouse') await page.locator(start).click();
      else {
        await page.locator(start).focus();
        await page.keyboard.press(mode);
      }
      assert.equal(await page.evaluate('auditFixture.starts'), 1);
      assert.equal(await page.evaluate('auditFixture.flags'), 1);
      assert.equal(await page.locator(start).isDisabled(), true);
      assert.equal(
        await page.evaluate(
          '__speakerAudit.inputDiagnostics().events.filter(e=>e.type==="start-accepted").length',
        ),
        1,
      );
      assert.equal(
        await page.evaluate(
          '__speakerAudit.inputDiagnostics().events.find(e=>e.type==="click").trusted',
        ),
        true,
      );
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 0);
      // Host keys outside the audit must retain their original propagation.
      await page.locator('#host').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
      assert.equal(await page.evaluate('auditFixture.flags'), 1);
    } finally {
      await page.close();
    }
  });

for (const delay of [0, 1, 25, 100, 250])
  test(`keeps Enter release isolated with a ${delay}ms native press`, async () => {
    const page = await fixture();
    try {
      await ready(page);
      await page.locator(start).focus();
      await page.keyboard.press('Enter', {delay});
      assert.equal(await page.evaluate('auditFixture.starts'), 1);
      assert.equal(await page.evaluate('auditFixture.flags'), 1);
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 0);
      assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 0);
      assert.equal(await page.evaluate('auditFixture.keyReleases.length'), 1);
      assert.equal(await page.evaluate('auditFixture.keyReleases[0].trusted'), true);
      await page.locator('#host').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
      assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 1);
      assert.equal(await page.evaluate('auditFixture.hostClicks'), 1);
      assert.equal(await page.evaluate('auditFixture.flags'), 1);
    } finally {
      await page.close();
    }
  });

for (const destination of ['body', 'host'])
  for (const delay of [0, 100, 250])
    test(`keeps Enter release isolated after focus moves to ${destination} for ${delay}ms`, async () => {
      const page = await fixture();
      try {
        await ready(page);
        await page.locator(start).focus();
        await page.keyboard.down('Enter');
        assert.equal(await page.evaluate('auditFixture.starts'), 1);
        assert.equal(await page.locator(start).isDisabled(), true);
        if (destination === 'host') await page.locator('#host').focus();
        else
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          });
        assert.equal(
          await page.evaluate('document.activeElement.tagName'),
          destination === 'host' ? 'BUTTON' : 'BODY',
        );
        // Deliberately vary the held key duration, rather than waiting for an arbitrary render.
        if (delay) await page.waitForTimeout(delay);
        await page.keyboard.up('Enter');
        assert.equal(await page.evaluate('auditFixture.hostKeyups'), 0);
        assert.equal(await page.evaluate('auditFixture.flags'), 1);
        assert.equal(
          await page.evaluate('auditFixture.keyReleases[0].target'),
          destination === 'host' ? 'BUTTON' : 'BODY',
        );
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
      } finally {
        await page.close();
      }
    });

test('isolates owned repeat events after focus moves without blocking another host key', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page.locator(start).focus();
    await page.keyboard.down('Enter');
    await page.locator('#host').focus();
    await page.keyboard.down('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 0);
    assert.equal(await page.evaluate('auditFixture.hostClicks'), 0);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 1);
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    assert.equal(await page.evaluate('auditFixture.flags'), 1);
  } finally {
    await page.close();
  }
});

for (const key of ['a', 'Enter'])
  test(`preserves host ownership of ${key} through an audit repeat and host release`, async () => {
    const page = await fixture();
    try {
      await ready(page);
      await page.locator('#host').focus();
      await page.keyboard.down(key);
      assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 1);
      assert.equal(await page.evaluate('Object.keys(auditFixture.hostPressedKeys).length'), 1);
      await page.locator(start).focus();
      // A native repeat after focus changes must not acquire a new gesture owner.
      await page.keyboard.down(key);
      assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 1);
      await page.locator('#host').focus();
      await page.keyboard.up(key);
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
      assert.equal(await page.evaluate('Object.keys(auditFixture.hostPressedKeys).length'), 0);
      assert.equal(await page.evaluate('auditFixture.keyReleases[0].trusted'), true);
      assert.equal(await page.evaluate('auditFixture.keyReleases[0].id'), 'host');
      await page.keyboard.press(key);
      assert.equal(await page.evaluate('auditFixture.hostKeydowns'), 2);
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 2);
      assert.equal(await page.evaluate('Object.keys(auditFixture.hostPressedKeys).length'), 0);
    } finally {
      await page.close();
    }
  });

test('synthetic key events cannot claim or release a trusted key gesture', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page
      .locator(start)
      .evaluate((button) =>
        button.dispatchEvent(
          new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', bubbles: true}),
        ),
      );
    await page.locator('#host').focus();
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    await page.locator(start).focus();
    await page.keyboard.down('Enter');
    await page.locator('#host').focus();
    await page
      .locator('#host')
      .evaluate((button) =>
        button.dispatchEvent(
          new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', bubbles: true}),
        ),
      );
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 2);
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 2);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 3);
  } finally {
    await page.close();
  }
});

test('keeps NumpadEnter ownership separate from the main Enter key', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page.locator(start).focus();
    await page.keyboard.down('NumpadEnter');
    assert.equal(await page.evaluate('auditFixture.flags'), 1);
    await page.locator('#host').focus();
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    await page.keyboard.up('NumpadEnter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    await page.keyboard.press('NumpadEnter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 2);
  } finally {
    await page.close();
  }
});

test('does not activate a host button when a held Space gesture leaves the audit', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page.locator(start).focus();
    await page.keyboard.down('Space');
    await page.locator('#host').focus();
    await page.keyboard.up('Space');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 0);
    assert.equal(await page.evaluate('auditFixture.hostClicks'), 0);
    assert.equal(await page.evaluate('auditFixture.flags'), 0);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
    assert.equal(await page.evaluate('auditFixture.hostClicks'), 1);
    await page.locator(start).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate('auditFixture.flags'), 1);
  } finally {
    await page.close();
  }
});

for (const boundary of ['blur', 'pagehide', 'visibilitychange'])
  test(`clears an unfinished gesture at the window ${boundary} boundary`, async () => {
    const page = await fixture();
    try {
      await ready(page);
      await page.locator(start).focus();
      await page.keyboard.down('Enter');
      await page.locator('#host').focus();
      // Inject the lifecycle notification; this is not an OS window-focus measurement.
      await page.evaluate((type) => {
        if (type === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', {get: () => 'hidden'});
          document.dispatchEvent(new Event(type));
        } else window.dispatchEvent(new Event(type));
      }, boundary);
      await page.keyboard.up('Enter');
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 1);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate('auditFixture.hostKeyups'), 2);
    } finally {
      await page.close();
    }
  });

test('waits for ready, rejects synthetic input, and records obstruction changes before any answer', async () => {
  const page = await fixture();
  try {
    assert.equal(await page.locator(start).isDisabled(), true);
    await ready(page);
    await page.locator(start).evaluate((button) => (button as HTMLButtonElement).click());
    assert.equal(await page.evaluate('auditFixture.starts'), 0);
    // An availability change can be recorded after the rejection, so wait for the rejection
    // itself instead of reading whichever event happens to be last.
    await page.waitForFunction(
      '__speakerAudit.inputDiagnostics().events.some(e=>e.reason==="untrusted-input")',
    );
    await page.evaluate(
      `const rect=document.querySelector('#speaker-listening-audit button').getBoundingClientRect();const cover=document.createElement('div');cover.id='obstruction';cover.style.cssText='position:fixed;z-index:2147483647;background:red;left:'+rect.x+'px;top:'+rect.y+'px;width:'+rect.width+'px;height:'+rect.height+'px';document.body.append(cover);`,
    );
    await page.waitForFunction(
      '__speakerAudit.inputDiagnostics().events.some(e=>e.type==="availability-change"&&!e.state.hit&&e.state.stack[0]?.id==="obstruction")',
    );
    await page.evaluate('document.querySelector("#obstruction").remove()');
    await page.waitForFunction('__speakerAudit.inputDiagnostics().events.at(-1).state.hit');
    assert.equal(await page.evaluate('auditFixture.starts'), 0);
  } finally {
    await page.close();
  }
});

test('reports a synchronous startup exception and permits a trusted retry', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page.evaluate('auditFixture.throwFlag=true');
    await page.locator(start).click();
    assert.equal(await page.locator(start).isDisabled(), false);
    assert.match(await page.locator('#speaker-listening-audit').innerText(), /開始処理でエラー/);
    assert.equal(
      await page.evaluate(
        '__speakerAudit.inputDiagnostics().events.find(e=>e.type==="start-error").message',
      ),
      'injected start failure',
    );
    assert.equal(await page.evaluate('auditFixture.stops'), 1);
    await page.evaluate('auditFixture.throwFlag=false');
    await page.locator(start).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate('auditFixture.flags'), 2);
    assert.equal(await page.locator(start).isDisabled(), true);
  } finally {
    await page.close();
  }
});

test('bounds diagnostics and omits typed characters and synthetic listening answers', async () => {
  const page = await fixture();
  try {
    await ready(page);
    await page.locator(start).focus();
    await page.keyboard.type('PRIVATE');
    assert.equal(
      await page.evaluate(
        '__speakerAudit.inputDiagnostics().events.filter(e=>e.type==="keydown"||e.type==="keyup").every(e=>e.key===null)',
      ),
      true,
    );
    await page.evaluate(
      `for(let i=0;i<150;i++)document.querySelector('#speaker-listening-audit button').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));`,
    );
    assert.equal(await page.evaluate('__speakerAudit.inputDiagnostics().events.length'), 120);
    assert(
      !String(await page.evaluate('JSON.stringify(__speakerAudit.inputDiagnostics())')).includes(
        'PRIVATE',
      ),
    );
    await page.evaluate(`document.querySelectorAll('#speaker-listening-audit button')[3].click()`);
    assert.equal(await page.evaluate('__speakerAudit.inputDiagnostics().current.finished'), false);
  } finally {
    await page.close();
  }
});

test('rejects non-human or incomplete success claims at the result boundary', () => {
  assert.throws(() =>
    verifySpeakerResult({listenerEventTrusted: false, listenerResult: 'heard-and-stopped'}),
  );
  assert.throws(() =>
    verifySpeakerResult({
      listenerEventTrusted: true,
      listenerResult: 'heard-and-stopped',
      outcome: 'incomplete',
    }),
  );
  assert.throws(() =>
    verifySpeakerResult({listenerEventTrusted: true, listenerResult: 'invented'}),
  );
  assert.doesNotThrow(() =>
    verifySpeakerResult({listenerEventTrusted: true, listenerResult: 'not-checked'}),
  );
});

test('validates audible playback independently from native video play-call order', () => {
  const audible = {
    width: 160,
    height: 120,
    currentTime: 1.1,
    frames: 20,
    paused: false,
    muted: false,
    volume: 0.35,
  };
  const silent = {...audible, muted: true, volume: 1};
  const result = {
    listenerEventTrusted: true,
    listenerResult: 'heard-and-stopped',
    outcome: 'completed',
    startReport: {trusted: true, activation: true},
    playing: {videos: [audible, silent]},
    stopped: {
      videos: [
        {paused: true, src: null},
        {paused: true, src: null},
      ],
    },
    errors: [],
  };
  assert.doesNotThrow(() => verifySpeakerResult(result));
  assert.doesNotThrow(() => verifySpeakerResult({...result, playing: {videos: [silent, audible]}}));
  for (const videos of [
    [silent, silent],
    [audible, audible],
    [{...audible, volume: 0.5}, silent],
  ])
    assert.throws(() => verifySpeakerResult({...result, playing: {videos}}));
});

test('validates manual inputs before creating a browser or overwriting prior reports', async () => {
  await assert.rejects(() => runSpeakerListening(['--browser', 'safari']));
  await assert.rejects(() =>
    runSpeakerListening([
      '--fixture-dir',
      '/missing',
      '--executable',
      '/missing',
      '--surfaces',
      'invalid',
    ]),
  );
});

test('never overwrites an existing result file when starting or resuming', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'speaker-audit-output-'));
  try {
    await writeFile(
      path.join(directory, 'webm-audible.sb3'),
      'unused: validation stops before loading',
    );
    const resultFile = path.join(directory, 'chrome-results.json');
    const original = '[{"keep":"original user report"}]\n';
    await writeFile(resultFile, original);
    const args = [
      '--browser',
      'chrome',
      '--executable',
      '/unused',
      '--fixture-dir',
      directory,
      '--surfaces',
      'player',
      '--formats',
      'webm',
      '--output-dir',
      directory,
    ];
    await assert.rejects(() => runSpeakerListening(args), /EEXIST/);
    assert.equal(await readFile(resultFile, 'utf8'), original);
    const resume = path.join(directory, 'resume.json');
    await writeFile(
      resume,
      JSON.stringify([
        {
          browserName: 'chrome',
          caseId: 'chrome-player-webm-audible',
          pass: true,
          listenerEventTrusted: true,
          listenerResult: 'not-checked',
        },
      ]),
    );
    await assert.rejects(() => runSpeakerListening([...args, '--resume', resume]), /EEXIST/);
    assert.equal(await readFile(resultFile, 'utf8'), original);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
