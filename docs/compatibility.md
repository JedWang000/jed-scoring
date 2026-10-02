# Compatibility / 兼容性

## English

**Report date: October 3, 2026.** The maintainer confirmed that the existing JED Scoring 0.2.1 project works in real use with **Suno Studio 2**. The report did not specify an exact Suno deployment identifier, browser build, or a complete per-feature test matrix.

Automated tests cover local fixtures, state validation, timing/synchronization, the three UI languages, packaged builds, and a real unpacked extension under restrictive CSP. They do not log into Suno and do not establish compatibility with every live project or future upstream release.

Chrome is the primary validation target. Edge exposes the intended extension APIs but has not been independently verified for this release. Firefox and Safari are not supported.

Adapters observe supported transport structures and allowlisted project data. Unsafe or ambiguous timing, changed clip identity, unsupported transformations, or unreadable transport pauses synchronization. A changed Suno UI or payload schema may require an adapter update.

For a compatibility report, include extension version, browser/OS, visible Studio version, reproduction steps, and a redacted diagnostics summary. Do not upload project responses, private media, credentials, or browser profiles.

## 中文

**反馈日期：2026 年 10 月 3 日。** 维护者确认现有 JED Scoring 0.2.1 项目已在 **Suno Studio 2** 实际使用正常。此次反馈未提供精确 Suno 部署标识、浏览器版本或逐项功能测试矩阵。

自动化测试覆盖本地模拟页面、状态验证、时间与同步逻辑、三种界面语言、构建产物，以及严格 CSP 下的真实解压扩展。测试不登录 Suno，不能证明所有真实工程或后续上游版本的兼容性。

Chrome 是主要验证目标。Edge 具备目标扩展 API，但本次发布未独立验证。暂不支持 Firefox 或 Safari。

适配器观察受支持的播放控制结构及允许范围内的工程数据。时间映射不明确、片段身份变化、不受支持的变换或无法读取播放状态时会暂停同步。Suno 界面或数据格式变化可能需要适配器更新。

兼容性反馈请提供扩展版本、浏览器与系统、可见的 Studio 版本、复现步骤及脱敏诊断摘要。不要上传工程原始响应、私人媒体、凭据或浏览器配置。
