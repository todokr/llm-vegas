import {
  RUSH_SPINS,
  RUSH_THRESHOLD,
  TEASER_LABEL,
  TOKENS_PER_SPIN,
  USD_PER_MTOK_OUTPUT,
  type Symbol,
} from './config.js'
import { drawOutcome, type Outcome } from './outcome.js'
import { Sfx } from './audio.js'
import { Voice } from './voice.js'
import { Fx } from './effects.js'
import { Reel } from './reel.js'

type Stats = {
  totalSpins: number
  totalTokens: number
  smallWins: number
  bigWins: number
  jackpots: number
}

declare global {
  interface Window {
    tokenSlot: {
      onTokens: (cb: (n: number) => void) => void
      loadStats: () => Promise<Stats>
      saveStats: (s: Stats) => void
      showOverlay: (ms: number) => void
      expandWindow: () => void
      restoreWindow: () => void
      onExpanded: (cb: (r: { x: number; y: number; width: number; height: number }) => void) => void
      onRestored: (cb: () => void) => void
      quit: () => void
    }
  }
}

const api = window.tokenSlot
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const machineEl = $('machine')
const cabinetEl = document.querySelector('.cabinet') as HTMLElement
const coinsEl = $('coins')
const gaugeEl = $('gauge')
const nextEl = $('nextTokens')
const burnEl = $('burn')
const coinSlotEl = $('coinSlot')
const bannerEl = $('winBanner')
const rushEl = $('rush')
const cutinEl = $('cutin')
const blackoutEl = $('blackout')
const jackpotEl = $('jackpot')
const jpAmountEl = $('jpAmount')
const housingEl = $('housing')

const sfx = new Sfx()
const voice = new Voice()
const fx = new Fx($<HTMLCanvasElement>('fx'))
const reels = Array.from(document.querySelectorAll<HTMLElement>('.reel')).map((el) => new Reel(el))

let stats: Stats = { totalSpins: 0, totalTokens: 0, smallWins: 0, bigWins: 0, jackpots: 0 }
let tokenPool = 0
let queue = 0
let spinning = false
let coins = 0
let rushLeft = 0
let turbo = false

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---------------- 表示 ----------------

function renderStats(): void {
  $('stSpins').textContent = stats.totalSpins.toLocaleString('en-US')
  $('stBig').textContent = (stats.bigWins + stats.jackpots).toLocaleString('en-US')
  $('stJp').textContent = stats.jackpots.toLocaleString('en-US')
}

function renderGauge(): void {
  const pct = Math.min(100, (tokenPool / TOKENS_PER_SPIN) * 100)
  gaugeEl.style.width = `${pct}%`
  nextEl.textContent = Math.max(0, TOKENS_PER_SPIN - tokenPool).toLocaleString('en-US')
}

/** 燃やした output トークンをドル換算で晒す */
function renderBurn(pulse = false): void {
  const usd = (stats.totalTokens / 1_000_000) * USD_PER_MTOK_OUTPUT
  burnEl.textContent = `$${usd.toFixed(2)}`
  if (pulse) {
    burnEl.classList.add('hot')
    setTimeout(() => burnEl.classList.remove('hot'), 1000)
  }
}

/** COINS を7セグ風の桁に分解して描く */
function renderCoins(value: number, scramble = false): void {
  const text = Math.round(value).toLocaleString('en-US')
  const digits = [...text]
  if (coinsEl.children.length !== digits.length) {
    coinsEl.innerHTML = ''
    for (const ch of digits) {
      const d = document.createElement('span')
      d.className = ch === ',' ? 'd sep' : 'd'
      coinsEl.appendChild(d)
    }
  }
  digits.forEach((ch, i) => {
    const el = coinsEl.children[i] as HTMLElement
    const rolling = scramble && ch !== ',' && i >= digits.length - 3
    el.className = ch === ',' ? 'd sep' : rolling ? 'd roll' : 'd'
    el.textContent = rolling ? String(Math.floor(Math.random() * 10)) : ch
  })
}

function addCoins(n: number): void {
  const from = coins
  coins += n
  const t0 = performance.now()
  const dur = Math.min(1600, 320 + n * 0.16)
  const step = (): void => {
    const t = Math.min(1, (performance.now() - t0) / dur)
    const eased = 1 - Math.pow(1 - t, 3)
    renderCoins(from + (coins - from) * eased, t < 1)
    if (t < 1) requestAnimationFrame(step)
  }
  step()
}

function shake(hard = false): void {
  const cls = hard ? 'shake-hard' : 'shake'
  machineEl.classList.remove('shake', 'shake-hard')
  void machineEl.offsetWidth // reflow でアニメを再発火
  machineEl.classList.add(cls)
  setTimeout(() => machineEl.classList.remove(cls), hard ? 900 : 430)
}

