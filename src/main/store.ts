import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type Stats = {
  totalSpins: number
  totalTokens: number
  smallWins: number
  bigWins: number
  jackpots: number
}

const EMPTY: Stats = { totalSpins: 0, totalTokens: 0, smallWins: 0, bigWins: 0, jackpots: 0 }

function file(): string {
  return path.join(app.getPath('userData'), 'stats.json')
}

export function loadStats(): Stats {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Stats>
    return { ...EMPTY, ...raw }
  } catch {
    return { ...EMPTY }
  }
}

export function saveStats(stats: Stats): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(stats, null, 2))
  } catch {
    // 統計が落ちてもスロットは回り続ければいい
  }
}
