import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const POLL_MS = 1000

function listTranscripts(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listTranscripts(p, out)
    else if (e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

/** 追記された行から output トークンだけを拾う */
function sumOutputTokens(chunk: string): number {
  let total = 0
  for (const line of chunk.split('\n')) {
    if (!line) continue
    try {
      const rec = JSON.parse(line) as { message?: { usage?: { output_tokens?: number } } }
      total += rec.message?.usage?.output_tokens ?? 0
    } catch {
      // 壊れた行は黙って捨てる
    }
  }
  return total
}

/**
 * 起動時点のファイル末尾を覚え、以降の追記分だけを数える。
 * アプリを閉じている間の消費は捨てる（仕様）。
 */
export function startWatcher(
  onTokens: (n: number) => void,
  opts: { root?: string; pollMs?: number } = {},
): () => void {
  const root = opts.root ?? PROJECTS_DIR
  const pollMs = opts.pollMs ?? POLL_MS
  const offsets = new Map<string, number>()
  for (const f of listTranscripts(root)) {
    try {
      offsets.set(f, fs.statSync(f).size)
    } catch {
      /* 読めないものは次回拾う */
    }
  }

  const tick = (): void => {
    let delta = 0
    for (const file of listTranscripts(root)) {
      let size: number
      try {
        size = fs.statSync(file).size
      } catch {
        continue
      }

      // 起動後に生まれたファイルは頭から数える
      let from = offsets.get(file) ?? 0
      if (size < from) from = 0 // 切り詰められた場合
      if (size === from) {
        offsets.set(file, size)
        continue
      }

      let buf: Buffer
      let fd: number | undefined
      try {
        fd = fs.openSync(file, 'r')
        const len = size - from
        buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, from)
      } catch {
        continue
      } finally {
        if (fd !== undefined) {
          try {
            fs.closeSync(fd)
          } catch {
            /* noop */
          }
        }
      }

      const text = buf.toString('utf8')
      const lastNl = text.lastIndexOf('\n')
      if (lastNl === -1) {
        // 行の途中までしか届いていない。次のtickまで待つ
        continue
      }
      delta += sumOutputTokens(text.slice(0, lastNl))
      offsets.set(file, from + Buffer.byteLength(text.slice(0, lastNl + 1), 'utf8'))
    }

    if (delta > 0) onTokens(delta)
  }

  const timer = setInterval(tick, pollMs)
  return () => clearInterval(timer)
}
