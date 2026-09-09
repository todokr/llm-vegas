import { contextBridge, ipcRenderer } from 'electron'

export type Stats = {
  totalSpins: number
  totalTokens: number
  smallWins: number
  bigWins: number
  jackpots: number
}

contextBridge.exposeInMainWorld('tokenSlot', {
  onTokens: (cb: (n: number) => void) => {
    ipcRenderer.on('tokens:delta', (_e, n: number) => cb(n))
  },
  loadStats: (): Promise<Stats> => ipcRenderer.invoke('stats:load'),
  saveStats: (stats: Stats): void => ipcRenderer.send('stats:save', stats),
  showOverlay: (ms: number): void => ipcRenderer.send('overlay:show', ms),
  expandWindow: (): void => ipcRenderer.send('window:expand'),
  restoreWindow: (): void => ipcRenderer.send('window:restore'),
  onExpanded: (cb: (rect: { x: number; y: number; width: number; height: number }) => void) => {
    ipcRenderer.on('window:expanded', (_e, rect) => cb(rect))
  },
  onRestored: (cb: () => void) => {
    ipcRenderer.on('window:restored', () => cb())
  },
  quit: (): void => ipcRenderer.send('app:quit'),
})
