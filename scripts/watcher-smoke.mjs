/**
 * watcher の動作確認。
 * - 起動前に既にあった行は数えない
 * - 起動後の追記だけを数える
 * - 起動後に生まれたファイルは頭から数える
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let startWatcher
try {
  ;({ startWatcher } = require('../dist/main/watcher.js'))
} catch (e) {
  console.error('dist/main/watcher.js がない。先に npm run build:', e.message)
  process.exit(1)
}

const line = (n) =>
  JSON.stringify({ type: 'assistant', message: { usage: { output_tokens: n } } }) + '\n'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-vegas-'))
const existing = path.join(tmp, 'sub', 'existing.jsonl')
fs.mkdirSync(path.dirname(existing), { recursive: true })
fs.writeFileSync(existing, line(99999)) // 起動前の分：数えてはいけない

let counted = 0
const stop = startWatcher((n) => {
  counted += n
}, { root: tmp, pollMs: 40 })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await sleep(80)
fs.appendFileSync(existing, line(4000) + line(6500))
await sleep(120)
fs.writeFileSync(path.join(tmp, 'born-later.jsonl'), line(1500)) // 起動後のファイル：頭から数える
await sleep(120)

stop()
fs.rmSync(tmp, { recursive: true, force: true })

const expected = 12000
console.log(`counted=${counted} expected=${expected}`)
process.exit(counted === expected ? 0 : 1)
