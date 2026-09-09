import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const from = path.join(root, 'src', 'renderer')
const to = path.join(root, 'dist', 'renderer')

fs.mkdirSync(to, { recursive: true })
for (const f of ['index.html', 'style.css', 'overlay.html']) {
  fs.copyFileSync(path.join(from, f), path.join(to, f))
}
console.log('copied html/css -> dist/renderer')
