# Privacy and permission model

[中文](privacy.zh-CN.md)

## Local state and persistence

- Selected video bytes, blob URLs, filename, duration, and dimensions stay in the active panel's memory.
- Reference selection/binding, Offset, mute, and Picture-in-Picture state are also session state.
- The interface language is saved in the extension's local storage. Browser-only previews fall back to localStorage.
- Closing or reloading the panel requires selecting the video, confirming the reference, and setting Offset again. The current interface does not save or restore a project.
- The background service worker keeps up to 200 diagnostic entries in memory.
- The generated silent WAV remains in memory until you drag or download it.

The active panel does not persist video bytes, absolute paths, media fingerprints, or reference mappings. Blob URLs are revoked when their metadata reader or preview is disposed.

The source tree includes separately tested IndexedDB project-store and bounded fingerprint helpers. They are not connected to the production panel in 0.2.1; their presence is not a project-persistence feature.

## Data read from Suno

The background service worker attaches Chrome DevTools Protocol only to the active `https://suno.com/studio` tab after you connect it. A semantic MAIN-world probe reads the visible transport control cluster and reports project time, play/pause, scrub state, a monotonic sequence, and a fixed strategy identifier. It does not use CSS module class names or SVG path data.

The CDP Network collector reads response/request bodies only for exact allowlisted Studio project, revision, version, and save endpoints. It validates size, status, encoding, and schema, immediately projects timing, loop, and safe audio-block fields, and releases the raw body.

At document_start, Chrome directly runs a self-contained observer in MAIN world. It wraps the page's existing Fetch function, handles only exact allowed origins/paths/methods, clones successful GET responses or reads existing string save-project bodies, and exports validated, bounded timing/loop/audio-block fields through a versioned same-origin message. It does not use a DOM script element, dynamic import, or extension API in MAIN world. It does not initiate or modify network requests or read request headers.

The extension does not inspect Suno cookies, local/session storage, profiles, passwords, access tokens, API keys, authorization headers, or account data.

## Network and upload behavior

The extension does not upload the original video or its original audio, and it does not collect telemetry. Developer links open external sites only when clicked.

After reading video metadata locally, it creates an equal-duration 44.1 kHz mono 16-bit PCM WAV whose samples are all zero. A real drag gesture or download click is required to hand off that generated file. The extension does not call a Suno upload API.

The drag payload contains only the generated WAV, not the original File, video bytes, original audio, absolute path, or credentials. Its filename is derived from the video's name. Rename the downloaded WAV before importing if you do not want to share that name.

If direct drag is ignored, download the WAV and drag it from the browser's download bubble. No downloads permission or folder traversal is required.

## Diagnostics export

**Copy diagnostics summary** copies JSON with `schemaVersion: 1` and an `entries` array from the background's 200-entry memory buffer. Entries contain timestamps, category and event/error codes, and bounded evidence such as counts, booleans, session generations, observed time, and transport strategy strings.

The buffer rejects sensitive field names and values, including URLs, paths, authentication-like values, project identifiers, prompts, and lyrics. Exported diagnostics do not include raw project bodies, media, filenames, fingerprints, or credentials. Review the summary before sharing it.

The separate `src/diagnostics/export.ts` helper is tested but is not the export used by the current interface.

## Manifest permissions

| Permission | Current use |
| --- | --- |
| `storage` | Persist the selected interface language. |
| `sidePanel` | Display the extension UI. |
| `debugger` | Attach a CDP session for allowlisted project/transport observation after you connect Studio. |
| `tabs` | Verify the active Studio tab before attachment. |
| `https://suno.com/*` | Run content scripts on the exact Suno HTTPS host. |

No scripting, webRequest, cookies, arbitrary-host, downloads, microphone, or camera permission is requested. The debugger permission is powerful; the code restricts its use to the observation flow described above. Chrome may display its normal debugging banner.
