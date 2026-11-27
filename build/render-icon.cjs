'use strict'

// Renders build/icon.html (our SVG logo) into build/icon.png at 512×512.
// Run with: npx electron build/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  })

  await win.loadFile(path.join(__dirname, 'icon.html'))
  await new Promise((resolve) => setTimeout(resolve, 600))

  const image = await win.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const out = path.join(__dirname, 'icon.png')
  fs.writeFileSync(out, image.toPNG())
  console.log('wrote', out, image.getSize())
  app.quit()
})
