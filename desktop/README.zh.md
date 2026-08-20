# DeepSeek Harness Desktop（Windows 桌面封装）

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的 **Web UI 完整封装**为 Windows 桌面安装版应用。这是一个**纯壳层封装**：不改动 harness 任何核心逻辑，所有功能（四种预设模式、多 Provider 接入、插件系统、MCP client、子 Agent 委托、会话日志/恢复/回放/分叉、设置项、AGENTS.md/CLAUDE.md 读取、沙箱等）与网页端逐项一致。

- 上游：<https://github.com/deepseek-ai/deepseek-harness>（MIT）
- 技术参考（仅借鉴思路，未照搬）：<https://github.com/sdkwork-ai/deepseek-harness-desktop>

---

## 1. 架构与技术取舍

采用 **Electron + Node.js sidecar** 方案：

```
┌─────────────────────────────────────────────────────────┐
│ Electron 主进程（desktop shell，本仓库代码）               │
│  · 单实例锁 / 用户数据目录 / 托盘 / 自动更新               │
│  · 进程生命周期管理（拉起、看护、清理子进程树）             │
├─────────────────────────────────────────────────────────┤
│ 子进程：捆绑的 node.exe + watchdog launcher                │
│   └─ spawn `dsh web --no-open --host 127.0.0.1 --port N` │
│        （@deepseek-ai/dsh 原样运行，DSH_HOME 指向 APPDATA）│
├─────────────────────────────────────────────────────────┤
│ BrowserWindow 加载 http://127.0.0.1:<port>               │
│  （内置 Chromium 渲染，交互与网页端完全一致）               │
└─────────────────────────────────────────────────────────┘
```

**为什么选 Electron（而非 Tauri + WebView2）**

1. harness 本身就是 Node.js 服务，Electron 内置 Node 运行时，能直接把它作为子进程拉起，无需额外解决 Node sidecar；Tauri 需要单独携带 Node 运行时并维护 IPC，复杂度更高且收益有限。
2. 内置 Chromium 渲染本地 Web UI，与网页端渲染引擎一致，`dsh web` 依赖的 WebSocket/SSE/fetch 等能力零改动可用。
3. `electron-builder + NSIS` 生态成熟，开箱即得快捷方式、卸载器、自启、自动更新能力。

**关键取舍说明**

| 取舍 | 说明 |
| --- | --- |
| 捆绑独立 Node.js（22+）而非用 Electron 内置 Node | harness 声明 `engines: node ^22.19.0 || >=24`，Electron 内置 Node 版本不受我们控制且可能不满足该范围。独立捆绑 Node 24 LTS，ABI 稳定（N-API），完全解耦，满足“用户无需预装 Node/pnpm”。 |
| 用发布版 `@deepseek-ai/dsh` npm 包而非源码构建 | 发布包已自带编译产物（CLI `lib/` + 前端 `dist/`），`npm install` 即得完整可运行闭包，避免在打包机上跑整个 monorepo 的 `pnpm install + build`（含 node-pty/koffi 等原生模块），更快、更可复现，也严格符合“壳层封装不改核心”。 |
| `resources/` 以 `extraResources` 解包（不进 asar） | 子进程需要用真实文件系统路径去 `require`/`resolve`，asar 虚拟文件系统无法被外部 node.exe 解析，故运行时资源一律解包。 |
| `dsh web --no-open` | 由 Electron 负责展示页面，禁止 harness 再拉起系统默认浏览器。 |
| 端口占用 | 启动前用本机探测挑选空闲端口（默认 3080，占用则顺延）；读到 `dsh web: http://127.0.0.1:<port>` 就绪行后再加载页面。 |
| 进程树清理 | 额外加一层 watchdog launcher：正常退出走 stdin `SHUTDOWN` 优雅停服 + `taskkill /T /F` 兜底；即便 Electron 被任务管理器强杀，watchdog 也会在 2 秒内回收整个子进程树，保证“无残留进程”。 |

---

## 2. 目录结构

