# 豆图 · 图片转拼豆图纸

完整的 React + TypeScript + Canvas 工作台。图片在浏览器本机处理，应用不需要登录、数据库、接口密钥或付费服务。

## 运行

Windows 可以直接双击 **启动工具.cmd**。当前工作目录已经安装依赖，会自动打开 `http://127.0.0.1:5173`，关闭终端或按 Ctrl+C 停止。

在其他环境需要 Node.js 22.12+，执行：

```sh
npm install
npm run dev
```

也可以使用 pnpm：`pnpm install`、`pnpm dev`。Vite 固定使用 5173 端口，已运行一个实例时请直接访问它，或先停止该实例。

```sh
npm run build   # TypeScript 检查 + 生产构建，输出 dist/
npm run preview
npm test        # 7 个核心行为测试
```

`dist/` 可以部署到任意静态服务器。请通过 HTTP 打开，不要直接双击 dist/index.html；图片转换使用浏览器 Worker，直接打开本地 HTML 文件不支持。

## 已实现

- PNG/JPG/WebP 拖拽与文件上传；拖动选区裁剪、百分比微调；原图对比。
- 32/48/64 格预设、自定义 1–200 行列、按原图/裁剪比例适配，最多 40,000 格。
- 根据 OKLab 感知色差匹配真实色板；加权选色限制 8/16/24/32 色；可选 Floyd–Steinberg 抖动，默认关闭。
- 透明采样像素的 alpha 小于 128 时视为空白；也可选择任意背景色，先进行透明合成再匹配色板。
- 画笔、橡皮擦、吸管、移动、滚轮和按钮缩放；快速拖绘连续补点；最多 50 步撤销重做。
- 网格/色号/坐标独立显示；每 10 格粗线，坐标标注 1、5、10…及边缘格子；点击色号选择画笔并高亮，再次点击取消高亮。
- 实时用量、总颗数、实际用色、尺寸和空白格；空白不计入用量。
- JSON 色板导入/导出；项目 JSON 保存/加载。项目包含完整色板、尺寸、格子和编辑结果；不包含原始图片与视图缩放。
- 纯图案 PNG：每格 12 px，空白格保留透明；制作 PNG：每格 24 px，完整网格、色号、坐标、用量。
- A4 PDF：可选 3/5/7 mm 每格，先打印用量清单，再分页图纸，附全局坐标、拼接行列、上下左右位置、页码和 60 mm 校准线。请选择「实际大小 / 100%」打印。
- 简体中文桌面三栏布局；移动端通过顶部标签折叠面板；所有转换和导出独立于预览缩放。

调整参数后点击「生成拼豆图纸」应用；生成会替换当前格子，原编辑可撤销恢复。加载只含格子数据的项目后，继续编辑/导出不需要原图；重新转换需要重新上传图片。

## 色板与来源

内置 **Mard · 221 色对照**，采集于 2026-10-07，来自用户提供的 [Pindou Online 色号页](https://www.pindou.online/colors)。这是第三方对照数据，不声称是品牌官方发布，实物可能存在显示或批次色差。221 个编号和 HEX 都直接取自页面，没有编造官方色号。

另有 **通用示例 · 32 色**，`S01`–`S32` 为工具自定义示例编号，与品牌官方编号无关。

色板 JSON 示例（也接受仅含颜色的数组）：

```json
{
  "name": "我的真实色板",
  "description": "来源说明",
  "colors": [
    { "code": "X01", "name": "白色", "hex": "#FFFFFF" },
    { "code": "X02", "name": "黑色", "hex": "#000000" }
  ]
}
```

每个编号必须唯一，最多 12 位字母、数字、下划线或短横线；HEX 必须为 `#RRGGBB`，色板最多 1000 色。导入后选中该色板，再点击生成应用到当前图片。绘制时可以加入转换阶段未使用的颜色，因此编辑后的实际色数可能超过生成上限。

`scripts/import-mard.mjs` 是开发者更新数据用的脚本，需要联网；普通使用无需联网。脚本校验 221 个唯一编号，页面结构或总数变化时停止写入，避免静默导入错误数据。

## 代码组织

```text
src/core/types.ts        图纸、色板、参数的类型和上限
src/core/sampling.ts     图片校验、裁剪采样、Worker 调度
src/core/color.ts        sRGB → OKLab、感知色差、文字颜色
src/core/quantize.ts     有限色板匹配、限色与抖动
src/workers/             转换后台线程，进度和错误返回
src/core/pattern.ts      尺寸校验、统计、替色、项目格式
src/core/render.ts       共享图纸渲染，从格子数据读取
src/core/export.ts       PNG 和分页 PDF，从格子重新生成
src/hooks/useHistory.ts  原子编辑历史
src/components/         画布手势、裁剪和弹窗
src/data/mard.json       可复核的第三方色板快照
```

`Pattern.cells` 是唯一图纸数据来源。颜色编号或 `null` 表示每一个格子；统计、预览、编辑和导出都消费这份数据。导出不依赖屏幕截图。PDF 使用绘制后的独立页面图像嵌入，确保中文在没有特定 PDF 字体的设备上显示一致；物理尺寸由 PDF 毫米坐标确定。

## 验收与边界

核心测试覆盖透明格、真实色板限制、抖动、尺寸、替色统计、项目往返和无效色板。详细浏览器验收记录见 **VERIFICATION.md**。

图片限制 25 MB / 4000 万像素；项目 JSON 限制 15 MB。过大尺寸提供错误提示。导出制作 PNG 超过 4000 万输出像素时提示使用分页 PDF。处理期间禁用会改动图纸的操作，显示进度。

已验证桌面、小窗口和手机尺寸的布局及浏览器交互。真实手机硬件、打印机纸张和色差仍需在实物上校准；PDF 附 60 mm 校准线。

## 示例图片

`public/sample-cat.png` 由内置 **imagegen** 生成，透明 PNG。使用的提示词是：

> Centered coarse pixel-art orange tabby in a pale mint teacup, one yellow flower beside its ear, limited flat palette, dark navy outline, transparent background, 8% padding, no text/UI.

打开工具即自动转换该图片，所有示例操作使用实际图纸数据。
