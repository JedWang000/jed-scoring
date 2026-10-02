# Contributing / 贡献指南

## English

Issues and pull requests in English or Chinese are welcome. For larger changes, open an issue describing the intended behavior before implementation.

### Setup and verification

1. Install Node.js 24, npm, and Google Chrome.
2. Run `npm ci` and `npx playwright install chromium`.
3. Run `npm run verify:package` before submitting a pull request.
4. Load `dist/` at `chrome://extensions` to test manually, then refresh Studio after every extension reload.

On Windows, use `npm.cmd` and `npx.cmd` if PowerShell blocks the scripts. Tests bind local ports 4174 and 4175; leave these free. The package runner also uses temporary local ports for build variants. Tests run without a Suno login or private media; a tiny synthetic WebM is embedded in the fixture helper. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally points to a compatible extension-capable Chromium when the bundled executable is unavailable.

| Command | Checks |
| --- | --- |
| `npx tsc --noEmit` | TypeScript types |
| `npm test` | Unit and contract tests |
| `npm run test:e2e` | Source UI in system Chrome |
| `npm run test:package` | Build, developer-link variants, packaged UI, unpacked extension |
| `npm run verify:dist` | Manifest, permissions, resources, and MAIN-world independence |
| `npm run verify:package` | All required checks above in sequence |

### Change guidelines

- Keep the local-media boundary intact. Discuss video uploads, credentials, telemetry, or broader permissions before adding them.
- Add meaningful regression tests for changed behavior. The delivery reporter deliberately rejects skipped core E2E tests.
- Keep `en.ts`, `zh-CN.ts`, and `zh-TW.ts` aligned, and update both READMEs for user-visible changes.
- Keep versions in `package.json`, `package-lock.json`, `src/manifest.ts`, and `src/ui/brand.ts` consistent for releases.
- Test real Suno separately for adapter changes; fixture tests cannot guarantee upstream compatibility.
- Never commit recordings, project payloads, browser profiles, secrets, generated builds, or private diagnostics.

For bugs, include extension version, browser/OS, visible Studio version, reproduction steps, expected/actual behavior, and a redacted diagnostics summary. See [SECURITY.md](SECURITY.md) for vulnerabilities.

## 中文

欢迎中文或英文 Issue 和 Pull Request。较大修改请先通过 Issue 说明目标行为。

1. 安装 Node.js 24、npm 和 Google Chrome。
2. 执行 `npm ci`、`npx playwright install chromium`。
3. 提交 PR 前执行 `npm run verify:package`。
4. 在 `chrome://extensions` 加载 `dist/` 人工验证，每次重载扩展后刷新 Studio。

Windows 可使用 `npm.cmd`、`npx.cmd`。测试需要空闲的本地 4174、4175 端口，构建变体还会使用临时端口。测试采用内嵌合成视频，不需要私人素材或 Suno 登录。内置 Chromium 不可用时，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向支持加载扩展的 Chromium。

上表列出了独立测试命令；`verify:package` 会依次完成类型检查、单元测试、源码及安装包 E2E、包完整性检查。

- 维护本地媒体隐私边界；新增上传、凭据、遥测或更大权限前需讨论设计。
- 行为修改应配有有效回归测试，不要跳过核心 E2E。
- 界面文案同步更新三种语言，用户可见变化同步更新两个 README。
- 发布时统一 package、lockfile、manifest 与品牌模块的版本号。
- 适配器修改应单独进行真实 Suno 验证；模拟测试无法保证上游部署兼容。
- 不提交录音录像、工程响应、浏览器配置、密钥、构建产物或私人诊断数据。

反馈时附上扩展版本、浏览器与系统、可见的 Studio 版本、复现步骤、预期与实际结果，以及脱敏诊断摘要。安全问题请按[安全政策](SECURITY.md)反馈。
