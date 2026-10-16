[CmdletBinding()]
param(
  [string]$NodePath,
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This packages an already-built release. It neither installs dependencies nor downloads models.
$beadProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$beadVersion = (Get-Content -LiteralPath (Join-Path $beadProject 'package.json') -Raw | ConvertFrom-Json).version
if ($beadVersion -ne '1.3.0') { throw '此脚本用于 v1.3.0，请先检查 package.json 版本。' }

if (-not $NodePath) {
  $beadBundledNode = Join-Path $beadProject 'runtime\node.exe'
  $beadCachedNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $beadBundledNode -PathType Leaf) { $NodePath = $beadBundledNode }
  elseif (Test-Path -LiteralPath $beadCachedNode -PathType Leaf) { $NodePath = $beadCachedNode }
  else {
    $beadSystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($beadSystemNode) { $NodePath = $beadSystemNode.Source }
  }
}
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw '找不到 Windows x64 Node.js，请使用 -NodePath 指定 node.exe。' }
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
$beadRuntimeVersion = (& $NodePath --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw '无法执行指定的 Node.js。' }
$beadRuntimeArchitecture = (& $NodePath -p 'process.platform.concat(String.fromCharCode(47),process.arch)' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $beadRuntimeArchitecture -ne 'win32/x64') { throw '运行包需要 Windows x64 的 Node.js 可执行文件。' }
if ($beadRuntimeVersion -ne 'v24.19.0') { throw '此发行包配套 Node.js v24.19.0 许可证，请使用同版本 node.exe。' }

$beadLicensePath = Join-Path $beadProject 'scripts\licenses\Node-LICENSE.txt'
$beadLicenseSha256 = '148EACF7863EF4329224A29398623077200A27194AA075569FAF4A0A85566CA5'
if (-not (Test-Path -LiteralPath $beadLicensePath -PathType Leaf) -or (Get-FileHash -LiteralPath $beadLicensePath -Algorithm SHA256).Hash -ne $beadLicenseSha256) {
  throw '缺少或修改了 Node.js v24.19.0 完整许可证，请恢复 scripts/licenses/Node-LICENSE.txt。'
}

if (-not $OutputPath) { $OutputPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '拼豆工具-v1.3-Windows.zip' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if ([IO.Path]::GetExtension($OutputPath) -ne '.zip') { throw 'OutputPath 必须是 .zip 文件路径。' }
$beadOutputName = [IO.Path]::GetFileName($OutputPath)
if ($beadOutputName -match 'v1\.2|^拼豆工具-本地版-Windows\.zip$') { throw '请保留旧版本压缩包，使用新的 v1.3 文件名。' }
if ((Test-Path -LiteralPath $OutputPath) -and $beadOutputName -ne '拼豆工具-v1.3-Windows.zip') { throw '为避免覆盖个人文件，仅允许覆盖同名的 拼豆工具-v1.3-Windows.zip。' }
$beadOutputParent = [IO.Path]::GetDirectoryName($OutputPath)
if (-not (Test-Path -LiteralPath $beadOutputParent -PathType Container)) { throw '输出目录不存在，请先创建输出目录。' }

$beadRequiredFiles = @(
  'dist\index.html', 'dist\models\u2netp.onnx', 'dist\models\u2net.onnx',
  'dist\cutout-runtime\ort-wasm-simd-threaded.wasm', 'dist\cutout-runtime\ort-wasm-simd-threaded.mjs',
  'public\models\manifest.json', 'public\models\u2netp.onnx', 'public\models\u2net.onnx',
  'scripts\local-server.mjs', 'scripts\fetch-cutout-models.mjs', '本地运行.cmd'
)
foreach ($beadRelativeFile in $beadRequiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $beadProject $beadRelativeFile) -PathType Leaf)) { throw "缺少 $beadRelativeFile，请先准备模型并完成生产构建。" }
}
$beadModels = (Get-Content -LiteralPath (Join-Path $beadProject 'public\models\manifest.json') -Raw | ConvertFrom-Json).models
foreach ($beadModelName in @('u2netp.onnx', 'u2net.onnx')) {
  $beadModel = @($beadModels | Where-Object { $_.file -eq $beadModelName })
  if ($beadModel.Count -ne 1) { throw "模型清单缺少唯一条目：$beadModelName" }
  foreach ($beadModelDirectory in @('public\models', 'dist\models')) {
    $beadModelPath = Join-Path (Join-Path $beadProject $beadModelDirectory) $beadModelName
    if ((Get-Item -LiteralPath $beadModelPath).Length -ne $beadModel[0].bytes -or (Get-FileHash -LiteralPath $beadModelPath -Algorithm SHA256).Hash -ne $beadModel[0].sha256) {
      throw "模型缺失、未下载完成或构建副本过期：$beadModelDirectory\$beadModelName"
    }
  }
}
foreach ($beadAsset in @('ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs')) {
  $beadPublicAsset = Join-Path (Join-Path $beadProject 'public\cutout-runtime') $beadAsset
  $beadDistAsset = Join-Path (Join-Path $beadProject 'dist\cutout-runtime') $beadAsset
  if (-not (Test-Path -LiteralPath $beadPublicAsset -PathType Leaf) -or (Get-FileHash -LiteralPath $beadPublicAsset -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $beadDistAsset -Algorithm SHA256).Hash) {
    throw "抠图运行时构建副本过期：$beadAsset，请重新构建。"
  }
}

