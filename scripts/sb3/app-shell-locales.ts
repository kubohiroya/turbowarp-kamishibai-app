export const appShellCommon = Object.freeze({
  about: Object.freeze({
    author: Object.freeze({email: 'hiroya@cuc.ac.jp'}),
    officialWebsite: Object.freeze({
      url: 'https://kubohiroya.github.io/turbowarp-kamishibai-app/',
    }),
  }),
});

export const appShellTitleLines = Object.freeze({
  en: Object.freeze({
    authorOrganization: Object.freeze([
      'Faculty of Policy Planning and Management,',
      'Chiba University of Commerce',
    ]),
    licenseApp: Object.freeze([
      "This application's source code is provided under the",
      'Mozilla Public License 2.0 (MPL-2.0).',
    ]),
    licenseStory: Object.freeze([
      'Each story script is subject to the license and terms',
      'stated in that file.',
    ]),
  }),
  ja: Object.freeze({
    authorOrganization: Object.freeze(['千葉商科大学', '総合政策学部']),
    licenseApp: Object.freeze([
      '本アプリのソースコードはMozilla Public License 2.0（MPL-2.0）で',
      '提供されています。',
    ]),
    licenseStory: Object.freeze([
      '台本ファイルには、各ファイル記載のライセンス・利用条件が',
      '適用されます。',
    ]),
  }),
});

export const appShellLocales = Object.freeze({
  en: Object.freeze({
    about: Object.freeze({
      author: Object.freeze({
        name: 'Hiroya Kubo',
        organization: 'Faculty of Policy Planning and Management, Chiba University of Commerce',
      }),
      license: Object.freeze({
        app: appShellTitleLines.en.licenseApp.join('\n'),
        story: appShellTitleLines.en.licenseStory.join('\n'),
      }),
      officialWebsite: Object.freeze({name: 'Official Website'}),
      title: 'TurboWarp Kamishibai',
    }),
    ui: Object.freeze({
      about: 'About',
      build: 'Build distribution SB3',
      buildCompiled: 'Build distribution SB3 without YAML',
      buildPreparing: 'Checking the latest project files…',
      buildVerifying: 'Building and verifying the distribution SB3…',
      buildSaving: 'Saving the verified distribution SB3…',
      buildSavingRemote: 'Saving the verified SB3; remote assets still require network access…',
      buildDone: 'The distribution SB3 was downloaded.',
      buildDoneRemote: 'The SB3 was downloaded. Remote assets require network access.',
      buildSaved: 'The distribution SB3 was saved.',
      buildSavedRemote: 'The SB3 was saved. Remote assets require network access.',
      buildCancelled: 'SB3 saving was cancelled.',
      buildUnavailable: 'Open a valid project directory before building.',
      close: 'Close',
      invalidScript: 'Invalid script',
      language: 'Language',
      open: 'Open',
      openFile: 'Open story file',
      openProject: 'Open project directory',
      cancel: 'Cancel',
      reload: 'Reload',
    }),
  }),
  ja: Object.freeze({
    about: Object.freeze({
      author: Object.freeze({
        name: '久保 裕也',
        organization: '千葉商科大学 総合政策学部',
      }),
      license: Object.freeze({
        app: appShellTitleLines.ja.licenseApp.join('\n'),
        story: appShellTitleLines.ja.licenseStory.join('\n'),
      }),
      officialWebsite: Object.freeze({name: '公式Webサイト'}),
      title: 'TurboWarp紙芝居',
    }),
    ui: Object.freeze({
      about: 'アプリ情報',
      build: '配布用SB3を作る',
      buildCompiled: 'YAMLなしで配布用SB3を作る',
      buildPreparing: '最新のプロジェクトファイルを確認しています…',
      buildVerifying: '配布用SB3を作成して検証しています…',
      buildSaving: '検証済みの配布用SB3を保存しています…',
      buildSavingRemote: 'リモート素材の通信依存を保持して配布用SB3を保存しています…',
      buildDone: '配布用SB3をダウンロードしました。',
      buildDoneRemote: '配布用SB3をダウンロードしました。リモート素材には通信が必要です。',
      buildSaved: '配布用SB3を保存しました。',
      buildSavedRemote: '配布用SB3を保存しました。リモート素材には通信が必要です。',
      buildCancelled: 'SB3の保存をキャンセルしました。',
      buildUnavailable: '正常なプロジェクトディレクトリを開くと作成できます。',
      close: '閉じる',
      invalidScript: 'エラー：不正な台本ファイル',
      language: '言語',
      open: '台本を開く',
      openFile: '台本ファイルを開く',
      openProject: 'プロジェクトディレクトリを開く',
      cancel: 'キャンセル',
      reload: 'もう一度',
    }),
  }),
});

export const appShellVersion4TitleLines = Object.freeze({
  en: appShellTitleLines.en,
  ja: Object.freeze({
    ...appShellTitleLines.ja,
    authorOrganization: Object.freeze(['千葉商科大学　総合政策学部', '']),
  }),
});

/**
 * Accessible names for the camera preview controls the story can declare.
 *
 * Kept apart from `appShellLocales.*.ui`, which the app shell validates as a flat string table for
 * its own menu. These go to the preview control renderer instead, which names the two buttons and
 * the camera menu entries it builds out of `preview.controls`.
 */
