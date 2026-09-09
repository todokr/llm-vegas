export const TOKENS_PER_SPIN = 10_000

export const SYMBOLS = ['SEVEN', 'BAR', 'CHERRY', 'BELL', 'MELON', 'STAR'] as const
export type Symbol = (typeof SYMBOLS)[number]

export const GLYPH: Record<Symbol, string> = {
  SEVEN: '7',
  BAR: 'BAR',
  CHERRY: '🍒',
  BELL: '🔔',
  MELON: '🍉',
  STAR: '⭐',
}

/** 実機と同じで当落が先。リールはただの演出 */
export const ODDS = {
  jackpot: 0.012, // 777
  big: 0.05, // 7以外のゾロ目
  small: 0.14, // チェリー
} as const

/** RUSH 中は別テーブル。当たった後が本番 */
export const ODDS_RUSH = {
  jackpot: 0.04,
  big: 0.22,
  small: 0.3,
} as const

/** 大当たり後に突入する RUSH の継続回転数 */
export const RUSH_SPINS = {
  big: 10,
  jackpot: 30,
} as const

/**
 * 散財メーターの換算レート（USD / 100万 output トークン）。
 * ジョーク用のざっくり値なので、使っているモデルに合わせて変えていい。
 */
export const USD_PER_MTOK_OUTPUT = 75

export const PAYOUT = {
  small: 10,
  big: 200,
  jackpot: 7777,
} as const

/** ハズレのうち、これだけの割合をテンパイ煽りにする */
export const TENPAI_RATE = 0.3

/** 溜まった回転数がこれを超えたら高速消化（TURBO） */
export const RUSH_THRESHOLD = 5

/** 先読み予告の信頼度ラベル。数字が大きいほど当たりが近い */
export const TEASER_LABEL = ['', 'CHANCE', 'HOT!!', 'SUPER HOT!!!'] as const
