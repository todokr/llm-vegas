import { ODDS, ODDS_RUSH, PAYOUT, SYMBOLS, TENPAI_RATE, type Symbol } from './config.js'

export type WinKind = 'lose' | 'small' | 'big' | 'jackpot'

export type Outcome = {
  kind: WinKind
  symbols: [Symbol, Symbol, Symbol]
  coins: number
  /** 第3リールが「一手前で止まりかける」煽りをするか */
  tenpai: boolean
  /** 煽りで見せる絵柄（テンパイ時は揃いかけた絵柄） */
  stallSymbol: Symbol
  /** 先読み予告の信頼度 0..3。当落を知った上で煽るための値 */
  teaser: number
  /** 第3リールを1コマずつ這わせる回数（ロングリーチ） */
  slowSteps: number
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

const others = (s: Symbol): Symbol[] => SYMBOLS.filter((x) => x !== s)

/**
 * 信頼度の抽選。結果が先に決まっているので、
 * 「当たりほど強い予告が出る」テーブルを素直に引ける。
 */
function drawTeaser(kind: WinKind): number {
  const table: Record<WinKind, number[]> = {
    // [信頼度0, 1, 2, 3] の重み
    lose: [72, 22, 5, 1],
    small: [10, 50, 32, 8],
    big: [0, 12, 43, 45],
    jackpot: [0, 0, 15, 85],
  }
  const w = table[kind]
  const total = w.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < w.length; i++) {
    r -= w[i]
    if (r < 0) return i
  }
  return 0
}

function finish(base: Omit<Outcome, 'teaser' | 'slowSteps'>): Outcome {
  const teaser = drawTeaser(base.kind)
  const slowSteps = teaser >= 3 ? 3 : teaser === 2 ? 2 : 0

  if (slowSteps === 0 || base.tenpai) {
    return { ...base, teaser, slowSteps }
  }

  // ロングリーチは1・2リールが揃っていないと成立しない。
  // ハズレなら揃えた上で3リール目を外す。それ以外は予告だけ出して這わせない。
  if (base.kind !== 'lose') {
    return { ...base, teaser, slowSteps: 0 }
  }
  const s = base.symbols[0]
  const last = pick(others(s).filter((x) => x !== 'CHERRY'))
  return {
    ...base,
    symbols: [s, s, last],
    stallSymbol: s,
    tenpai: true,
    teaser,
    slowSteps,
  }
}

export function drawOutcome(rush = false): Outcome {
  const odds = rush ? ODDS_RUSH : ODDS
  const r = Math.random()

  if (r < odds.jackpot) {
    return finish({
      kind: 'jackpot',
      symbols: ['SEVEN', 'SEVEN', 'SEVEN'],
      coins: PAYOUT.jackpot,
      tenpai: true,
      stallSymbol: pick(others('SEVEN')),
    })
  }

  if (r < odds.jackpot + odds.big) {
    const s = pick(SYMBOLS.filter((x) => x !== 'SEVEN'))
    return finish({
      kind: 'big',
      symbols: [s, s, s],
      coins: PAYOUT.big,
      tenpai: true,
      stallSymbol: pick(others(s)),
    })
  }

  if (r < odds.jackpot + odds.big + odds.small) {
    // チェリーがどこかに1つ以上。ただしゾロ目にはしない
    const at = Math.floor(Math.random() * 3)
    const trio = [0, 1, 2].map((i) =>
      i === at ? 'CHERRY' : pick(others('CHERRY')),
    ) as [Symbol, Symbol, Symbol]
    return finish({
      kind: 'small',
      symbols: trio,
      coins: PAYOUT.small,
      tenpai: at === 2,
      stallSymbol: pick(others(trio[2])),
    })
  }

  // ハズレ：ゾロ目でもチェリーでもない組み合わせ
  const noCherry = others('CHERRY')
  const tenpai = Math.random() < TENPAI_RATE
  if (tenpai) {
    const s = pick(noCherry)
    const last = pick(noCherry.filter((x) => x !== s))
    return finish({
      kind: 'lose',
      symbols: [s, s, last],
      coins: 0,
      tenpai: true,
      stallSymbol: s,
    })
  }

  let trio: [Symbol, Symbol, Symbol]
  do {
    trio = [pick(noCherry), pick(noCherry), pick(noCherry)]
  } while (trio[0] === trio[1] && trio[1] === trio[2])
  return finish({
    kind: 'lose',
    symbols: trio,
    coins: 0,
    tenpai: false,
    stallSymbol: pick(others(trio[2])),
  })
}
