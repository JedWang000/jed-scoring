# JED Scoring

<img src="src/assets/icons/jed-128.png" alt="JED Scoring" width="80" height="80">

**直接在 Suno 中为视频配乐 · Score Your Video with Suno**

简体中文 | [English](README.md)

[下载 v0.2.1](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1) · [安装与使用](docs/usage.md) · [反馈问题](https://github.com/JedWang000/jed-scoring/issues) · [MIT 许可证](LICENSE)

JED Scoring 是本地优先的 Chrome / Edge 扩展：在浏览器侧边栏或画中画中预览本地视频，让视频跟随 Suno Studio 的播放时间，边看画面边创作配乐。

**已在 Suno Studio 2 实测可用。** 维护者于 2026 年 10 月 3 日反馈实际使用正常。这是一次人工兼容性确认，不代表覆盖所有工程或保证未来 Suno 版本始终兼容。详情见[兼容性说明](docs/compatibility.md)。

## 主要功能

- 跟随 Suno Studio 播放、暂停与定位，支持 Offset 偏移微调和漂移校正。
- 根据视频时长生成静音 WAV，通过显式确认的时间轴参考音频块完成对齐。
- 原始视频和原始音频留在本机；由你决定是否将生成的静音 WAV 拖入或上传到 Suno。
- 固定视频预览区、画中画、原声静音开关。
- 扩展内支持简体中文、繁體中文和 English，并记住语言选择。
- 当参考音频块或 Studio 状态无法可靠验证时暂停同步，提示重新确认。

## 安装

1. 从 [Releases](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1) 下载 **JED-Scoring-v0.2.1.zip**，解压到一个长期保留的目录。GitHub 自动生成的 **Source code** 压缩包是源码，需要先构建。
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的解压目录。
4. 打开或刷新 [Suno Studio](https://suno.com/studio)，再打开 JED Scoring 侧边栏。

当前通过解压包分发，尚未上架 Chrome 应用商店。Chrome 是主要测试浏览器；Edge 是兼容目标，仍需独立验证。

## 开始配乐

1. 打开 Studio 工程，在扩展中点击**连接 Studio**。
2. 选择浏览器可解码的本地 MP4、WebM 或 MOV 视频。
3. 将生成的静音 WAV 拖入 Studio 音轨。如果直接拖动无效，点击**下载静音 WAV**，再从浏览器下载气泡中拖入。
4. 在扩展中选中对应的时间轴音频块，点击**确认参考音频块**。若未出现候选块，先保存 Studio 工程，再刷新页面或点击**重新加载 Studio 并读取工程**。
5. 点击**开始同步**，随后在 Suno Studio 内播放、暂停和定位；需要时调整 **Offset** 或点击**重新同步**。

视频原声**默认开启**，只想听 Studio 配乐时请将本地视频静音。更新步骤与常见问题见[中英双语使用指南](docs/usage.md)。

## 隐私与权限

扩展不会上传原始视频或音频，不收集遥测，也不读取 Cookie、访问令牌或认证请求头。本地仅保存元数据、参考映射和偏好，不持久化视频内容或绝对路径。

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存扩展偏好和元数据。 |
| `sidePanel` | 展示视频及同步控制。 |
| `debugger` | 在你连接 Studio 后观察允许范围内的工程与播放状态；Chrome 可能显示调试提示条。 |
| `tabs` | 连接前确认选中的 Studio 标签页。 |
| `https://suno.com/*` | 仅在此主机运行 Studio 页面适配器。 |

完整说明：[中文隐私说明](docs/privacy.zh-CN.md) / [English privacy policy](docs/privacy.md)。

## 从源码构建与测试

使用 **Node.js 24**、npm 和 Google Chrome。依赖版本由 lockfile 固定。

```sh
git clone https://github.com/JedWang000/jed-scoring.git
cd jed-scoring
npm ci
npm run build
```

随后加载 `dist/` 目录。Windows PowerShell 如果限制脚本执行，可使用 `npm.cmd` / `npx.cmd`。

```sh
npx playwright install chromium
npm run verify:package
```

完整检查涵盖 TypeScript、单元测试、源码 E2E、构建产物 E2E 及包完整性。浏览器测试使用仓库内嵌的小型合成视频，不需要私人素材或 Suno 账号。系统 Chrome 测试界面，Playwright Chromium 测试真实解压扩展在严格 CSP 页面上的运行。见[贡献指南](CONTRIBUTING.md)。

## 目录结构

```text
src/background/   Studio 连接与 Chrome DevTools Protocol 观察
src/content/      页面适配器、状态验证与 MAIN-world 桥接
src/media/        本地视频元数据与静音 WAV 生成
src/sync/         同步状态机与视频控制
src/ui/           侧边栏、组件及三种界面语言
src/store/        本地工程元数据与参考映射
build/            清单、本地化与独立观察器构建插件
scripts/          测试运行器与包完整性检查
tests/            单元、源码 E2E 与扩展安装包测试
docs/             使用、兼容性、架构及隐私说明
```

## 已知限制

- Suno Studio 是主时钟；本工具提供浏览器级预览同步，不承诺采样级或硬件级精确同步，也不合成导出成片。
- 一次只处理一个本地视频和一个已确认的参考音频块。参考块需使用受支持的时间映射、1× 速度，且关闭 Warp、反向及片段循环。
- 可播放格式取决于浏览器编解码器；超长视频可能触发内存或 WAV 大小限制。
- Suno 页面或工程格式更新、后台标签页节流、DevTools 占用调试连接等情况可能影响同步；状态不明确时会暂停。
- 重新打开侧边栏后，可能需要重新选择本地视频授权。

## 开发者与定制

开发者：**达子 Jed_Wang** · [哔哩哔哩](https://b23.tv/iNOah8D)。

扩展底部的两个开发者链接默认指向上述地址。构建时可用 `VITE_JED_CONTACT_URL`、`VITE_JED_HOMEPAGE_URL` 分别覆盖；未设置的项保留默认值，非 HTTPS 或无效地址会显示为不可点击文字。这些值会公开写入安装包，不要放入密钥。

## 贡献与许可

欢迎提交中文或英文 Issue / Pull Request。请阅读[贡献指南](CONTRIBUTING.md)、[安全政策](SECURITY.md)和[更新记录](CHANGELOG.md)。

项目采用 [MIT 许可证](LICENSE)，第三方依赖保留各自许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目是独立社区工具，与 Suno 官方无隶属或背书关系；Suno 名称及商标归相应权利人所有。
