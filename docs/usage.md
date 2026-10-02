# Installation and usage / 安装与使用

## English

### Install or update

Download **JED-Scoring-v0.2.1.zip** from the [release page](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1). Extract it into a folder you will keep. At `chrome://extensions` or `edge://extensions`, enable Developer mode, choose Load unpacked, and select the folder containing `manifest.json`. Do not select the ZIP or a source-code folder that has not been built.

To update, save your Studio work, replace the extension files (or select the new folder), click Reload on the extension card, and refresh Studio. Select the video, reconnect, confirm the reference clip, and set Offset again after the panel reloads. Browser-managed extension data is separate from the extracted folder; selecting a different folder may create a different extension identity. Keep a stable folder when updating.

### Prepare and synchronize

1. Open a project at [Suno Studio](https://suno.com/studio). You need your own access to Studio.
2. Open the extension side panel and select your preferred language in the header.
3. Click **Connect Studio** while the Studio tab is active.
4. Choose a local video. MP4/H.264 and WebM are useful starting points; MOV and other codec combinations depend on browser decoding.
5. Drag the generated silent WAV card into a Studio track. If the browser ignores this, click **Download silent WAV** and drag the downloaded file into Studio.
6. Wait for Studio to load the clip. Select its matching timeline entry in the extension and click **Confirm reference audio clip**.
7. Click **Start sync**. Use Studio's transport for playback and seeking. The extension follows; it does not drive the Studio transport.
8. Use Offset and Resync to adjust alignment. The reference must remain at 1× with supported timing and without Warp, reverse, or clip looping.

The silent WAV contains zero-valued audio samples and matches the video's duration. It supplies a timeline reference, not the video's original soundtrack. The generated filename is derived from the local video's name; rename the downloaded WAV before importing if you do not want to share that name.

Video audio starts enabled. Use Mute local video to hear only Studio. Pop out video opens the same player in Picture-in-Picture; returning it preserves playback state.

### Troubleshooting

| Symptom | What to do |
| --- | --- |
| Cannot connect | Activate the Studio project tab, then reconnect. |
| Debugger connection busy | Close DevTools or another tool attached to that tab, then retry. |
| No reference candidates | Save Studio work, refresh or use Reload Studio and read project, and check that the clip is a supported top-level timeline audio clip. Library cards are not timeline clips. |
| Sync pauses after a clip edit | Read the warning, restore supported clip settings, and explicitly bind again. |
| Video/audio will not start | Click Allow video audio and continue. Browser autoplay may require a gesture. |
| Video cannot be decoded | Try an MP4/H.264 or WebM export supported by your browser. |
| Reopening resets the panel | Select the video, confirm the reference clip, and set Offset again. Only the language preference persists. |
| Drift or upstream UI change | Try Resync/Offset, keep Studio active, and report a redacted diagnostics summary if it persists. |
| Long-video WAV generation fails | Use a shorter video or free browser memory. The WAV is generated in memory. |

The extension does not export a finished video with music. Perform final media assembly in your video editor.

## 中文

### 安装或更新

从[发布页面](https://github.com/JedWang000/jed-scoring/releases/tag/v0.2.1)下载 **JED-Scoring-v0.2.1.zip**，解压到长期保留的目录。在 `chrome://extensions` 或 `edge://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，选中包含 `manifest.json` 的文件夹。不要选择 ZIP 或尚未构建的源码目录。

更新前保存 Studio 工程，替换扩展文件（或选择新目录），点击扩展卡片上的“重新加载”，再刷新 Studio。侧边栏重载后重新选择视频、连接 Studio、确认参考块并设置 Offset。浏览器扩展数据与解压目录分别管理；换目录可能产生不同扩展标识，建议更新时保持目录稳定。

### 准备与同步

1. 打开 [Suno Studio](https://suno.com/studio) 工程；你需要自行拥有 Studio 使用权限。
2. 打开扩展侧边栏，在顶部选择语言。
3. 保持 Studio 标签页激活，点击**连接 Studio**。
4. 选择本地视频。可优先尝试 MP4/H.264 或 WebM；MOV 及其他编码组合取决于浏览器解码支持。
5. 把生成的静音 WAV 卡片拖入 Studio 音轨。如果拖动无效，点击**下载静音 WAV**，再把下载文件拖入。
6. 等待 Studio 加载，在扩展中选择对应时间轴音频块并点击**确认参考音频块**。
7. 点击**开始同步**，使用 Studio 的播放与定位控制；扩展跟随 Studio，不反向控制其播放。
8. 需要时用 Offset 和重新同步微调。参考音频块必须保持 1×、受支持的时间映射，并关闭 Warp、反向及片段循环。

静音 WAV 的采样值全部为零，时长与视频一致，只用于时间轴参考，不包含视频原声。文件名由原视频名称生成；如果不想向 Suno 暴露名称，可在下载后改名再导入。

本地视频原声默认开启；只想听 Studio 时点击静音。画中画使用同一个播放器，收回时保留播放状态。

### 常见问题

| 情况 | 处理方法 |
| --- | --- |
| 无法连接 | 激活 Studio 工程标签页后重新连接。 |
| 调试连接被占用 | 关闭附着于该标签页的 DevTools 或其他调试工具后重试。 |
| 没有参考候选 | 保存工程后刷新或重新读取；确认已添加受支持的顶层时间轴音频块，素材库卡片不属于时间轴片段。 |
| 修改音频块后暂停 | 按警告恢复支持的设置，并重新显式绑定。 |
| 视频或原声无法开始 | 点击允许视频音频并继续，满足浏览器自动播放手势要求。 |
| 无法解码视频 | 尝试浏览器支持的 MP4/H.264 或 WebM。 |
| 重开后面板重置 | 重新选择视频、确认参考块并设置 Offset；仅持久化语言偏好。 |
| 漂移或上游界面变化 | 尝试重新同步、Offset，保持 Studio 激活；持续异常时反馈脱敏诊断摘要。 |
| 长视频静音 WAV 生成失败 | 使用较短视频或释放浏览器内存；WAV 在内存中生成。 |

本工具不导出已配乐成片，请在视频编辑软件中完成最终合成。