export const appShellCameraPreviewControlLabels = Object.freeze({
  en: Object.freeze({
    mirroring: 'Switch camera preview mirroring',
    cameraMenu: 'Select camera',
    default: 'Default camera',
    front: 'Front camera',
    back: 'Back camera',
    detectedCamera: 'Camera',
    currentCamera: 'Current camera',
  }),
  ja: Object.freeze({
    mirroring: 'カメラ映像の左右反転を切り替える',
    cameraMenu: 'カメラを選ぶ',
    default: '既定のカメラ',
    front: '前面カメラ',
    back: '背面カメラ',
    detectedCamera: 'カメラ',
    currentCamera: '使用中のカメラ',
  }),
});

/**
 * The camera permission step on the title of a pose story, where `<usermedia>` exists.
 *
 * The button is the only thing the page draws: the prompt after it belongs to the browser. So the
 * wording says what the story wants, not what the browser will ask.
 */
export const appShellCameraPermissionLabels = Object.freeze({
  en: Object.freeze({
    prompt: 'Enable the camera for pose recognition',
    working: 'Preparing the camera…',
    retry: 'Enable the camera again',
  }),
  ja: Object.freeze({
    prompt: 'ポーズ認識のためにカメラを使えるようにする',
    working: 'カメラを準備しています…',
    retry: 'もう一度カメラを使えるようにする',
  }),
});

export const appShellLanguageNames = Object.freeze({
  en: 'English',
  ja: '日本語',
});

export const appShellSelectedLanguageNames = Object.freeze({
  en: `✓ ${appShellLanguageNames.en}`,
  ja: `✓ ${appShellLanguageNames.ja}`,
});

export const appShellProjectPlaceholders = Object.freeze({
  '{{ABOUT_AUTHOR_NAME_EN}}': `${appShellLocales.en.about.author.name} <${appShellCommon.about.author.email}>`,
  '{{ABOUT_AUTHOR_NAME_JA}}': `${appShellLocales.ja.about.author.name} <${appShellCommon.about.author.email}>`,
  '{{ABOUT_AUTHOR_ORGANIZATION_EN}}': `Developer: ${appShellLocales.en.about.author.organization}`,
  '{{ABOUT_AUTHOR_ORGANIZATION_JA}}': `開発：${appShellLocales.ja.about.author.organization}`,
  '{{ABOUT_LICENSE_APP_EN}}': appShellLocales.en.about.license.app,
  '{{ABOUT_LICENSE_APP_JA}}': appShellLocales.ja.about.license.app,
  '{{ABOUT_LICENSE_STORY_EN}}': appShellLocales.en.about.license.story,
  '{{ABOUT_LICENSE_STORY_JA}}': appShellLocales.ja.about.license.story,
  '{{ABOUT_OFFICIAL_WEBSITE_NAME_EN}}': appShellLocales.en.about.officialWebsite.name,
  '{{ABOUT_OFFICIAL_WEBSITE_NAME_JA}}': appShellLocales.ja.about.officialWebsite.name,
  '{{ABOUT_OFFICIAL_WEBSITE_URL}}': appShellCommon.about.officialWebsite.url,
  '{{ABOUT_TITLE_EN}}': appShellLocales.en.about.title,
  '{{ABOUT_TITLE_JA}}': appShellLocales.ja.about.title,
  '{{LANGUAGE_NAME_EN}}': appShellLanguageNames.en,
  '{{LANGUAGE_NAME_EN_SELECTED}}': appShellSelectedLanguageNames.en,
  '{{LANGUAGE_NAME_JA}}': appShellLanguageNames.ja,
  '{{LANGUAGE_NAME_JA_SELECTED}}': appShellSelectedLanguageNames.ja,
  '{{UI_ABOUT_EN}}': appShellLocales.en.ui.about,
  '{{UI_ABOUT_JA}}': appShellLocales.ja.ui.about,
  '{{UI_BUILD_EN}}': appShellLocales.en.ui.build,
  '{{UI_BUILD_JA}}': appShellLocales.ja.ui.build,
  '{{UI_CLOSE_EN}}': appShellLocales.en.ui.close,
  '{{UI_CLOSE_JA}}': appShellLocales.ja.ui.close,
  '{{UI_INVALID_SCRIPT_EN}}': appShellLocales.en.ui.invalidScript,
  '{{UI_INVALID_SCRIPT_JA}}': appShellLocales.ja.ui.invalidScript,
  '{{UI_LANGUAGE_EN}}': appShellLocales.en.ui.language,
  '{{UI_LANGUAGE_JA}}': appShellLocales.ja.ui.language,
  '{{UI_OPEN_EN}}': appShellLocales.en.ui.open,
  '{{UI_OPEN_JA}}': appShellLocales.ja.ui.open,
  '{{UI_RELOAD_EN}}': appShellLocales.en.ui.reload,
  '{{UI_RELOAD_JA}}': appShellLocales.ja.ui.reload,
});

const appShellLegacyProjectPlaceholders = Object.freeze({
  ...appShellProjectPlaceholders,
  '{{UI_OPEN_JA}}': 'ファイルを開く',
});

export function resolveAppShellProjectPlaceholders(version: string) {
  return version.startsWith('4.') ? appShellProjectPlaceholders : appShellLegacyProjectPlaceholders;
}
