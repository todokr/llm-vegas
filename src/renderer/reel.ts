import { GLYPH, SYMBOLS, type Symbol } from './config.js'

const STEP = 360 / SYMBOLS.length // 6面の円筒なので60度

/** 面の高さは CSS 側の唯一の真実。半径はそこから導く */
function faceHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--face-h')
  const h = parseFloat(raw)
  return Number.isFinite(h) && h > 0 ? h : 110
}
let radiusCache: number | null = null
function radius(): number {
  if (radiusCache === null) {
    radiusCache = faceHeight() / 2 / Math.tan((Math.PI * STEP) / 360)
  }
  return radiusCache
}

type Ease = (t: number) => number

const easeOutQuint: Ease = (t) => 1 - Math.pow(1 - t, 5)
const easeOutBack: Ease = (t) => {
  const c1 = 2.2
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

type Segment = { t0: number; t1: number; from: number; to: number; ease: Ease }

export class Reel {
  private cylinder: HTMLDivElement
  private faces: HTMLDivElement[] = []
  private strip: Symbol[] = [...SYMBOLS]
  private angle = 0
  private segments: Segment[] = []
  private lastAngle = 0
  speed = 0 // deg/ms

  constructor(private root: HTMLElement) {
    this.cylinder = root.querySelector('.cylinder') as HTMLDivElement
    this.setStrip([...SYMBOLS])
  }

  /** リール帯を組み直す。回転中に差し替えてもブレていて見えない */
  setStrip(strip: Symbol[]): void {
    this.strip = strip
    this.cylinder.innerHTML = ''
    this.faces = strip.map((sym, i) => {
      const face = document.createElement('div')
      face.className = 'face'
      face.dataset.sym = sym
      face.textContent = GLYPH[sym]
      face.style.transform = `rotateX(${i * STEP}deg) translateZ(${radius()}px)`
      this.cylinder.appendChild(face)
      return face
    })
  }

  /**
   * 指定の絵柄が最後に来て、その一手前に stall の絵柄が来る帯を作る。
   * これで「揃いかけて止まる」煽りが物理的に成立する。
   * stall を省くと単純なシャッフル（帯に同じ絵柄を重複させない）。
   */
  static buildStrip(final: Symbol, stall?: Symbol): Symbol[] {
    const shuffle = (xs: Symbol[]): Symbol[] => {
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[xs[i], xs[j]] = [xs[j], xs[i]]
      }
      return xs
    }

    if (stall === undefined || stall === final) {
      return shuffle([...SYMBOLS])
    }

    const rest = shuffle(SYMBOLS.filter((s) => s !== final && s !== stall))
    const at = Math.floor(Math.random() * (rest.length + 1))
    return [...rest.slice(0, at), stall, final, ...rest.slice(at)]
  }

  indexOf(sym: Symbol): number {
    return this.strip.indexOf(sym)
  }

  /** 帯の n 番目（循環）。ペイライン外の段を調べるのに使う */
  symbolAt(i: number): Symbol {
    const n = this.strip.length
    return this.strip[((i % n) + n) % n]
  }

  /** index が正面に来る角度（現在角度より必ず手前＝負方向） */
  private targetAngle(index: number, rotations: number): number {
    const rem = (((this.angle + STEP * index) % 360) + 360) % 360
    return this.angle - 360 * rotations - rem
  }

  spinTo(index: number, t0: number, dur: number, rotations: number): number {
    const to = this.targetAngle(index, rotations)
    this.segments.push({ t0, t1: t0 + dur, from: this.angle, to, ease: easeOutQuint })
    this.angle = to
    return to
  }

  /** 先読み予告用に、回り出す前に一瞬だけ逆回転させる */
  nudgeBack(t0: number, dur: number): void {
    const to = this.angle + STEP * 2
    this.segments.push({ t0, t1: t0 + dur, from: this.angle, to, ease: easeOutBack })
    this.angle = to
  }

  /** 一手ぶんだけカタンと進める（煽りからの着地） */
  stepForward(t0: number, dur: number): void {
    const to = this.angle - STEP
    this.segments.push({ t0, t1: t0 + dur, from: this.angle, to, ease: easeOutBack })
    this.angle = to
  }

  update(now: number): void {
    let value: number | null = null
    for (const seg of this.segments) {
      if (now < seg.t0) break
      const t = Math.min(1, (now - seg.t0) / (seg.t1 - seg.t0))
      value = seg.from + (seg.to - seg.from) * seg.ease(t)
    }
    if (value === null) return

    this.speed = Math.abs(value - this.lastAngle)
    this.lastAngle = value
    this.cylinder.style.transform = `rotateX(${value}deg)`

    // filter を円筒本体に付けると preserve-3d が flat 化されて投影が壊れる。
    // 変数を継承させて各面側でぼかす。
    const blur = Math.min(9, this.speed * 0.5)
    this.cylinder.style.setProperty('--reel-blur', blur > 0.4 ? `${blur.toFixed(2)}px` : '0px')
  }

  reset(): void {
    this.segments = []
    this.cylinder.style.setProperty('--reel-blur', '0px')
  }

  /** 停止後にぶれが残らないよう明示的に落とす */
  settle(): void {
    this.speed = 0
    this.cylinder.style.setProperty('--reel-blur', '0px')
  }

  highlight(on: boolean, sym?: Symbol): void {
    for (const f of this.faces) {
      f.classList.toggle('hit', on && f.dataset.sym === sym)
    }
  }
}
