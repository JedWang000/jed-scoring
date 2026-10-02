# Architecture / 架构

## English

JED Scoring is a TypeScript/React Manifest V3 extension. Vite and CRXJS produce the side panel, background service worker, content script, localized manifest messages, and a self-contained MAIN-world observer.

1. **Studio observation:** the user connects the active Studio tab. The background worker uses Chrome DevTools Protocol to observe allowlisted project traffic and semantic transport facts. A passive MAIN-world Fetch observer provides a second validated project-state path without initiating Suno requests.
2. **Validation and projection:** bounded payload validators retain only supported timing, loop, and audio-block facts. The bridge uses a versioned same-origin protocol; candidate discovery is separate from transport health.
3. **Local media:** File/blob URLs feed the video player and metadata reader. A generated all-zero PCM WAV provides a reference the user can put on Studio's timeline.
4. **Explicit binding:** the user selects and confirms a supported clip. The active panel keeps the file, metadata, binding, and Offset in React session state. Only the language preference persists. The repository also contains tested project-store and fingerprint helpers, which are not connected to the current production panel.
5. **Synchronization:** the state machine maps Studio time to local video time, applies Offset/drift correction, and pauses on invalid binding or unavailable transport. Studio remains the master clock.
6. **Presentation:** the React side panel has one video element, a Picture-in-Picture mode, muted/unmuted local playback, status/recovery actions, and Simplified Chinese, Traditional Chinese, and English catalogs.

See [privacy](privacy.md) for data boundaries and [CONTRIBUTING.md](../CONTRIBUTING.md) for verification commands. The public snapshot intentionally excludes private media, generated output, and internal development notes.

## 中文

JED Scoring 使用 TypeScript / React 和 Manifest V3。Vite 与 CRXJS 构建侧边栏、后台 service worker、内容脚本、本地化清单，以及独立 MAIN-world 观察器。

1. **观察 Studio：** 用户连接当前 Studio 标签页；后台通过 Chrome DevTools Protocol 观察允许范围的工程流量和语义播放状态。被动 Fetch 观察器提供第二条已验证工程状态路径，不主动发起 Suno 请求。
2. **验证与提取：** 有大小限制的校验器只保留支持的时间、循环和音频块信息。桥接使用带版本的同源协议；候选片段发现与播放控制健康状态分离。
3. **本地媒体：** 通过 File / blob URL 读取元数据并播放视频；全零 PCM WAV 供用户放入 Studio 时间轴作为参考。
4. **显式绑定：** 用户选择并确认支持的片段；当前界面的文件、元数据、绑定和 Offset 保留在 React 会话状态中，仅持久化语言偏好。仓库中的工程存储与指纹辅助模块已有测试，但尚未接入生产侧边栏。
5. **同步：** 状态机把 Studio 时间映射为本地视频时间，应用 Offset 和漂移校正；绑定失效或播放状态不可用时暂停。Studio 始终为主时钟。
6. **界面：** React 侧边栏只有一个视频元素，提供画中画、原声开关、状态与恢复操作，以及三种界面语言。

数据边界见[隐私说明](privacy.zh-CN.md)，验证命令见[贡献指南](../CONTRIBUTING.md)。公开快照不包含私人媒体、构建产物或内部开发记录。
