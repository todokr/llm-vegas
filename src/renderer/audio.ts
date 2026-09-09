/** 外部素材ゼロ。全部その場で合成する */
const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** Am - F - C - G の4小節ループ。各和音の構成音（MIDI） */
const PROGRESSION: number[][] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
]

export class Sfx {
  private ctx = new AudioContext()
  private master = this.ctx.createGain()
  private bgmGain = this.ctx.createGain()
  private bgmTimer: number | null = null
  private nextStepTime = 0
  private step = 0
  private bpm = 148
  bgmOn = false
  private whirOsc: OscillatorNode | null = null
  private whirGain: GainNode | null = null
  private whirFilter: BiquadFilterNode | null = null
  muted = false

  constructor() {
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)
    this.bgmGain.gain.value = 0.22
    this.bgmGain.connect(this.master)
  }

  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean): void {
    this.muted = m
    this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02)
  }

  private now(): number {
    return this.ctx.currentTime
  }

  private noiseBuffer(dur: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * dur)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.3,
    at = 0,
    dest: AudioNode = this.master,
  ): void {
    const t = this.now() + at
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(dest)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise(
    dur: number,
    gain = 0.2,
    at = 0,
    hp = 1200,
    dest: AudioNode = this.master,
  ): void {
    const t = this.now() + at
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer(dur)
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = hp
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(dest)
    src.start(t)
    src.stop(t + dur)
  }

  // ---------------- BGM ----------------

  /** 起動中ずっと流れる 4 小節ループ。素材ではなくその場で組み立てる */
  startBgm(): void {
    if (this.bgmTimer !== null) return
    this.bgmOn = true
    this.resume()
    this.nextStepTime = this.now() + 0.1
    this.bgmTimer = window.setInterval(() => this.scheduleAhead(), 25)
  }

  stopBgm(): void {
    this.bgmOn = false
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
  }

  toggleBgm(): boolean {
    if (this.bgmOn) this.stopBgm()
    else this.startBgm()
    return this.bgmOn
  }

  /** ラッシュ中はテンポを上げる */
  setRush(on: boolean): void {
    this.bpm = on ? 190 : 148
  }

  /** ファンファーレの間だけ BGM を引っ込める */
  duck(seconds: number): void {
    const t = this.now()
    this.bgmGain.gain.cancelScheduledValues(t)
    this.bgmGain.gain.setTargetAtTime(0.05, t, 0.05)
    this.bgmGain.gain.setTargetAtTime(0.22, t + seconds, 0.4)
  }

  private scheduleAhead(): void {
    const stepDur = 60 / this.bpm / 4 // 16分音符
    while (this.nextStepTime < this.now() + 0.12) {
      this.playStep(this.step, this.nextStepTime)
      this.step = (this.step + 1) % 64 // 4小節 × 16
      this.nextStepTime += stepDur
    }
  }

  private playStep(step: number, time: number): void {
    const at = time - this.now()
    if (at < -0.05) return
    const chord = PROGRESSION[Math.floor(step / 16) % 4]
    const inBar = step % 16
    const dest = this.bgmGain

    // ベース：ルート音を刻む
    if ([0, 3, 6, 8, 11, 14].includes(inBar)) {
      this.blip(midi(chord[0] - 24), 0.16, 'square', 0.28, at, dest)
    }

    // アルペジオ：16分で和音を駆け上がる
    const arp = chord[(step + Math.floor(step / 4)) % 3] + 12
    this.blip(midi(arp), 0.09, 'square', 0.11, at, dest)
    if (this.bpm > 170) {
      // ラッシュ中はオクターブ上を重ねて派手にする
      this.blip(midi(arp + 12), 0.07, 'triangle', 0.08, at, dest)
    }

    // ドラム
    if (inBar === 0 || inBar === 8) {
      this.kick(at, dest)
    }
    if (inBar === 4 || inBar === 12) {
      this.noise(0.14, 0.16, at, 1800, dest)
    }
    if (inBar % 2 === 0) {
      this.noise(0.03, inBar % 4 === 0 ? 0.07 : 0.045, at, 7000, dest)
    }
  }

  private kick(at: number, dest: AudioNode): void {
    const t = this.now() + at
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(g).connect(dest)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /** 回転中ずっと鳴るモーター音 */
  startWhir(): void {
    if (this.whirOsc) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const f = this.ctx.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.value = 60
    f.type = 'lowpass'
    f.frequency.value = 900
    f.Q.value = 6
    g.gain.value = 0
    g.gain.setTargetAtTime(0.12, this.now(), 0.05)
    osc.connect(f).connect(g).connect(this.master)
    osc.start()
    this.whirOsc = osc
    this.whirGain = g
    this.whirFilter = f
  }

  /** 0..1 の回転速度で音程を動かす */
  setWhirSpeed(v: number): void {
    if (!this.whirOsc || !this.whirFilter) return
    const t = this.now()
    this.whirOsc.frequency.setTargetAtTime(45 + v * 150, t, 0.03)
    this.whirFilter.frequency.setTargetAtTime(400 + v * 2200, t, 0.03)
  }

  stopWhir(): void {
    if (!this.whirOsc || !this.whirGain) return
    const t = this.now()
    this.whirGain.gain.setTargetAtTime(0, t, 0.04)
    this.whirOsc.stop(t + 0.35)
    this.whirOsc = null
    this.whirGain = null
    this.whirFilter = null
  }

  /** リールが止まるガコン */
  clunk(): void {
    this.blip(180, 0.09, 'square', 0.35)
    this.blip(90, 0.16, 'triangle', 0.3)
    this.noise(0.06, 0.18, 0, 2000)
  }

  /** テンパイ煽りの心音 */
  tension(): void {
    this.blip(220, 0.5, 'sine', 0.25)
    this.blip(223, 0.5, 'sine', 0.25)
    for (let i = 0; i < 4; i++) this.blip(1400 + i * 60, 0.06, 'square', 0.12, i * 0.12)
  }

  /** トークンが届いたときのチャリン */
  coinInsert(): void {
    this.resume()
    this.noise(0.02, 0.12, 0, 6000)
    this.blip(2637, 0.08, 'triangle', 0.16)
    this.blip(3520, 0.1, 'triangle', 0.12, 0.035)
    this.blip(5274, 0.05, 'sine', 0.07, 0.05)
  }

  coin(at = 0): void {
    this.blip(1500, 0.06, 'triangle', 0.18, at)
    this.blip(2300, 0.08, 'triangle', 0.14, at + 0.03)
  }

  smallWin(): void {
    const notes = [880, 1108, 1318]
    notes.forEach((n, i) => this.blip(n, 0.16, 'square', 0.22, i * 0.07))
    for (let i = 0; i < 6; i++) this.coin(0.1 + i * 0.06)
  }

  bigWin(): void {
    const fanfare = [523, 659, 784, 1046, 784, 1046, 1318]
    fanfare.forEach((n, i) => {
      this.blip(n, 0.28, 'sawtooth', 0.2, i * 0.11)
      this.blip(n / 2, 0.28, 'square', 0.12, i * 0.11)
    })
    this.noise(0.5, 0.14, 0, 4000)
    for (let i = 0; i < 24; i++) this.coin(0.2 + i * 0.045)
  }

  jackpot(): void {
    // 上昇スイープ
    const t = this.now()
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(120, t)
    osc.frequency.exponentialRampToValueAtTime(2400, t + 1.1)
    g.gain.setValueAtTime(0.001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.0)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 1.3)
    this.noise(1.2, 0.1, 0, 3000)

    // 本ファンファーレ
    const melody = [1046, 1318, 1568, 2093, 1568, 2093, 2637, 2093, 2637, 3136]
    melody.forEach((n, i) => {
      this.blip(n, 0.3, 'sawtooth', 0.22, 1.3 + i * 0.13)
      this.blip(n / 2, 0.3, 'square', 0.14, 1.3 + i * 0.13)
      this.blip(n / 4, 0.3, 'triangle', 0.1, 1.3 + i * 0.13)
    })
    // サイレン
    for (let i = 0; i < 8; i++) {
      this.blip(900, 0.18, 'square', 0.12, 1.3 + i * 0.3)
      this.blip(1200, 0.18, 'square', 0.12, 1.45 + i * 0.3)
    }
    // コインの奔流
    for (let i = 0; i < 90; i++) this.coin(1.3 + i * 0.045)
  }
}
