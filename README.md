# LLM Vegas

A slot machine that spins itself every time Claude burns 10,000 output tokens.

It sits on top of your screen while you work. You don't pull the lever — your coding agent does, by doing its job. Long agent runs turn into a rush of spins; a quiet afternoon turns into silence.

This is a joke toy. There is no account, no payout, and no way to cash out. The only thing you actually spend is tokens you were going to spend anyway.

## Requirements

- macOS (the window is frameless, transparent, and always-on-top; only tested here)
- Node.js 20+
- Claude Code, writing transcripts to `~/.claude/projects`

## Run

```bash
npm install
npm start
```

A small cabinet appears in the top-right corner and stays above every other window. Drag it by the marquee. `🔊` mutes everything, `🎵` toggles the music, `✕` quits.

Nothing is uploaded anywhere. The app reads local files and talks to no network.

## How it works

Claude Code appends every assistant turn to a JSONL transcript under `~/.claude/projects`. LLM Vegas polls those files once per second and counts **only the `output_tokens` that were appended since launch**.

- **10,000 output tokens = 1 spin.** Spins are queued and played automatically.
- **Cache reads are ignored.** They dwarf output by two orders of magnitude, and counting them would leave the reels permanently spinning.
- **Tokens burned while the app is closed don't count.** The file offsets are snapshotted at launch, so you can't bank spins overnight.
- Sub-agents and background workflows count too, which is why a single fan-out can trigger a burst.

When five or more spins are waiting, the machine enters `TURBO` and plays them at 2.4x speed.

## Odds

The draw happens **before the reels move**, exactly like a real machine. The reels are theater: the strips are rebuilt each spin so they land on the pre-drawn result. That is what makes reliable near-miss teasing possible.

| Result | Base | During LLM RUSH | Payout |
| --- | --- | --- | --- |
| Lose | 79.8% | 44% | 0 |
| Cherry | 14% | 30% | 10 |
| Three of a kind | 5% | 22% | 200 |
| 777 | 1.2% | 4% | 7777 |

Roughly one spin in five pays something. At a typical 50 spins per day, the jackpot lands every day or two.

**There is exactly one payline — the center row**, marked by the red line and the blinking ▶◀. The rows above and below are dimmed, and the reel strips are re-rolled whenever an off-payline row would accidentally show three of a kind. Otherwise you get the worst feeling in gambling: a win that isn't.

## The show

**Teasers.** Because the result is known before the reels spin, the machine can foreshadow it honestly. A confidence level of 0–3 is drawn from a weighted table per result — losses are usually 0, a jackpot is almost always 3. The level drives the cabinet color (blue → green → red), a cut-in (`CHANCE` / `HOT!!` / `SUPER HOT!!!`), a reverse-spin kickoff, and a voice line. Level 2 and up escalate into a long reach, where the third reel crawls forward one symbol at a time.

**LLM RUSH.** Any three-of-a-kind starts a 10-spin rush; a 777 starts a 30-spin one. During a rush the odds table is swapped for a much sweeter one, the cabinet pulses through the color wheel, and the music speeds up.

**Voice.** The OS speech synthesizer shouts `BIG WIN`, `JACKPOT`, `Super hot`, and follows a jackpot with `Seven! Seven! Seven!` and `Congratulations`.

**Desktop neon.** During any big win, a transparent click-through window traces a rainbow border around your entire display. It never steals focus and never blocks a click, so your work continues underneath.

**777.** Fade to black, cut-in, the cabinet lunges at the camera, then the window expands to fill the whole screen for several seconds — light pillars, a coin flood, and a counter rolling up to 7777. This one *does* take over your machine. That is the point.

**Burn meter.** A running dollar estimate of every output token you've spent, updated live. See the warning below.

## Everything is synthesized

There are no image files, no audio files, and no fonts in this repository.

- The reels are a real CSS 3D cylinder — six faces on `rotateX(i * 60deg) translateZ(r)`, with motion blur applied to the faces rather than the cylinder, because a `filter` on a `preserve-3d` element flattens it.
- Confetti, coins, and sparks are a small canvas particle system.
- Every sound — the motor whir, the reel clunks, the fanfares, and the four-bar background loop — is built at runtime with WebAudio oscillators and noise buffers.

## Configuration

Everything tunable lives in `src/renderer/config.ts`.

| Constant | Meaning |
| --- | --- |
| `TOKENS_PER_SPIN` | Output tokens required per spin |
| `ODDS` / `ODDS_RUSH` | Probability tables, normal and rush |
| `PAYOUT` | Coins awarded per result |
| `RUSH_SPINS` | Rush length after a win |
| `TENPAI_RATE` | Share of losses that get a near-miss tease |
| `RUSH_THRESHOLD` | Queued spins needed to enter TURBO |
| `USD_PER_MTOK_OUTPUT` | Burn meter conversion rate |

> **The burn meter is a gag, not a bill.** It multiplies your output tokens by a hard-coded rate (default $75 per million) that is not looked up from anywhere and is not tied to your plan, your model, or your actual usage. Do not treat that number as real spending.

## Development

```bash
npm run build         # compile main, preload, and renderer
npm run watch-test    # verify the watcher counts only post-launch appends
```

Debug entry points:

```bash
LLM_DEBUG=1 npm start         # inject 30,000 tokens at startup (3 spins)
LLM_DEBUG=jackpot npm start   # force a 777 immediately
LLM_DEBUG=audit npm start     # 3,000 simulated spins, printed as JSON
```

The audit checks the two invariants that matter: the center row always matches the drawn result, and no off-payline row ever shows a false three of a kind.

```
[audit] {"n":3000,"centerMismatch":0,"fakeRows":0,"teasers":[1846,739,294,121]}
```

In the app itself, double-click the cabinet to force a spin, or shift-double-click for a jackpot.

## Layout

```
src/main/index.ts      window creation, the 777 expansion, the neon overlay, IPC
src/main/watcher.ts    transcript polling and output-token accounting
src/main/store.ts      lifetime stats in userData/stats.json
src/renderer/          cabinet, reels, particles, synthesized audio, voice
```
