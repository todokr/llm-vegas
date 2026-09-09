import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import { startWatcher } from './watcher'
import { loadStats, saveStats, type Stats } from './store'

const WIN_W = 380
const WIN_H = 400

let win: BrowserWindow | null = null
let overlay: BrowserWindow | null = null
let overlayTimer: NodeJS.Timeout | null = null
let normalBounds = { x: 0, y: 0, width: WIN_W, height: WIN_H }
let expanded = false

// 音を出すのに操作を要求されると自動回転の意味がなくなる
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function createWindow(): void {
  const area = screen.getPrimaryDisplay().workArea
  normalBounds = {
    x: area.x + area.width - WIN_W - 24,
    y: area.y + 24,
    width: WIN_W,
    height: WIN_H,
  }

  win = new BrowserWindow({
    ...normalBounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  // 他アプリの上、フルスクリーンアプリの上にも出す
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))

  // LLM_DEBUG=1 で描画側のログを拾い、起動直後に空回しする
  if (process.env.LLM_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`)
    })
    win.webContents.on('did-finish-load', () => {
      if (process.env.LLM_DEBUG === 'audit') {
        setTimeout(() => {
          void win?.webContents
            .executeJavaScript('__stripAudit(3000)')
            .then((r) => console.log('[audit]', r))
        }, 600)
      } else if (process.env.LLM_DEBUG === 'rush') {
        // RUSH の見た目だけを確認する
        setTimeout(() => {
          void win?.webContents
            .executeJavaScript(
              `document.getElementById('machine').classList.add('rush-mode');
               getComputedStyle(document.querySelector('.dancers')).display`,
            )
            .then((r) => console.log('[rush] dancers display =', r))
        }, 800)
      } else if (process.env.LLM_DEBUG === 'jackpot') {
        setTimeout(() => void win?.webContents.executeJavaScript('__forceJackpot()'), 800)
      } else {
        setTimeout(() => win?.webContents.send('tokens:delta', 30_000), 800)
      }
    })
  }
}

/**
 * デスクトップ全体を縁取るネオン枠。
 * クリックスルーなので、光っている間も作業は止まらない。
 */
function ensureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  const base = win?.getBounds() ?? normalBounds
  const display = screen.getDisplayMatching(base).bounds

  overlay = new BrowserWindow({
    ...display,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  overlay.setIgnoreMouseEvents(true, { forward: true })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'))
  return overlay
}

function showOverlay(ms: number): void {
  const o = ensureOverlay()
  o.showInactive()
  if (overlayTimer) clearTimeout(overlayTimer)
  overlayTimer = setTimeout(() => {
    if (o && !o.isDestroyed()) o.hide()
  }, ms)
}

/** 777 のときだけ画面全体に膨張する。作業は数秒間止まる（仕様） */
function expandForJackpot(): void {
  if (!win || expanded) return
  expanded = true
  normalBounds = win.getBounds()
  const display = screen.getDisplayMatching(normalBounds).bounds
  win.setBounds(display)
  // 膨張しても筐体が同じ場所に居座るよう、元の位置をディスプレイ相対で渡す
  win.webContents.send('window:expanded', {
    x: normalBounds.x - display.x,
    y: normalBounds.y - display.y,
    width: normalBounds.width,
    height: normalBounds.height,
  })
}

function restoreWindow(): void {
  if (!win || !expanded) return
  expanded = false
  win.setBounds(normalBounds)
  win.webContents.send('window:restored')
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('stats:load', (): Stats => loadStats())
  ipcMain.on('stats:save', (_e, stats: Stats) => saveStats(stats))
  ipcMain.on('overlay:show', (_e, ms: number) => showOverlay(ms))
  ipcMain.on('window:expand', () => expandForJackpot())
  ipcMain.on('window:restore', () => restoreWindow())
  ipcMain.on('app:quit', () => app.quit())

  startWatcher((outputTokens) => {
    win?.webContents.send('tokens:delta', outputTokens)
  }, {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
