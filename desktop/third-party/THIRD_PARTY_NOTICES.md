# Third-Party Notices

This desktop application is a packaging shell around **DeepSeek Harness**
(`@deepseek-ai/dsh`), Copyright (c) 2026 DeepSeek, licensed under the MIT
License (see `UPSTREAM_LICENSE.txt` in this directory). The harness is bundled
unchanged from its published npm package.

The upstream project's full third-party dependency attribution is available at:

  https://github.com/deepseek-ai/deepseek-harness/blob/main/THIRD_PARTY_NOTICES.md

and is reproduced in the source tree under `deepseek-harness-master/THIRD_PARTY_NOTICES.md`.

## Bundled components

| Component                | License | Purpose                                   |
| ------------------------ | ------- | ----------------------------------------- |
| @deepseek-ai/dsh         | MIT     | Harness CLI and Web UI (unchanged)        |
| Node.js (win-x64)        | MIT     | Bundled JavaScript runtime                |
| Electron                 | MIT     | Desktop shell                             |
| electron-builder / NSIS  | MIT / zlib | Installer tooling (build-time only)   |
| electron-updater         | MIT     | Auto-update client                        |

Every npm dependency inside `resources/harness/node_modules` carries its own
license file at the package level.
