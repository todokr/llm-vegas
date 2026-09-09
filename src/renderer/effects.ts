type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  color: string
  shape: 'confetti' | 'coin' | 'spark'
  life: number
  maxLife: number
  gravity: number
}

const CONFETTI_COLORS = [
  '#ff2d55',
  '#ffd75e',
  '#22e0ff',
  '#ff2fd6',
  '#7cff5e',
  '#ffffff',
  '#ff8a00',
]

export class Fx {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private parts: Particle[] = []
  private running = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private push(p: Particle): void {
    this.parts.push(p)
    this.start()
  }

  /** 一点から弾ける紙吹雪 */
  burst(x: number, y: number, count: number, power = 9): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = power * (0.35 + Math.random())
      this.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.5,
        size: 5 + Math.random() * 8,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        shape: Math.random() < 0.2 ? 'spark' : 'confetti',
        life: 0,
        maxLife: 90 + Math.random() * 70,
        gravity: 0.28,
      })
    }
  }

  /** 上から降り注ぐコイン */
  coinRain(count: number, spread = 1): void {
    const w = window.innerWidth
    for (let i = 0; i < count; i++) {
      this.push({
        x: w * (0.5 - spread / 2) + Math.random() * w * spread,
        y: -30 - Math.random() * 400,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 10 + Math.random() * 12,
        color: '#ffd75e',
        shape: 'coin',
        life: 0,
        maxLife: 260,
        gravity: 0.22,
      })
    }
  }

  /** 全方位に飛ぶ光の粒 */
  sparkStorm(count: number): void {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 6 + Math.random() * 26
      this.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        rot: 0,
        vr: 0,
        size: 3 + Math.random() * 6,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        shape: 'spark',
        life: 0,
        maxLife: 60 + Math.random() * 50,
        gravity: 0.05,
      })
    }
  }

  private start(): void {
    if (this.running) return
    this.running = true
    requestAnimationFrame(() => this.frame())
  }

  private frame(): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.life++
      p.vy += p.gravity
      p.vx *= 0.995
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr

      const t = p.life / p.maxLife
      if (t >= 1 || p.y > window.innerHeight + 80) {
        this.parts.splice(i, 1)
        continue
      }

      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - t * t)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)

      if (p.shape === 'coin') {
        const squash = Math.abs(Math.cos(p.life * 0.16))
        ctx.scale(1, 0.25 + squash * 0.75)
        const g = ctx.createRadialGradient(-p.size * 0.3, -p.size * 0.3, 1, 0, 0, p.size)
        g.addColorStop(0, '#fff8d0')
        g.addColorStop(0.5, '#ffd75e')
        g.addColorStop(1, '#a06a00')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 'spark') {
        ctx.shadowBlur = 14
        ctx.shadowColor = p.color
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = p.color
        ctx.scale(1, Math.abs(Math.cos(p.life * 0.2)) * 0.9 + 0.1)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      }
      ctx.restore()
    }

    if (this.parts.length > 0) {
      requestAnimationFrame(() => this.frame())
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      this.running = false
    }
  }
}
