# JED Scoring

<img src="src/assets/icons/jed-128.png" alt="JED Scoring" width="80" height="80">

**Score Your Video with Suno · 直接在 Suno 中为视频配乐**

English | [简体中文](README.zh-CN.md)

[Download v0.2.1](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1) · [Installation & usage](docs/usage.md) · [Report an issue](https://github.com/JedWang000/jed-scoring/issues) · [MIT license](LICENSE)

JED Scoring V0.2.1 is a local-first Chrome/Edge Manifest V3 extension that previews a local video alongside Suno Studio and follows Studio's playback clock. Compose music while watching your footage in the browser side panel or Picture-in-Picture.

**Suno Studio 2 compatibility:** the maintainer reported successful real-world use on October 3, 2026. This is a manual compatibility report, not a guarantee for every project or future Suno update. See [compatibility](docs/compatibility.md).

## What it does

- Follows Suno Studio play/pause and seeking, with offset adjustment and drift correction.
- Generates an equal-duration silent WAV for an explicitly confirmed reference clip on the Studio timeline.
- Keeps the original video and audio on your device. You decide whether to drag or upload the generated silent WAV to Suno.
- Offers a fixed video preview, Picture-in-Picture, and a local audio mute control.
- Supports 简体中文, 繁體中文, and English in the extension, with a saved language preference.
- Pauses synchronization when the reference clip or Studio state can no longer be verified safely.

## Install

1. Download **JED-Scoring-v0.2.1.zip** from [Releases](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1), then extract it to a permanent folder. GitHub's automatic **Source code** archives require a build first.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and choose the extracted folder containing `manifest.json`.
4. Open or refresh [Suno Studio](https://suno.com/studio), then open the JED Scoring side panel.

This release is distributed as an unpacked extension, not through the Chrome Web Store. Chrome is the primary tested browser; Edge is a compatible target that needs its own validation.

## Start scoring

1. Open a Studio project and click **Connect Studio** in the extension.
2. Choose a local MP4, WebM, or MOV that your browser can decode.
3. Drag the generated silent WAV onto a Studio audio track. If direct drag does not work, click **Download silent WAV**, then drag from the browser's download bubble.
4. Select the corresponding timeline clip in JED Scoring and click **Confirm reference audio clip**. If no clip appears, save your Studio work before refreshing or using **Reload Studio and read project**.
5. Click **Start sync**, then play, pause, and seek in Suno Studio. Adjust **Offset** or click **Resync** if needed.

Original video audio is **on by default**; mute it when you only want to hear Studio. See [the bilingual guide](docs/usage.md) for troubleshooting and updates.

## Privacy and permissions

The extension does not upload your original video/audio, collect analytics, or read cookies, access tokens, or authentication headers. Local storage holds metadata, reference mappings, and preferences; it does not persist video bytes or absolute file paths.

| Permission | Purpose |
| --- | --- |
| `storage` | Store extension preferences and metadata. |
| `sidePanel` | Display the video and synchronization controls. |
| `debugger` | Observe allowlisted project state and transport after you connect Studio. Chrome may display a debugging banner. |
| `tabs` | Verify the selected Studio tab before connecting. |
| `https://suno.com/*` | Run the Studio page adapter on this host. |

See the full [English privacy policy](docs/privacy.md) / [中文隐私说明](docs/privacy.zh-CN.md).

## Build and test

Use **Node.js 24**, npm, and Google Chrome. The lockfile pins the dependency tree.

```sh
git clone https://github.com/JedWang000/jed-scoring.git
cd jed-scoring
npm ci
npm run build
```

Load the generated `dist/` folder as an unpacked extension. On Windows, use `npm.cmd` / `npx.cmd` if PowerShell blocks the corresponding scripts.

```sh
npx playwright install chromium
npm run verify:package
```

The delivery gate runs TypeScript checking, unit tests, source E2E tests, built-package E2E tests, and a distribution integrity check. Browser tests use a tiny embedded synthetic video and do not require your media or a Suno account. System Chrome tests cover the UI; Playwright Chromium tests cover a real unpacked extension under restrictive CSP. [Development details](CONTRIBUTING.md).

## Project layout

```text
src/background/   Studio connection and Chrome DevTools Protocol observation
src/content/      Page adapters, state validation, and MAIN-world bridge
src/media/        Local video metadata and silent WAV generation
src/sync/         Synchronization state machine and video controller
src/ui/           Side panel, components, and three interface languages
src/store/        Local project metadata and reference mappings
build/            Manifest/localization and standalone observer build plugins
scripts/          Test runners and distribution integrity verification
tests/            Unit, source E2E, and packaged-extension tests
docs/             Usage, compatibility, architecture, and privacy
```

## Limitations

- Studio remains the master clock. This is browser-level preview synchronization, not sample-accurate or hardware genlock synchronization, and it does not render or export a combined video.
- One local video and one explicitly confirmed reference clip are supported at a time. Reference clips must use supported timing, 1× speed, and no Warp, reverse, or clip looping.
- Browser codec support determines which videos can play. Very long videos can exceed memory or WAV size limits.
- Suno UI/project format changes, background tab throttling, and competing DevTools sessions can affect observation. Unsupported or ambiguous state pauses sync.
- A saved project may require selecting the local video again after reopening the panel.

## Developer and customization

Developed by **达子 Jed_Wang** · [Bilibili](https://b23.tv/iNOah8D).

The two developer-footer destinations default to `https://b23.tv/iNOah8D`. Build-time `VITE_JED_CONTACT_URL` and `VITE_JED_HOMEPAGE_URL` can override them; each override is evaluated independently. An unsafe explicit override fails closed: non-HTTPS or malformed values become non-interactive text. These values are public build configuration, never secrets.

## Contribute and license

Issues and pull requests in English or Chinese are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CHANGELOG.md](CHANGELOG.md).

Licensed under [MIT](LICENSE). Bundled dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This independent community project is not affiliated with or endorsed by Suno. Suno names and trademarks belong to their respective owners.
