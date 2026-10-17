# 豆图 Windows 桌面版

## 分享和使用

将 **豆图-v1.3.1-Windows.exe** 发给朋友即可。对方把文件保存到 Windows x64 电脑上，双击打开豆图独立窗口，无需安装 Node.js、npm 或开发依赖，也无需手动解压。当前构建面向 Windows 10 / 11 x64。

程序内含浏览器引擎、快速和精细两种 U²-Net 模型与全部前端资源，可以断网使用。打开时先显示启动提示，再把文件直接展开到本次启动独立的系统临时目录并打开工作台，省去了旧版的中间解压和整包复制。关闭窗口会结束本机应用服务并清理本次临时文件。再次双击已经打开的程序会回到原窗口，独立的临时目录避免干扰正在运行的抠图资源。第一次加载模型仍需要稍候。

上传、识别主体、修整、转换、编辑、用量统计与导出流程和 v1.3 网页版相同。导出时弹出 Windows 保存对话框，可自行选择文件夹和文件名。继续制作前请使用「保存项目」导出 `.bead.json`，下次通过「加载项目」恢复；当前图纸不会在关闭时自动保存。项目 JSON 不包含原照片和抠图蒙版，需要复用主体照片时请另外下载透明 PNG。

把 EXE 放在 U 盘或其他文件夹不会影响运行；应用配置与浏览器缓存放在当前用户的 `%APPDATA%\BeadStudio`，不要求写入程序所在目录。EXE 本身不是图纸文件，分享具体作品可使用项目 JSON 或单文件 HTML 图纸。

该构建尚未做数字签名，Windows 可能显示未知发布者或来源提示。发布包不是安装程序，不申请管理员权限；它会在运行时自动展开所需文件。

## 源码构建

需要 Windows x64、Node.js 22.12+ 和项目依赖：

```sh
pnpm install
pnpm models:download
pnpm test
pnpm test:desktop
pnpm package:desktop
```

也可使用 npm 安装依赖及运行同名脚本。Electron 44.8.0 和 electron-builder 26.15.3 已固定版本；首次准备环境时需要下载 Electron、NSIS 和模型，最终交付的 EXE 不需要这些开发工具。

`pnpm desktop:dev` 使用现有 `dist/` 打开桌面窗口，修改前端后需先 `pnpm build`。完整打包脚本 `scripts/package-desktop.mjs` 默认自行执行前端构建；`--verify-only` 只校验已有资源，`--skip-build` 在资源已通过校验时省略前端构建。

构建输出位于 `artifacts/desktop-release/`，最终单文件程序自动复制到桌面。`PACKAGE-MANIFEST.json` 与 `SHA256SUMS.txt` 记录版本、模型、Electron 和最终文件的 SHA-256，供构建校验使用；朋友运行时只需要 EXE。已经发布的 v1.2 / v1.3 ZIP 不会被覆盖。

启动打包使用 `portable.useZip: true` 走 NSIS 直接逐文件展开，优先缩短启动耗时，文件会比原来的 7z 压缩方式稍大。固定的 electron-builder 26.15.3 实现中，`unpackDirName: true` 才会省略固定的 `UNPACK_DIR_NAME` 并使用独立的 `$PLUGINSDIR/app`；打包脚本检查实际传入 NSIS 的参数，防止升级打包器或误改配置后再次共享运行目录。

## 运行结构和许可

桌面窗口不向网页暴露 Node.js 或文件系统 API。静态资源只在随机本机回环端口提供，窗口禁止加载远程页面，用户点击的 HTTPS 来源链接交给系统浏览器打开。PNG、PDF、CSV、HTML 和 JSON 仍由同一份图纸格子数据生成，桌面宿主通过 Chromium 下载事件调用原生保存对话框。

前端生产资源与模型只打包一份，不包含开发依赖、完整开发工程、测试截图、部署配置或个人图纸；内部仍包含运行所需的桌面宿主脚本。Electron 与 Chromium 许可证、前端第三方软件声明、模型来源与许可证均包含在 EXE 内部运行资源中；源码中的模型说明见 `public/models/README.md`。