```
desktop/
├── src/
│   ├── main/                  # Electron 主进程（纯 shell）
│   │   ├── index.js           # 入口：单实例、生命周期、退出清理
│   │   ├── dsh-process.js     # dsh 子进程树的启动/就绪解析/停止
│   │   ├── paths.js           # 资源路径 + DSH_HOME 持久化布局
│   │   ├── ports.js           # 空闲端口探测
│   │   ├── window.js          # 主窗口（splash/应用/错误页切换）
│   │   ├── tray.js            # 托盘（最小化到托盘、自启、退出）
│   │   ├── updater.js         # electron-updater 接入
│   │   └── log.js             # 文件日志
│   ├── preload/index.js       # 最小化、只读的 preload（contextIsolation 开启）
│   └── renderer/              # 本地 splash / 错误提示页
├── resources/
│   ├── runtime/               # 捆绑的 Node.js 22+（脚本下载，不入库）
│   ├── harness/               # 捆绑的 @deepseek-ai/dsh 闭包（脚本安装，不入库）
│   ├── launcher/harness-launcher.cjs  # 进程树 watchdog
│   └── icons/                 # 托盘图标
├── scripts/
│   ├── gen-icons.mjs          # 纯 Node 生成图标 PNG
│   ├── fetch-node.mjs         # 下载并解包 Node win-x64
│   ├── bundle-harness.mjs     # 安装 @deepseek-ai/dsh 闭包
│   └── build.mjs              # 一键编排（图标+运行时+harness+打包）
├── third-party/               # 上游 MIT 许可与第三方声明
├── build/                     # electron-builder 构建资源（icon.png）
├── electron-builder.yml       # NSIS 安装包配置
├── build.ps1                  # 一键构建入口
└── package.json
```

---

## 3. 开发、构建与打包

### 3.1 环境要求（仅构建机需要，最终用户不需要）

- Windows 10/11 x64
- Node.js ≥ 22（仅作为构建工具，最终安装包已内置 Node 运行时）
- 联网（首次需要下载 Node 运行时、harness npm 闭包与 Electron 构建依赖）

### 3.2 本地开发运行（不打包）

```powershell
cd desktop
npm install                    # 安装 electron / electron-builder / electron-updater / sharp
npm run bundle                 # 生成图标 + 下载 Node 运行时 + 安装 harness 闭包
npm start                      # electron . 启动壳（加载本地 dsh web）
```

