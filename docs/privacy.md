# Privacy and permission model

[中文](privacy.zh-CN.md)

## Data that stays local

- Selected video bytes and blob URLs.
- File name while the side panel is open.
- A 24-hex-character prefix of SHA-256 over at most the first 64 KiB, plus file
  size and media type, for local reauthorization checks.
- Video duration, dimensions, optional frame-rate/audio metadata, reference
  binding values, Offset, and preferences.
- A maximum of 500 in-memory diagnostic events.
- The in-memory generated silent WAV before the user drags or downloads it.
- Local video playback state, including mute and Picture-in-Picture display
  state; these values are not sent to Suno.

IndexedDB never stores an absolute path or video bytes. Blob URLs are revoked
when metadata reads or previews finish.

## Data read from Suno

The background service worker attaches Chrome DevTools Protocol only to the
active `https://suno.com/studio` tab after the user connects it. A semantic
main-world probe reads the visible transport control cluster and reports only
project time, play/pause, scrub state, a monotonic sequence, and a fixed
strategy identifier. It does not use CSS module class names or SVG path data.

The CDP Network collector reads response/request bodies only for exact
allowlisted Studio project, revision, version, and save endpoints. It validates
size, status, encoding, and schema, immediately projects the value to timing,
loop, and safe audio-block fields, and releases the raw body. Diagnostics never
contain raw bodies, URLs, project identifiers, media URLs, lyrics, or prompts.

At `document_start`, Chrome directly runs a build-generated, self-contained
observer in `world: MAIN`. It does not use a DOM script element, dynamic import,
or extension API in that world. The observer wraps the page's existing Fetch
function and only reacts to exact Suno/Studio API origin, path, and method
allowlists. It clones successful GET responses or reads the page's existing
string `save-project` body, validates a bounded project schema, and exports only
timing, loop, and safe audio-block projection fields through a versioned
same-origin message. It does not issue a network request, alter a request, or
read request headers.

The extension does not inspect Suno cookies, Suno local/session storage,
profiles, passwords, access tokens, API keys, authorization headers, or account
data. Its own IndexedDB contains only the local project metadata described
above.

## Network and upload behavior

The extension does not collect telemetry. Developer links open external sites
only when the user clicks them.

The extension never uploads the selected video or its original audio. After
metadata is read locally, it creates an equal-duration 44.1 kHz mono 16-bit PCM
WAV whose sample data is entirely zero. The generated WAV exists only in
memory until the user performs a real drag gesture or clicks the download
fallback.

Dragging the generated silent WAV to Suno or downloading it is an explicit
user action. The drag payload contains only the generated WAV File; it never
contains the original File, video bytes, original audio, an absolute path, or
account credentials. The extension does not call a Suno upload API.

The generated WAV filename is derived from the local video's name. Rename the
downloaded WAV before importing it if you do not want to share that name.

When direct cross-surface drag is ignored, **下载静音 WAV** and a drag from
Chrome's download bubble is the supported fallback. No `downloads` permission
or folder traversal is required.

## Diagnostics export

The allowlisted JSON format contains only adapter health, numeric project/video
times and drift, binding state, selector strategy version, and error codes. It
excludes file name, file fingerprint, video content, browser storage, and all
authentication data.

## Manifest permissions

- `storage`: local project/preferences persistence.
- `sidePanel`: extension UI.
- `debugger`: attach a CDP session to the selected active Studio tab for
  allowlisted project-state and transport observation.
- `tabs`: verify that the active tab is an exact Suno Studio page before CDP
  attachment.
- `https://suno.com/*`: content script access on the exact Suno HTTPS host.

No `scripting`, `webRequest`, cookies, broad browsing-history, downloads,
microphone, camera, or arbitrary-host permission is requested.