function banner(text: string, ms: number): void {
  bannerEl.querySelector('span')!.textContent = text
  bannerEl.classList.add('on')
  setTimeout(() => bannerEl.classList.remove('on'), ms)
}

function cutin(text: string, ms: number): void {
  cutinEl.querySelector('span')!.textContent = text
  cutinEl.classList.remove('on')
  void cutinEl.offsetWidth
  cutinEl.classList.add('on')
  setTimeout(() => cutinEl.classList.remove('on'), ms)
}

function reelsCenter(): { x: number; y: number } {
  const r = housingEl.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function updateRushBanner(): void {
  if (rushLeft > 0) {
    rushEl.textContent = `⚡ LLM RUSH — ${rushLeft} LEFT ⚡`
    rushEl.classList.add('on')
  } else if (turbo) {
    rushEl.textContent = '🔥 TURBO 🔥'
    rushEl.classList.add('on')
  } else {
    rushEl.classList.remove('on')
  }
}

function enterRush(spins: number): void {
  rushLeft = Math.max(rushLeft, spins)
  machineEl.classList.add('rush-mode')
  sfx.setRush(true)
  voice.rushStart()
  updateRushBanner()
}

function exitRushIfDone(): void {
  if (rushLeft > 0) return
  machineEl.classList.remove('rush-mode')
  if (!turbo) sfx.setRush(false)
  updateRushBanner()
}

// ---------------- リール帯の用意 ----------------

/** ペイライン外の段が3つ揃っているか */
function rowAligned(idx: [number, number, number], offset: number): boolean {
  const a = reels[0].symbolAt(idx[0] + offset)
  return a === reels[1].symbolAt(idx[1] + offset) && a === reels[2].symbolAt(idx[2] + offset)
}

/**
 * 今回の結果に合わせてリール帯を組み直し、各リールの停止位置を返す。
 * 有効ラインは中央1本だけなので、上下の段がたまたま揃って
 * 「揃ったのに何も出ない」と見えてしまう並びは作り直す。
 */
function prepareReels(outcome: Outcome): [number, number, number] {
  reels.forEach((r) => {
    r.reset()
    r.highlight(false)
  })

  // 第3リールだけは煽り用に「一手前が stall」という並びが要る
  reels[2].setStrip(Reel.buildStrip(outcome.symbols[2], outcome.stallSymbol))
  const idx2 = reels[2].indexOf(outcome.symbols[2])

  let idx: [number, number, number] = [0, 0, idx2]
  for (let attempt = 0; attempt < 40; attempt++) {
    reels[0].setStrip(Reel.buildStrip(outcome.symbols[0]))
    reels[1].setStrip(Reel.buildStrip(outcome.symbols[1]))
    idx = [reels[0].indexOf(outcome.symbols[0]), reels[1].indexOf(outcome.symbols[1]), idx2]
    if (!rowAligned(idx, -1) && !rowAligned(idx, 1)) break
  }
  return idx
}

// ---------------- 回転 ----------------

/** 指定時刻までリールを回し続ける */
function runReels(until: number, onFrame?: (now: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const frame = (): void => {
      const now = performance.now()
      let maxSpeed = 0
      for (const r of reels) {
        r.update(now)
        maxSpeed = Math.max(maxSpeed, r.speed)
      }
      sfx.setWhirSpeed(Math.min(1, maxSpeed / 18))
      onFrame?.(now)
      if (now >= until) {
        resolve()
        return
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

async function runSpin(outcome: Outcome, fast: boolean): Promise<void> {
  const k = fast ? 0.42 : 1
  const idx = prepareReels(outcome)

  sfx.resume()
  sfx.startWhir()

  // ---- 先読み予告 ----
  if (outcome.teaser > 0) cabinetEl.classList.add(`teaser-${outcome.teaser}`)
  if (outcome.teaser >= 2) {
    cutin(TEASER_LABEL[outcome.teaser], 900)
    voice.teaser(outcome.teaser)
    sfx.tension()
    // 逆回転してから回り出す
    const back = performance.now()
    reels.forEach((r) => r.nudgeBack(back, 380 * k))
    await runReels(back + 460 * k)
  }

  const s0 = performance.now()
  const durs = [1100 * k, 1750 * k, 2500 * k]
  reels[0].spinTo(idx[0], s0, durs[0], 6)
  reels[1].spinTo(idx[1], s0, durs[1], 8)

  const holdMs = 700 * k
  const crawlMs = 520 * k
  const stepMs = 360 * k
  let endAt: number

  if (outcome.slowSteps > 0) {
    // ロングリーチ：数コマ手前で止めて1コマずつ這わせる
    reels[2].spinTo(idx[2] - outcome.slowSteps, s0, durs[2], 10)
    for (let j = 0; j < outcome.slowSteps; j++) {
      reels[2].stepForward(s0 + durs[2] + holdMs + j * crawlMs, crawlMs * 0.72)
    }
    endAt = durs[2] + holdMs + outcome.slowSteps * crawlMs
  } else if (outcome.tenpai) {
    reels[2].spinTo(idx[2] - 1, s0, durs[2], 10)
    reels[2].stepForward(s0 + durs[2] + holdMs, stepMs)
    endAt = durs[2] + holdMs + stepMs
  } else {
    reels[2].spinTo(idx[2], s0, durs[2], 10)
    endAt = durs[2]
  }

  const stopped = [false, false, false]
  let tensionPlayed = false
  let crawlStep = 0

  await runReels(s0 + endAt + 60, (now) => {
    const el = now - s0
    reels.forEach((reel, i) => {
      if (!stopped[i] && el >= durs[i]) {
        stopped[i] = true
        sfx.clunk()
        shake(false)
      }
    })

    if (outcome.tenpai && !tensionPlayed && el >= durs[2] + 40) {
      tensionPlayed = true
      sfx.tension()
      housingEl.classList.add('win')
      if (outcome.slowSteps > 0) housingEl.classList.add('reach')
    }

    // 這っている1コマごとに音を上げていく
    if (outcome.slowSteps > 0) {
      const done = Math.floor((el - durs[2] - holdMs) / crawlMs) + 1
      if (done > crawlStep && done <= outcome.slowSteps) {
        crawlStep = done
        sfx.clunk()
        shake(false)
      }
    }
  })

  sfx.stopWhir()
  reels.forEach((r) => r.settle())
  housingEl.classList.remove('win', 'reach')
  cabinetEl.classList.remove('teaser-1', 'teaser-2', 'teaser-3')
  if (outcome.tenpai) sfx.clunk()

  await present(outcome)
}

async function present(outcome: Outcome): Promise<void> {
  stats.totalSpins++

  if (outcome.kind === 'lose') {
    api.saveStats(stats)
    renderStats()
    await sleep(220)
    return
  }

  const hitSym: Symbol = outcome.kind === 'small' ? 'CHERRY' : outcome.symbols[0]
  reels.forEach((r) => r.highlight(true, hitSym))
  housingEl.classList.add('win')
  const c = reelsCenter()

  if (outcome.kind === 'small') {
    stats.smallWins++
    banner(`CHERRY!  +${outcome.coins}`, 1400)
    sfx.duck(1.2)
    sfx.smallWin()
    voice.small()
    fx.burst(c.x, c.y, 40, 8)
    shake(false)
    addCoins(outcome.coins)
    await sleep(1500)
  } else if (outcome.kind === 'big') {
    stats.bigWins++
    banner(`BIG WIN!  +${outcome.coins}`, 2600)
    sfx.duck(3)
    sfx.bigWin()
    voice.big()
    api.showOverlay(3800) // デスクトップ全体のネオン枠
    shake(true)
    for (let i = 0; i < 4; i++) {
      fx.burst(c.x + (Math.random() - 0.5) * 120, c.y + (Math.random() - 0.5) * 60, 60, 13)
      await sleep(180)
    }
    fx.coinRain(90)
    addCoins(outcome.coins)
    await sleep(2200)
    enterRush(RUSH_SPINS.big)
  } else {
    stats.jackpots++
    await jackpotSequence(outcome)
    enterRush(RUSH_SPINS.jackpot)
  }

  reels.forEach((r) => r.highlight(false))
  housingEl.classList.remove('win')
  api.saveStats(stats)
  renderStats()
}

/** 777。暗転 → カットイン → 筐体が迫る → 爆発 → 全画面 */
async function jackpotSequence(outcome: Outcome): Promise<void> {
  // 1. 暗転
  blackoutEl.classList.add('on')
  await sleep(420)

  // 2. カットイン
  cutin('777', 1000)
  sfx.tension()
  await sleep(700)

  // 3. 筐体が迫り上がる
  machineEl.classList.add('zoom')
  await sleep(700)

  // 4. 爆発、そして画面を明け渡す
  api.expandWindow()
  api.showOverlay(11_000)
  await sleep(120)
  fx.resize()
  blackoutEl.classList.remove('on')
  machineEl.classList.remove('zoom')

  jackpotEl.classList.add('on')
  jpAmountEl.textContent = '0'
  sfx.duck(9)
  sfx.jackpot()
  voice.jackpot()
  shake(true)
  fx.sparkStorm(260)

  const t0 = performance.now()
  const countDur = 3200
  const countUp = (): void => {
    const t = Math.min(1, (performance.now() - t0) / countDur)
    jpAmountEl.textContent = Math.round(
      outcome.coins * (1 - Math.pow(1 - t, 3)),
    ).toLocaleString('en-US')
    if (t < 1) requestAnimationFrame(countUp)
  }
  countUp()

  for (let i = 0; i < 12; i++) {
    fx.coinRain(70, 1)
    fx.burst(
      window.innerWidth * (0.15 + Math.random() * 0.7),
      window.innerHeight * (0.2 + Math.random() * 0.5),
      50,
      16,
    )
    if (i % 3 === 0) shake(true)
    await sleep(480)
  }

  addCoins(outcome.coins)
  await sleep(900)
  jackpotEl.classList.remove('on')
  api.restoreWindow()
  await sleep(150)
  fx.resize()
}

// ---------------- 供給 ----------------

function pump(): void {
  if (spinning || queue === 0) return
  spinning = true
  turbo = queue >= RUSH_THRESHOLD
  if (turbo) sfx.setRush(true)
  updateRushBanner()
  queue--

  const inRush = rushLeft > 0
  if (inRush) {
    rushLeft--
    updateRushBanner()
  }

  void runSpin(drawOutcome(inRush), turbo).then(() => {
    spinning = false
    if (queue < RUSH_THRESHOLD) turbo = false
    exitRushIfDone()
    updateRushBanner()
    pump()
  })
}

api.onTokens((delta) => {
  tokenPool += delta
  stats.totalTokens += delta
  while (tokenPool >= TOKENS_PER_SPIN) {
    tokenPool -= TOKENS_PER_SPIN
    queue++
  }
  renderGauge()
  renderBurn(delta > 3000)

  // トークンが投入口に落ちる音
  sfx.coinInsert()
  coinSlotEl.classList.remove('eat')
  void coinSlotEl.offsetWidth
  coinSlotEl.classList.add('eat')

  pump()
})

api.onExpanded((rect) => {
  // 膨張しても筐体は同じ場所に居座る
  machineEl.style.position = 'absolute'
  machineEl.style.left = `${rect.x}px`
  machineEl.style.top = `${rect.y}px`
  machineEl.style.width = `${rect.width}px`
  machineEl.style.height = `${rect.height}px`
  machineEl.style.right = 'auto'
  machineEl.style.bottom = 'auto'
})

api.onRestored(() => {
  machineEl.style.left = ''
  machineEl.style.top = ''
  machineEl.style.width = ''
  machineEl.style.height = ''
  machineEl.style.right = ''
  machineEl.style.bottom = ''
})

// ---------------- 操作 ----------------

$('mute').addEventListener('click', () => {
  sfx.setMuted(!sfx.muted)
  voice.enabled = !sfx.muted
  if (sfx.muted) voice.cancel()
  $('mute').textContent = sfx.muted ? '🔇' : '🔊'
})

$('bgm').addEventListener('click', () => {
  sfx.resume()
  const on = sfx.toggleBgm()
  $('bgm').textContent = on ? '🎵' : '🎶'
  $('bgm').classList.toggle('off', !on)
})

$('quit').addEventListener('click', () => api.quit())

// 動作確認用：筐体ダブルクリックで1回転、Shift+ダブルクリックで777
machineEl.addEventListener('dblclick', (e) => {
  sfx.resume()
  if (spinning) return
  if (e.shiftKey) forceJackpot()
  else {
    queue++
    pump()
  }
})

document.addEventListener('click', () => sfx.resume(), { once: true })

function forceJackpot(): void {
  if (spinning) return
  spinning = true
  void runSpin(
    {
      kind: 'jackpot',
      symbols: ['SEVEN', 'SEVEN', 'SEVEN'],
      coins: 7777,
      tenpai: true,
      stallSymbol: 'BAR',
      teaser: 3,
      slowSteps: 3,
    },
    false,
  ).then(() => {
    spinning = false
    console.log('[llm-vegas] jackpot sequence finished')
    exitRushIfDone()
    pump()
  })
}

// 帯の組み方を大量に試して、中央ラインの一致と
// ペイライン外の偽の3つ揃いが無いことを確かめる
;(window as unknown as { __stripAudit: (n: number) => string }).__stripAudit = (n) => {
  let centerMismatch = 0
  let fakeRows = 0
  const teasers = [0, 0, 0, 0]
  for (let i = 0; i < n; i++) {
    const o = drawOutcome()
    const idx = prepareReels(o)
    teasers[o.teaser]++
    for (let r = 0; r < 3; r++) {
      if (reels[r].symbolAt(idx[r]) !== o.symbols[r]) centerMismatch++
    }
    if (rowAligned(idx, -1) || rowAligned(idx, 1)) fakeRows++
  }
  return JSON.stringify({ n, centerMismatch, fakeRows, teasers })
}
;(window as unknown as { __forceJackpot: () => void }).__forceJackpot = forceJackpot

void api.loadStats().then((s) => {
  stats = s
  renderStats()
  renderBurn()
})
renderGauge()
renderCoins(0)
renderBurn()

// 起動と同時に BGM を流す
sfx.startBgm()
