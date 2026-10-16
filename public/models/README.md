# 本地抠图模型与来源

豆图 v1.3 使用 U²-Net 显著性主体分割模型。在本地启动的完整发行包中，模型文件与应用一起提供；推理在浏览器内执行，照片不会上传至模型服务。模型预测的是主体区域，复杂背景、毛发、透明物体及多个主体仍可能需要手工修整。

## 随包模型

| 文件 | 用途 | 字节数 | 校验信息 |
| --- | --- | ---: | --- |
| `u2netp.onnx` | 快速模式，较小的 U2NETP 网络 | 4,574,861 | 见 `manifest.json` |
| `u2net.onnx` | 精细模式，完整 U2NET 网络 | 175,997,641 | 见 `manifest.json` |

两种网络均为通用显著性分割模型。精细模式使用更大的网络，并不保证每张照片都比快速模式准确。它们均以 320 × 320 推理，再将遮罩映射到原图；“精细”不代表输入分辨率提高到 1024。最终原图尺寸保留，转换为拼豆格子时仍使用图纸的目标行列数。

## 许可证与署名

- 模型研究与实现：Xuebin Qin、Zichen Zhang、Chenyang Huang、Masood Dehghan、Osmar R. Zaiane、Martin Jagersand，**U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection**，Pattern Recognition 106 (2020), 107404。
- 官方模型项目：[xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net)。项目采用 Apache License 2.0，完整文本随包提供于 `U2NET-APACHE-2.0.txt`。
- 本发行包中的 ONNX 文件从 [Daniel Gatis 的 rembg 发行页](https://github.com/danielgatis/rembg/releases/tag/v0.0.0)下载，原样保留，没有重新训练、量化或改写网络。rembg 的代码采用 MIT License，完整文本随包提供于 `REMBG-MIT.txt`。
- 上游下载地址及上游提供的 MD5、实测 SHA-256 记录于 `manifest.json`。这些文件是带许可证的模型资产，不是用户图片。
- 许可证来源核对日期：2026-10-16。模型、ONNX 转换及后续修改应保留对应上游许可和署名。

## 模型输入与输出

U2NETP 与 U2NET 使用相同的预处理和后处理：

1. 将 RGB 图像缩放至 320 × 320（图像显示和实际抠图结果依然保持原图比例）；透明区域不能被当作新的可见主体。
2. 令 `maxRGB` 为缩放后所有 RGB 通道的最大值，按 `rgb / max(maxRGB, 1e-6)` 归一化。此处按 rembg 实现采用图像最大值，而不是固定除以 255。
3. RGB 通道分别减去 `[0.485, 0.456, 0.406]`，再除以 `[0.229, 0.224, 0.225]`。
4. 输入为 float32 NCHW `[1, 3, 320, 320]`。
5. 取第一个输出的第一个通道 `[1, 1, 320, 320]`，在输出全图上进行 `(value - min) / (max - min)`；实现必须保护几乎恒定输出，避免除零。
6. 将结果作为 0–1 的主体遮罩缩放回原图。保留原图透明度，手动遮罩修整、边缘调整和用户选择的背景合成在模型之外完成。

预处理依据：[rembg BaseSession.normalize](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/base.py)、[U2NETP 会话](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py)、[U2NET 会话](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2net.py)。精确的输入、输出名称以本目录 `manifest.json` 和会话元数据为准；不要依赖其他导出版本的名称。

## 重新获取

在项目目录运行 `node scripts/fetch-cutout-models.mjs`，默认仅下载快速模型；加 `--all` 可获取两种模型。脚本对已有文件及新下载文件执行 SHA-256 校验；下载不完整或校验失败不会覆盖已存在的有效文件。

## 没有随包加入的替代模型

IS-Net / DIS general-use 的官方项目同样采用 Apache-2.0，但 rembg 的原版 ONNX 约 178.6 MB、固定输入 1024 × 1024，计算量和中间特征内存对浏览器更重。因此 v1.3 没有加入该模型，也没有将 320 × 320 模型标注为 IS-Net。来源：[DIS 项目](https://github.com/xuebinqin/DIS)、[DIS 许可证](https://github.com/xuebinqin/DIS/blob/main/LICENSE.md)、[rembg DIS 会话](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/dis_general_use.py)。