开发态壳会从 `desktop/resources/` 解析运行时；打包态从 `<安装目录>\resources\` 解析。

### 3.3 一键打包安装程序

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

或手动等价步骤：

```powershell
cd desktop
npm install
npm run bundle                 # = bundle:icons + bundle:node + bundle:harness
npx electron-builder --win nsis
```

产物在 `desktop/dist/DeepSeek Harness-Setup-<version>.exe`。

可选：

```powershell
node scripts/build.mjs --dir   # 只出解包目录，便于快速冒烟验证
```

### 3.4 更换 harness 版本

`resources/harness` 里的闭包版本由脚本控制，升级无需改代码：

```powershell
$env:DSH_VERSION = '0.1.0-rc.7'   # 或其它已发布的版本号
node scripts/bundle-harness.mjs
```

---

## 4. 数据与配置持久化

| 内容 | 位置 |
| --- | --- |
| harness 全部用户数据（会话日志、设置、插件、预设、凭据 `.env`） | `%APPDATA%\DeepSeek Harness\`（即 `DSH_HOME`） |
| Electron 自身缓存 / LocalStorage / 更新缓存 | `%APPDATA%\DeepSeek Harness\desktop\` |
| 桌面壳日志 | `%APPDATA%\DeepSeek Harness\desktop\logs\` |

- 安装/升级**不会**触碰 `%APPDATA%\DeepSeek Harness`，会话与配置原样保留。
- 卸载默认**保留**用户数据（`deleteAppDataOnUninstall: false`）；如需彻底删除，卸载后手动删除 `%APPDATA%\DeepSeek Harness`。
- 高级用户可用环境变量 `DSH_DESKTOP_HOME` 覆盖桌面版的数据目录（重启生效）。桌面版**不**读取命令行版的 `DSH_HOME`，避免两者互相干扰。

---

## 5. 桌面体验

- **托盘**：关闭窗口 = 最小化到托盘（不退进程）；托盘菜单提供「显示窗口 / 在浏览器中打开 / 开机自启 / 检查更新 / 退出」；双击托盘图标恢复窗口。
- **窗口**：可自由缩放（最小 960×640），记住尺寸由系统窗口管理。
- **错误提示**：本地服务无法启动或中途崩溃时，窗口切换到本地错误页，提供「重试」与「退出」。
- **端口占用**：默认 3080，被占用时自动顺延到空闲端口，无需用户干预。

---

## 6. 自动更新方案

`electron-updater` 已接入（`src/main/updater.js`），默认**关闭**（未配置发布源时静默跳过，不影响离线使用）。

启用步骤（任选其一）：

1. **GitHub Releases**：在 `electron-builder.yml` 的 `publish` 块填写 `owner`/`repo`，并配置 `GH_TOKEN`（或公开仓库无 token）。构建后用 `electron-builder --publish always` 上传，`electron-updater` 会读取 `latest.yml` 增量更新。
2. **私有 HTTP 镜像**：使用 `provider: generic`，把构建产物（`.exe` + `latest.yml` + `blockmap`）放到任意静态服务器，指向其 `url`。

> 注意：Windows 上的自动更新建议配合**代码签名**（`electron-builder.yml` 的 `win.certificateFile` 等），否则 SmartScreen 与部分杀毒软件会拦截更新器/安装包。未签名的本地安装包不影响功能，但首次启动可能有 SmartScreen 提示。

---

## 7. 安全说明

- **不削弱原沙箱能力**：harness 的沙箱（`sandbox-windows-acl` 等）原样运行，壳层只负责进程与窗口，不介入任务执行、工具调用或权限判定。Electron 渲染层启用 `contextIsolation` + `sandbox`，对 harness 页面**不注入任何特权 API**，仅本地 splash/错误页暴露只读的 `restart/quit` 最小接口。
- **防火墙**：`dsh web` 只监听 `127.0.0.1`（回环地址），不对局域网/公网开放。首次启动时 Windows 防火墙可能提示，选择“允许”或“专用网络”即可；**无需**为 3080 端口做公网转发。若你手动把 harness 配成 `0.0.0.0`，请自行评估暴露风险（上游有意禁用了 `--host 0.0.0.0` 以防范 RCE）。
- **杀毒软件**：本地端口监听 + 随附的 `node.exe` 可能触发部分杀软启发式告警，属常见误报。可在部署前对安装包做签名、或将其加入白名单。捆绑的 Node.js 与 harness 均为官方发布物，来源为 nodejs.org 与 registry.npmjs.org。

---

## 8. 许可证合规

- 本仓库（壳层代码）以 **MIT** 许可发布，见 `LICENSE`。
- 上游 DeepSeek Harness 为 MIT，版权声明保留于 `third-party/UPSTREAM_LICENSE.txt`；其第三方依赖声明见 `third-party/THIRD_PARTY_NOTICES.md` 与上游 `THIRD_PARTY_NOTICES.md`。
- 分发安装包时，`third-party/` 目录随 `extraResources` 一并写入安装目录，满足 MIT 的版权/许可保留要求。
- **应用图标**：为避免商标歧义，使用**原创标识**（非 DeepSeek 鲸鱼）——圆角方底上的「H + 连接节点」几何图形（H 代表 Harness，节点呼应插件/连接架构），由 `scripts/gen-icons.mjs` 生成。上游 `BRAND_GUIDELINES.md` 建议避免以可能造成官方背书误解的方式使用品牌素材；本项目为社区封装，请勿将其表述为 DeepSeek 官方出品。

---

## 9. 验收验证步骤

在**干净、未安装 Node.js** 的 Windows 10/11 x64 机器上：

1. **安装**：双击 `DeepSeek Harness-Setup-<version>.exe`，选择安装目录，完成安装（桌面 + 开始菜单出现快捷方式）。
2. **启动**：双击快捷方式，窗口先显示启动页，随后加载 harness 界面；确认无需系统 Node/pnpm 即可离线启动。
3. **配置**：进入设置，接入至少一个 Provider（Anthropic / OpenAI / Gemini / DeepSeek / Azure / 自定义 OpenAI 兼容网关），确认四种预设模式（Standard / Minimal / Code/PTC / Creator）可选。
4. **跑通一个任务**：新建会话，执行一个简单任务（例如“列出当前目录并读 README”），确认工具调用、会话日志写入、恢复/回放/分叉可用。
5. **重启**：重启电脑后再次启动，会话与配置仍在（`%APPDATA%\DeepSeek Harness`）。
6. **关闭无残留**：托盘「退出」后，任务管理器确认无 `node.exe`/`DeepSeek Harness` 残留进程（watchdog 已回收子进程树）。
7. **升级**：用更高版本安装包覆盖安装，确认会话与配置不丢失。

---

## 10. 常见问题

- **窗口一直停在启动页**：看 `%APPDATA%\DeepSeek Harness\desktop\logs` 最新日志；常见原因是 3080 被占用（会自动换端口）或首次加载较慢（90 秒超时）。
- **提示“无法连接”**：点击「重试」；若反复失败，检查杀软是否拦截了本地 `node.exe` 监听 127.0.0.1。
- **如何彻底卸载**：卸载程序默认保留数据；需要一并删除则手动删除 `%APPDATA%\DeepSeek Harness`。

---

## 11. 跟随上游更新

harness 上游发布新版本后，只需：

```powershell
node scripts/bundle-harness.mjs <新版本号>
```

然后重新打包即可。壳层代码与 harness 完全分层，harness 的启动参数（`--no-open --host 127.0.0.1 --port N`）保持稳定；若上游调整了就绪输出格式，只需更新 `src/main/dsh-process.js` 中的 `READY_RE` 正则。