$beadArtifacts = [IO.Path]::GetFullPath((Join-Path $beadProject 'artifacts'))
New-Item -ItemType Directory -Path $beadArtifacts -Force | Out-Null
$beadStageRoot = [IO.Path]::GetFullPath((Join-Path $beadArtifacts ('windows-package-' + [Guid]::NewGuid().ToString('N'))))
$beadPackageRoot = Join-Path $beadStageRoot 'bead-studio'
$beadStageCreated = $false

function Copy-BeadTree([string]$SourceDirectory, [string]$DestinationDirectory, [string[]]$Extensions) {
  $beadSourceRoot = [IO.Path]::GetFullPath($SourceDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
  foreach ($beadFile in (Get-ChildItem -LiteralPath $SourceDirectory -File -Recurse -Force | Sort-Object FullName)) {
    if ($beadFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "不打包符号链接：$($beadFile.FullName)" }
    $beadRelative = $beadFile.FullName.Substring($beadSourceRoot.Length)
    if ($beadRelative -match '(^|[\\/])(\.git|\.openai|node_modules|artifacts)([\\/]|$)' -or $beadRelative -match '\.bead\.json$') { continue }
    if ($Extensions -notcontains $beadFile.Extension.ToLowerInvariant()) { continue }
    $beadDestination = Join-Path $DestinationDirectory $beadRelative
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($beadDestination)) -Force | Out-Null
    Copy-Item -LiteralPath $beadFile.FullName -Destination $beadDestination
  }
}

