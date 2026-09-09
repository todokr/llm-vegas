/** OS の音声合成で叫ばせる。素材も API キーも要らない */
export class Voice {
  enabled = true

  private speak(text: string, rate: number, pitch: number, lang: string): void {
    if (!this.enabled) return
    const synth = window.speechSynthesis
    if (!synth) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.pitch = pitch
    u.volume = 1
    u.lang = lang
    synth.speak(u)
  }

  cancel(): void {
    window.speechSynthesis?.cancel()
  }

  small(): void {
    this.speak('Nice', 1.4, 1.6, 'en-US')
  }

  big(): void {
    this.speak('BIG WIN', 0.95, 1.5, 'en-US')
  }

  jackpot(): void {
    this.speak('JACKPOT', 0.8, 1.7, 'en-US')
    // 追い討ち
    setTimeout(() => this.speak('Seven! Seven! Seven!', 1.15, 1.5, 'en-US'), 1500)
    setTimeout(() => this.speak('Congratulations', 1.0, 1.6, 'en-US'), 4200)
  }

  teaser(level: number): void {
    if (level === 2) this.speak('Chance', 1.3, 1.5, 'en-US')
    if (level >= 3) this.speak('Super hot', 1.1, 1.6, 'en-US')
  }

  rushStart(): void {
    this.speak('RUSH', 1.0, 1.8, 'en-US')
  }
}
