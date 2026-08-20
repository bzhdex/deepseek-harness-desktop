# DeepSeek Harness Desktop — Windows 桌面封装

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/dsh`）的 Web UI 完整封装为 **Windows 桌面安装版应用**（Electron 壳 + 内置 Node.js 运行时 + 内置 harness 闭包，用户无需预装 Node/pnpm）。

## 目录结构

```
deepseek-harness-desktop/
├── deepseek-harness-master/   # 上游开源源码（MIT，仅作参考与许可依据，未改动）
├── deepseek-harness-master.zip# 上游源码压缩包
└── desktop/                   # ★ 桌面壳工程（本封装的核心代码）
    ├── README.zh.md           # 完整中文说明（开发/构建/打包/验证/安全/许可）
    ├── src/                   # Electron 主进程 + preload + 本地页面
    ├── resources/             # 运行时资源（Node 运行时、harness 闭包、launcher、图标）
    ├── scripts/               # 图标生成 / Node 下载 / harness 捆绑 / 一键构建
    ├── build/                 # electron-builder 构建资源（应用图标）
    ├── third-party/           # 上游 MIT 许可与第三方声明（随安装包分发）
    └── electron-builder.yml   # NSIS 安装包配置（中英双语向导、快捷方式、卸载）
```

## 快速开始

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\build.ps1
# 产物：desktop/dist/DeepSeek Harness-Setup-<version>.exe
```

完整说明见 [`desktop/README.zh.md`](desktop/README.zh.md)。

## 许可

- 桌面壳代码：MIT（见 `desktop/LICENSE`）。
- 上游 DeepSeek Harness：MIT（见 `desktop/third-party/UPSTREAM_LICENSE.txt` 与 `deepseek-harness-master/LICENSE`）。