try {
  New-Item -ItemType Directory -Path $beadPackageRoot | Out-Null
  $beadStageCreated = $true
  $beadRootFiles = @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'index.html', 'README.md', 'VERIFICATION.md', '.gitignore', '本地运行.cmd', '启动工具.cmd', 'start.ps1')
  foreach ($beadFile in $beadRootFiles) { Copy-Item -LiteralPath (Join-Path $beadProject $beadFile) -Destination (Join-Path $beadPackageRoot $beadFile) }
  $beadSourceExtensions = @('.ts', '.tsx', '.css', '.json', '.html', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.md')
  $beadAssetExtensions = @('.html', '.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.wasm', '.onnx', '.txt', '.md', '.woff', '.woff2')
  Copy-BeadTree (Join-Path $beadProject 'src') (Join-Path $beadPackageRoot 'src') $beadSourceExtensions
  Copy-BeadTree (Join-Path $beadProject 'scripts') (Join-Path $beadPackageRoot 'scripts') @('.mjs', '.cjs', '.ps1', '.txt', '.md')
  Copy-BeadTree (Join-Path $beadProject 'public') (Join-Path $beadPackageRoot 'public') $beadAssetExtensions
  Copy-BeadTree (Join-Path $beadProject 'dist') (Join-Path $beadPackageRoot 'dist') $beadAssetExtensions
  $beadRuntimeDirectory = Join-Path $beadPackageRoot 'runtime'
  New-Item -ItemType Directory -Path $beadRuntimeDirectory | Out-Null
  Copy-Item -LiteralPath $NodePath -Destination (Join-Path $beadRuntimeDirectory 'node.exe')
  Copy-Item -LiteralPath $beadLicensePath -Destination (Join-Path $beadRuntimeDirectory 'LICENSE.txt')
  $beadUtf8Bom = New-Object System.Text.UTF8Encoding($true)
  $beadQuickStart = @"
豆图 v1.3 · Windows x64 本地版

1. 对压缩包选择「全部解压」，不要在压缩包内运行。
2. 打开解压后的 bead-studio 文件夹，双击「本地运行.cmd」。
3. 浏览器自动打开本地页面。保持启动窗口开启；结束时关闭窗口或按 Ctrl+C。

已附带 Node.js v24.19.0、快速/精细两种抠图模型和全部浏览器运行资源。
普通使用无需安装 Node.js 或 npm，无需联网、登录或管理员权限。
建议使用近期版本的 Chrome 或 Edge；图片不会上传到外部服务。

照片主体识别：上传照片 →「识别主体 · AI 抠图」→ 自动识别 → 手动保留/擦除和调整边缘 → 应用并生成图纸。
如需保留抠图照片，请在抠图窗口下载透明 PNG；图纸项目 JSON 仅保存格子与色板，不含原照片和蒙版。
精细模型占用内存更高，首次加载较慢；可先使用快速模式。图像识别后仍可能需要手工修整。

「启动工具.cmd」用于源码开发，需要另行安装开发依赖；日常使用请选择「本地运行.cmd」。
完整说明见 README.md；模型来源与许可证见 public/models/；Node.js 许可证见 runtime/LICENSE.txt。
"@
  [IO.File]::WriteAllText((Join-Path $beadPackageRoot '快速使用.txt'), $beadQuickStart, $beadUtf8Bom)
  $beadManifest = [ordered]@{
    product = '豆图'; version = $beadVersion; platform = 'Windows x64'; runtime = $beadRuntimeVersion
    nodeSha256 = (Get-FileHash -LiteralPath (Join-Path $beadRuntimeDirectory 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
    nodeLicenseSource = 'https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE'
    nodeLicenseSha256 = $beadLicenseSha256.ToLowerInvariant()
    entrypoint = '本地运行.cmd'; localOnly = $true
    models = @($beadModels | Select-Object file, bytes, sha256)
  }
  [IO.File]::WriteAllText((Join-Path $beadPackageRoot 'PACKAGE-MANIFEST.json'), ($beadManifest | ConvertTo-Json -Depth 6), $beadUtf8Bom)

  Compress-Archive -LiteralPath $beadPackageRoot -DestinationPath $OutputPath -CompressionLevel Optimal -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $beadArchive = [IO.Compression.ZipFile]::OpenRead($OutputPath)
  try {
    $beadEntries = @($beadArchive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($beadEntry in $beadEntries) {
      if ($beadEntry -notlike 'bead-studio/*' -or $beadEntry -match '(^|/)(\.git|\.openai|node_modules|artifacts)(/|$)' -or $beadEntry -match '\.(part|partial|download|bead\.json)$') { throw "压缩包包含非预期条目：$beadEntry" }
    }
    foreach ($beadRequiredEntry in @('dist/index.html', 'dist/models/u2netp.onnx', 'dist/models/u2net.onnx', 'runtime/node.exe', 'runtime/LICENSE.txt', '本地运行.cmd', '快速使用.txt', 'src/App.tsx', 'public/models/manifest.json')) {
      if ($beadEntries -notcontains ('bead-studio/' + $beadRequiredEntry)) { throw "压缩包缺少：$beadRequiredEntry" }
    }
  } finally { $beadArchive.Dispose() }
  $beadArchiveFile = Get-Item -LiteralPath $OutputPath
  Write-Host ('已创建：' + $beadArchiveFile.FullName)
  Write-Host ('大小：{0:N1} MiB；Node.js：{1} {2}' -f ($beadArchiveFile.Length / 1MB), $beadRuntimeVersion, $beadRuntimeArchitecture)
  Write-Host ('SHA-256：' + (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash)
} finally {
  if ($beadStageCreated -and (Test-Path -LiteralPath $beadStageRoot -PathType Container)) {
    $beadResolvedStage = (Resolve-Path -LiteralPath $beadStageRoot).Path
    $beadResolvedArtifacts = (Resolve-Path -LiteralPath $beadArtifacts).Path
    $beadExpectedStageParent = [IO.Path]::GetDirectoryName($beadResolvedStage)
    if (-not $beadExpectedStageParent.Equals($beadResolvedArtifacts, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($beadResolvedStage) -notmatch '^windows-package-[a-f0-9]{32}$') { throw '临时目录安全检查失败，未删除任何目录。' }
    Remove-Item -LiteralPath $beadResolvedStage -Recurse -Force
  }
}
