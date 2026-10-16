import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = path.join(projectDir, 'public', 'models');
const downloadDir = path.join(projectDir, 'artifacts', 'model-download');
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--all', '--verify'].includes(arg)) {
    throw new Error(`未知参数 ${arg}。用法：node scripts/fetch-cutout-models.mjs [--all] [--verify]`);
  }
}
const manifest = JSON.parse(await readFile(path.join(modelDir, 'manifest.json'), 'utf8'));
const models = manifest.models.filter(model => args.has('--all') || model.id === 'fast');

async function digestFile(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function isVerified(filename, model) {
  try {
    const actual = await digestFile(filename);
    return actual.bytes === model.bytes && actual.sha256 === model.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

await mkdir(modelDir, { recursive: true });
for (const model of models) {
  const destination = path.join(modelDir, model.file);
  if (await isVerified(destination, model)) {
    console.log(`已校验 ${model.file}（${model.bytes.toLocaleString()} 字节）`);
    continue;
  }
  if (args.has('--verify')) {
    throw new Error(`${model.file} 缺失或校验失败。去掉 --verify 可重新获取。`);
  }
  await mkdir(downloadDir, { recursive: true });
  const temporary = path.join(downloadDir, `${model.file}.${process.pid}.download`);
  console.log(`下载 ${model.name}：${model.url}`);
  try {
    const response = await fetch(model.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);
    let received = 0;
    let progressMark = 0;
    const meter = new Transform({
      transform(chunk, encoding, done) {
        received += chunk.length;
        if (received > model.bytes) return done(new Error('模型下载超出预期大小，已停止。'));
        const mark = Math.floor(received / (10 * 1024 * 1024));
        if (mark > progressMark) {
          progressMark = mark;
          console.log(`  ${Math.round(received / model.bytes * 100)}%`);
        }
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(temporary));
    if (!await isVerified(temporary, model)) throw new Error('模型 SHA-256 或文件长度校验失败。');
    await rename(temporary, destination);
    console.log(`下载并校验完成 ${model.file}`);
  } finally {
    await rm(temporary, { force: true });
  }
}
