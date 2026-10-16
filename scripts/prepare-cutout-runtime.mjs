import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = dirname(require.resolve('onnxruntime-web/wasm'));
const target = resolve(root, 'public/cutout-runtime');
await mkdir(target, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyFile(resolve(source, name), resolve(target, name));
}
// The npm tarball omits LICENSE; retain the upstream release's MIT notice in source.
await copyFile(resolve(root, 'scripts/licenses/ONNXRuntime-MIT.txt'), resolve(target, 'LICENSE-onnxruntime.txt'));
console.log('本地抠图引擎已复制，不依赖外部 CDN。');
