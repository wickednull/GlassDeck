'use strict'

/**
 * GlassDeck — main process
 *
 * Responsibilities:
 *  - discover .AppImage files in user-defined folders
 *  - read real app metadata (name/comment/category/icon) straight out of the
 *    embedded squashfs filesystem via `unsquashfs` (no full extraction)
 *  - launch / stop AppImages and track what's running
 *  - persist a small JSON library in ~/.config/GlassDeck
 */

const {
  app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu, clipboard,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = fs.promises
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')

app.setName('GlassDeck')
Menu.setApplicationMenu(null)

const CONFIG_DIR = app.getPath('userData')
const LIB_FILE = path.join(CONFIG_DIR, 'library.json')
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json')
const ICON_DIR = path.join(CONFIG_DIR, 'icons')
const LOG_DIR = path.join(CONFIG_DIR, 'logs')

const APP_ID = 'dev.glassdeck.launcher'
const MAX_SCAN_DEPTH = 4
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'squashfs-root', 'AppDir', 'resources', '.cache',
  '__pycache__', 'site-packages', 'venv', '.venv',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  folders: [],
  theme: 'dark',
  accent: 'blue',
  sort: 'name',
  view: 'grid',
  reduceMotion: false,
  ambientMotion: false,
  extractFallback: false,
  scanDepth: 3,
}

let settings = { ...DEFAULT_SETTINGS }
let library = { version: 1, apps: {}, ignored: [] }
let running = new Map() // id -> { pid, startedAt, extractMode }
let launchSeq = 0
let scanning = false
let scanPromise = null
let scanQueued = false
let toastSeq = 0

/* ------------------------------------------------------------------ */
/* small fs helpers                                                    */
/* ------------------------------------------------------------------ */

function ensureDirs () {
  for (const dir of [CONFIG_DIR, ICON_DIR, LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function readJson (file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson (file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2))
  await fsp.rename(tmp, file)
}

async function saveLibrary () { await writeJson(LIB_FILE, library) }
async function saveSettings () { await writeJson(SETTINGS_FILE, settings) }

function appId (file) {
  return crypto.createHash('sha1').update(file).digest('hex').slice(0, 12)
}

function expandHome (p) {
  if (!p) return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

function prettyPath (p) {
  const home = os.homedir()
  const abs = expandHome(p)
  return abs === home ? '~' : abs.startsWith(home + path.sep) ? '~' + abs.slice(home.length) : abs
}

function isExecutable (file) {
  try { fs.accessSync(file, fs.constants.X_OK); return true } catch { return false }
}

function iconExists (file) {
  if (!file) return false
  try { return fs.statSync(path.join(ICON_DIR, file)).isFile() } catch { return false }
}

function safeIconName (id, ext) {
  return `${id}${ext ? '.' + ext.replace(/^\./, '') : ''}`
}

/* ------------------------------------------------------------------ */
/* settings / library bootstrap                                        */
/* ------------------------------------------------------------------ */

function defaultFolders () {
  const candidates = ['~/Applications', '~/Downloads', '~/Games', '~/Desktop', '~/.local/bin']
  const existing = candidates.filter((p) => {
    try { return fs.statSync(expandHome(p)).isDirectory() } catch { return false }
  })
  return existing.length ? existing : ['~/Applications']
}

async function loadStore () {
  ensureDirs()

  const saved = await readJson(SETTINGS_FILE, null)
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) }
  if (!Array.isArray(settings.folders) || settings.folders.length === 0) {
    settings.folders = defaultFolders()
  }
  settings.folders = [...new Set(settings.folders.map((f) => prettyPath(expandHome(f))))]

  const savedLib = await readJson(LIB_FILE, null)
  if (savedLib && typeof savedLib === 'object' && savedLib.apps) {
    library = {
      version: 1,
      apps: savedLib.apps || {},
      ignored: Array.isArray(savedLib.ignored) ? savedLib.ignored : [],
    }
  }

  await saveSettings()
}

/* ------------------------------------------------------------------ */
/* AppImage introspection                                              */
/* ------------------------------------------------------------------ */

function execFileAsync (cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 48 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }))
      resolve({ stdout, stderr })
    })
  })
}

function hasTool (cmd, arg = '-version') {
  return new Promise((resolve) => {
    execFile(cmd, [arg], { timeout: 4000 }, (err) => {
      // Some tools print version info and still exit non-zero.
      if (err && err.code === 'ENOENT') return resolve(false)
      resolve(true)
    })
  })
}

/** AppImage type 2 = ELF runtime + squashfs. The squashfs superblock magic
 *  'hsqs' can appear in the runtime too, so try candidates newest-first and
 *  keep the one that actually lists. */
async function findSquashfsOffset (file) {
  let handle
  try {
    handle = await fsp.open(file, 'r')
    const size = (await handle.stat()).size
    const probe = Buffer.alloc(Math.min(16 * 1024 * 1024, size))
    await handle.read(probe, 0, probe.length, 0)

    const candidates = []
    let at = 0
    while (true) {
      const idx = probe.indexOf('hsqs', at)
      if (idx === -1) break
      if (idx + 96 < size) candidates.push(idx)
      at = idx + 4
    }
    for (const off of candidates.reverse()) {
      try {
        await execFileAsync('unsquashfs', ['-o', String(off), '-l', file], { timeout: 12000 })
        return off
      } catch { /* not a real superblock */ }
    }
  } catch {
    /* unreadable */
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
  return null
}

async function listSquashfs (file, offset) {
  const { stdout } = await execFileAsync('unsquashfs', ['-o', String(offset), '-l', file])
  return stdout
    .split('\n')
    .map((line) => {
      const i = line.indexOf('squashfs-root/')
      return i === -1 ? null : line.slice(i + 'squashfs-root/'.length).trim()
    })
    .filter(Boolean)
}

async function catFile (file, offset, innerPath) {
  const { stdout } = await execFileAsync(
    'unsquashfs', ['-o', String(offset), '-cat', file, innerPath],
    { maxBuffer: 12 * 1024 * 1024, encoding: 'buffer' },
  )
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'binary')
}

function parseDesktopEntry (text) {
  const out = {}
  let inEntry = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) { inEntry = line === '[Desktop Entry]'; continue }
    if (!inEntry) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key || key.includes('[')) continue // skip localized keys
    if (!(key in out)) out[key] = line.slice(eq + 1).trim()
  }
  return out
}

const CATEGORY_MAP = {
  Game: 'Game', AudioVideo: 'Media', Audio: 'Media', Video: 'Media',
  Graphics: 'Graphics', Development: 'Development', Network: 'Network',
  Office: 'Office', Utility: 'Utility', System: 'System', Education: 'Education',
  Science: 'Science', Settings: 'System', Qt: 'Utility', KDE: 'Utility', GTK: 'Utility',
}

function niceCategory (categories) {
  for (const raw of categories) {
    const key = raw.replace(/;$/, '')
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key]
  }
  return 'App'
}

function cleanFilenameName (file) {
  return path.basename(file)
    .replace(/\.appimage$/i, '')
    .replace(/([-_.])(x86[_-]64|amd64|aarch64|arm64|i[3-6]86|linux|universal)\b.*$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled App'
}

function guessVersion (file) {
  const base = path.basename(file).replace(/\.appimage$/i, '')
  const matches = base.match(/\d+\.\d+(?:\.\d+){0,2}/g)
  return matches ? matches[matches.length - 1] : undefined
}

function isImageEntry (p) {
  const base = path.basename(p).toLowerCase()
  return base === '.diricon' || /\.(png|svg|jpe?g|webp)$/i.test(base)
}

function iconExt (p, buf) {
  const base = path.basename(p).toLowerCase()
  if (base.endsWith('.png')) return 'png'
  if (base.endsWith('.svg')) return 'svg'
  if (base.endsWith('.jpg') || base.endsWith('.jpeg')) return 'jpg'
  if (base.endsWith('.webp')) return 'webp'
  if (buf && buf[0] === 0x89 && buf[1] === 0x50) return 'png'
  if (buf && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf && /^\s*</.test(buf.slice(0, 64).toString('utf8'))) return 'svg'
  return null
}

function scoreIcon (p, iconName, slug) {
  const base = path.basename(p)
  const low = base.toLowerCase()
  const ext = path.extname(low).slice(1)
  const stem = ext ? base.slice(0, -(ext.length + 1)) : base
  let score = 0

  if (iconName && stem.toLowerCase() === iconName.toLowerCase()) score += 1000
  else if (low === '.diricon') score += 800
  else if (slug && stem.toLowerCase() === slug.toLowerCase()) score += 500
  else if (slug && stem.toLowerCase().includes(slug.toLowerCase())) score += 200

  const dim = p.match(/(\d{2,4})x\1/)
  if (dim) {
    const n = Number(dim[1])
    score += n >= 512 ? 90 : n >= 256 ? 85 : n >= 128 ? 70 : n >= 64 ? 40 : 15
  }

  if (ext === 'png') score += 40
  else if (ext === 'svg') score += 32
  else if (ext === 'webp') score += 10
  else score -= 5

  if (!p.includes('/')) score += 20 // AppDir root icons win ties
  if (p.startsWith('usr/share/icons/hicolor/')) score += 5
  return score
}

function looksLikeImage (buf, ext) {
  if (!buf || buf.length < 20) return false
  if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50
  if (ext === 'jpg') return buf[0] === 0xff && buf[1] === 0xd8
  if (ext === 'webp') return buf.slice(0, 4).toString('ascii') === 'RIFF'
  if (ext === 'svg') {
    const head = buf.slice(0, 512).toString('utf8').trim()
    return head.startsWith('<') && /<svg[\s>]/i.test(buf.slice(0, 4096).toString('utf8'))
  }
  return false
}

async function extractIcon (file, offset, listing, iconName, slug, id) {
  const candidates = listing
    .filter(isImageEntry)
    .map((p) => ({ p, score: scoreIcon(p, iconName, slug) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  for (const { p } of candidates) {
    try {
      const buf = await catFile(file, offset, p)
      const ext = iconExt(p, buf)
      if (!ext || !looksLikeImage(buf, ext)) continue
      if (buf.length < 48) continue
      const name = `${id}.${ext}`
      await fsp.writeFile(path.join(ICON_DIR, name), buf)
      return name
    } catch { /* try next */ }
  }
  return null
}

async function readAppImageMeta (file, id) {
  const base = {
    name: cleanFilenameName(file),
    comment: '',
    genericName: '',
    categories: [],
    category: 'App',
    version: guessVersion(file),
    iconFile: null,
    detailed: false,
  }

  let offset = null
  try { offset = await findSquashfsOffset(file) } catch { /* ignore */ }
  if (offset == null) return base

  let listing = []
  try { listing = await listSquashfs(file, offset) } catch { return base }

  const desktopFiles = listing
    .filter((p) => p.toLowerCase().endsWith('.desktop'))
    .sort((a, b) => {
      const aRoot = a.includes('/') ? 1 : 0
      const bRoot = b.includes('/') ? 1 : 0
      return aRoot - bRoot || a.length - b.length
    })

  let entry = {}
  if (desktopFiles.length) {
    for (const candidate of desktopFiles.slice(0, 3)) {
      try {
        const text = (await catFile(file, offset, candidate)).toString('utf8')
        const parsed = parseDesktopEntry(text)
        if (parsed.Name || parsed.Icon) { entry = parsed; break }
      } catch { /* try next */ }
    }
  }

  if (entry.Name) base.name = entry.Name
  if (entry.Comment) base.comment = entry.Comment
  if (entry.GenericName) base.genericName = entry.GenericName
  if (entry.Categories) {
    base.categories = entry.Categories.split(';').filter(Boolean)
    base.category = niceCategory(base.categories)
  }
  if (entry['X-AppImage-Version']) base.version = entry['X-AppImage-Version']
  else if (entry.Version) base.version = entry.Version

  const iconName = entry.Icon ? path.basename(entry.Icon).replace(/\.(png|svg|xpm)$/i, '') : null
  const slug = cleanFilenameName(file).split(' ')[0].toLowerCase()
  base.iconFile = await extractIcon(file, offset, listing, iconName, slug, id)
  base.detailed = true
  return base
}

/* ------------------------------------------------------------------ */
/* scanning                                                            */
/* ------------------------------------------------------------------ */

async function walkForAppImages (dir, depth, out) {
  if (depth < 0) return
  let entries
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.local') continue
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walkForAppImages(full, depth - 1, out)
    } else if (entry.isFile() && /\.appimage$/i.test(entry.name)) {
      out.add(full)
    }
  }
}

async function pMap (items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

function emitProgress (payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('scan:progress', payload)
  }
}

function emitToast (toast) {
  const payload = { id: ++toastSeq, ...toast }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('toast', payload)
  }
}

function emitLaunchFailure (payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('launch:failed', payload)
  }
}

async function scanLibrary () {
  if (scanPromise) { scanQueued = true; return scanPromise }

  scanPromise = (async () => {
    scanning = true
    emitProgress({ phase: 'start' })
    broadcast()

    const found = new Set()
    for (const folder of settings.folders) {
      await walkForAppImages(expandHome(folder), Math.min(settings.scanDepth ?? 3, MAX_SCAN_DEPTH), found)
    }
    for (const entry of Object.values(library.apps)) {
      if (entry.source === 'manual') found.add(entry.path)
    }

    const files = []
    const seenPaths = new Set()
    const seenContent = new Set()
    for (const file of found) {
      if (library.ignored.includes(file)) continue
      try {
        const st = await fsp.stat(file)
        if (!st.isFile()) continue
        // Same AppImage downloaded in two folders: show it once.
        const fingerprint = `${path.basename(file).toLowerCase()}:${st.size}`
        if (seenContent.has(fingerprint)) continue
        seenContent.add(fingerprint)
        if (seenPaths.has(file)) continue
        seenPaths.add(file)
        files.push({ path: file, size: st.size, mtimeMs: st.mtimeMs })
      } catch { /* gone */ }
    }

    // prune entries that disappeared
    const alive = new Set(files.map((f) => f.path))
    for (const [id, entry] of Object.entries(library.apps)) {
      if (!alive.has(entry.path)) {
        delete library.apps[id]
        await removeIconFile(entry.iconFile)
        await removeIconFile(entry.customIconFile)
      }
    }

    let done = 0
    await pMap(files, 4, async (file) => {
      const id = appId(file.path)
      const metaKey = `${file.size}:${Math.round(file.mtimeMs)}`
      const existing = library.apps[id]
      let entry = existing

      const needsMeta = !existing ||
        existing.metaKey !== metaKey ||
        !iconExists(existing.iconFile)

      if (needsMeta) {
        const oldIcon = existing?.iconFile
        const meta = await readAppImageMeta(file.path, id)
        if (oldIcon && oldIcon !== meta.iconFile) await removeIconFile(oldIcon)
        entry = {
          id,
          path: file.path,
          source: existing?.source ?? 'scan',
          addedAt: existing?.addedAt ?? Date.now(),
          favorite: existing?.favorite ?? false,
          customName: existing?.customName,
          customIconFile: existing?.customIconFile,
          lastPlayed: existing?.lastPlayed,
          launchCount: existing?.launchCount ?? 0,
          ...meta,
          size: file.size,
          mtimeMs: file.mtimeMs,
          metaKey,
          executable: isExecutable(file.path),
        }
        library.apps[id] = entry
      } else {
        entry.size = file.size
        entry.mtimeMs = file.mtimeMs
        entry.executable = isExecutable(file.path)
      }

      done += 1
      emitProgress({ phase: 'enrich', done, total: files.length, name: entry.name })
    })

    await saveLibrary()
    emitProgress({ phase: 'done', total: files.length })
    broadcast()
    return buildState()
  })().finally(() => {
    scanning = false
    scanPromise = null
    broadcast()
    if (scanQueued) {
      scanQueued = false
      setTimeout(() => { scanLibrary().catch(() => {}) }, 100)
    }
  })

  return scanPromise
}

async function removeIconFile (file) {
  if (!file) return
  try { await fsp.unlink(path.join(ICON_DIR, file)) } catch { /* fine */ }
}

/* ------------------------------------------------------------------ */
/* view state                                                          */
/* ------------------------------------------------------------------ */

function displayName (entry) {
  return entry.customName || entry.name
}

function publicApp (entry) {
  const { metaKey, ...rest } = entry
  void metaKey
  return {
    ...rest,
    name: displayName(entry),
    originalName: entry.name,
    iconFile: entry.customIconFile || entry.iconFile,
    running: running.has(entry.id),
    runningSince: running.get(entry.id)?.startedAt,
  }
}

function buildState () {
  const apps = Object.values(library.apps)
    .filter((a) => !library.ignored.includes(a.path))
    .map(publicApp)

  const folders = settings.folders.map((folder) => {
    const abs = expandHome(folder)
    let display = prettyPath(folder)
    let exists = false
    try { exists = fs.statSync(abs).isDirectory() } catch { /* missing */ }
    const count = apps.filter((a) => a.path.startsWith(abs + path.sep)).length
    return { path: folder, display, exists, count }
  })

  return {
    apps,
    settings,
    folders,
    stats: {
      total: apps.length,
      favorites: apps.filter((a) => a.favorite).length,
      running: running.size,
      size: apps.reduce((sum, a) => sum + (a.size || 0), 0),
    },
    version: app.getVersion(),
    platform: process.platform,
    home: os.homedir(),
    scanning,
  }
}

function broadcast () {
  if (!BrowserWindow.getAllWindows().length) return
  const state = buildState()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('state', state)
  }
}

/* ------------------------------------------------------------------ */
/* launching                                                           */
/* ------------------------------------------------------------------ */

function logTail (id, lines = 24) {
  try {
    const file = path.join(LOG_DIR, `${id}.log`)
    if (!fs.existsSync(file)) return ''
    const buf = fs.readFileSync(file)
    const text = buf.slice(Math.max(0, buf.length - 8192)).toString('utf8')
    return text.split('\n').slice(-lines).join('\n').trim()
  } catch { return '' }
}

function launchApp (id, opts = {}) {
  const entry = library.apps[id]
  if (!entry) return { ok: false, code: 'NOT_FOUND', message: 'App not found in library' }
  if (running.has(id)) return { ok: false, code: 'ALREADY_RUNNING', message: `${displayName(entry)} is already running` }
  if (!fs.existsSync(entry.path)) return { ok: false, code: 'MISSING', message: 'The AppImage no longer exists' }
  if (!isExecutable(entry.path)) return { ok: false, code: 'NOT_EXECUTABLE', message: `${displayName(entry)} is not executable` }

  const logFile = path.join(LOG_DIR, `${id}.log`)
  let logFd = null
  try {
    try {
      const stat = fs.statSync(logFile)
      if (stat.size > 512 * 1024) fs.truncateSync(logFile, 0)
    } catch { /* no log yet */ }
    logFd = fs.openSync(logFile, 'a')
    fs.writeSync(logFd, `\n\n──── ${new Date().toISOString()} launch ────\n`)
  } catch { logFd = null }

  const extractMode = !!opts.extractMode || !!settings.extractFallback
  const env = { ...process.env }
  if (extractMode) env.APPIMAGE_EXTRACT_AND_RUN = '1'

  let child
  try {
    child = spawn(entry.path, [], {
      cwd: path.dirname(entry.path),
      detached: true,
      stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
      env,
    })
  } catch (err) {
    if (logFd !== null) fs.closeSync(logFd)
    return { ok: false, code: 'SPAWN_FAILED', message: String(err.message || err) }
  }
  if (logFd !== null) { try { fs.closeSync(logFd) } catch {} }

  const startedAt = Date.now()
  const launchId = ++launchSeq
  running.set(id, { pid: child.pid, startedAt, extractMode, launchId })

  child.on('error', (err) => {
    const current = running.get(id)
    if (current && current.launchId === launchId) {
      running.delete(id)
      broadcast()
      emitToast({ kind: 'error', message: `Could not start ${displayName(entry)}`, detail: String(err.message || err) })
    }
  })

  child.on('exit', (code, signal) => {
    const current = running.get(id)
    if (!current || current.launchId !== launchId) return
    running.delete(id)
    const duration = Date.now() - startedAt
    broadcast()

    if (code !== 0 && duration < 6000) {
      const tail = logTail(id)
      const fuseIssue = /fuse|mount|squashfs|dlopen|GLIBC/i.test(tail)
      if (fuseIssue && !extractMode) {
        emitToast({ kind: 'info', message: `Retrying ${displayName(entry)} in extract mode…` })
        setTimeout(() => {
          const retry = launchApp(id, { extractMode: true })
          if (!retry.ok) emitLaunchFailure({ id, name: displayName(entry), code: retry.code, message: retry.message, fuse: true, log: tail })
        }, 250)
      } else {
        emitLaunchFailure({
          id,
          name: displayName(entry),
          code: 'EXIT_' + (code ?? signal),
          message: `${displayName(entry)} exited (${code ?? signal})`,
          fuse: fuseIssue,
          log: tail.slice(-1600),
        })
      }
    }
  })

  entry.lastPlayed = startedAt
  entry.launchCount = (entry.launchCount || 0) + 1
  saveLibrary().catch(() => {})
  broadcast()

  return { ok: true, pid: child.pid, extractMode, state: buildState() }
}

function stopApp (id) {
  const info = running.get(id)
  if (!info) return { ok: false, code: 'NOT_RUNNING', message: 'Not running' }

  const signal = (sig) => {
    try { process.kill(-info.pid, sig) } catch {
      try { process.kill(info.pid, sig) } catch { /* already gone */ }
    }
  }

  signal('SIGTERM')
  const timer = setTimeout(() => { if (running.has(id)) signal('SIGKILL') }, 4000)
  if (timer.unref) timer.unref()

  const check = setInterval(() => {
    if (!running.has(id)) { clearInterval(check); clearTimeout(timer) }
  }, 250)
  if (check.unref) check.unref()

  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* mutations                                                           */
/* ------------------------------------------------------------------ */

async function importPaths (paths) {
  const added = []
  for (const file of paths) {
    if (!/\.appimage$/i.test(file)) continue
    let st
    try { st = await fsp.stat(file); if (!st.isFile()) continue } catch { continue }
    const abs = path.resolve(file)
    const id = appId(abs)
    if (library.ignored.includes(abs)) library.ignored = library.ignored.filter((p) => p !== abs)
    const existing = library.apps[id]
    const meta = await readAppImageMeta(abs, id)
    library.apps[id] = {
      id,
      path: abs,
      source: 'manual',
      addedAt: existing?.addedAt ?? Date.now(),
      favorite: existing?.favorite ?? false,
      customName: existing?.customName,
      customIconFile: existing?.customIconFile,
      lastPlayed: existing?.lastPlayed,
      launchCount: existing?.launchCount ?? 0,
      ...meta,
      size: st.size,
      mtimeMs: st.mtimeMs,
      metaKey: `${st.size}:${Math.round(st.mtimeMs)}`,
      executable: isExecutable(abs),
    }
    added.push(id)
  }
  if (added.length) {
    await saveLibrary()
    broadcast()
  }
  return added
}

/* ------------------------------------------------------------------ */
/* window                                                              */
/* ------------------------------------------------------------------ */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'glassicon',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

let mainWindow = null

function createWindow () {
  const envSize = (process.env.GLASSDECK_SHOT_SIZE || '').split('x').map(Number)
  const width = envSize[0] > 600 ? envSize[0] : 1340
  const height = envSize[1] > 500 ? envSize[1] : 880

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 22 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  const sendMaximized = (value) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window:maximized', value)
  }
  mainWindow.on('maximize', () => sendMaximized(true))
  mainWindow.on('unmaximize', () => sendMaximized(false))

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev-only CSS injection, handy for profiling paint cost.
  if (process.env.GLASSDECK_EXTRA_CSS) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.insertCSS(process.env.GLASSDECK_EXTRA_CSS).catch(() => {})
    })
  }

  // Dev-only screenshot hook, used while polishing the UI.
  if (process.env.GLASSDECK_SHOT) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await sleep(Number(process.env.GLASSDECK_SHOT_DELAY || 3500))
      if (process.env.GLASSDECK_SHOT_JS) {
        try {
          const result = await mainWindow.webContents.executeJavaScript(process.env.GLASSDECK_SHOT_JS, true)
          if (result !== undefined) console.log('SHOT_JS_RESULT', JSON.stringify(result))
        } catch (err) { console.error('shot js failed', err) }
        await sleep(Number(process.env.GLASSDECK_SHOT_JS_DELAY || 1200))
      }
      try {
        const image = await mainWindow.capturePage()
        await fsp.writeFile(process.env.GLASSDECK_SHOT, image.toPNG())
      } catch (err) { console.error('shot failed', err) }
      app.quit()
    })
  }
}

function windowFromEvent (event) {
  return BrowserWindow.fromWebContents(event.sender)
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc () {
  ipcMain.handle('state:get', () => buildState())

  ipcMain.handle('scan', async () => {
    const state = await scanLibrary()
    return { ok: true, state }
  })

  ipcMain.handle('app:launch', (_e, { id, extractMode }) => launchApp(id, { extractMode }))
  ipcMain.handle('app:stop', (_e, { id }) => stopApp(id))

  ipcMain.handle('app:favorite', async (_e, { id, value }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    entry.favorite = typeof value === 'boolean' ? value : !entry.favorite
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:rename', async (_e, { id, name }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    const clean = String(name || '').trim().slice(0, 80)
    if (clean && clean !== entry.name) entry.customName = clean
    else delete entry.customName
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:fix-exec', async (_e, { id }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    try {
      await fsp.chmod(entry.path, 0o755)
      entry.executable = true
      await saveLibrary()
      broadcast()
      return { ok: true, state: buildState() }
    } catch (err) {
      return { ok: false, message: String(err.message || err) }
    }
  })

  ipcMain.handle('app:reveal', (_e, { id }) => {
    const entry = library.apps[id]
    if (entry) shell.showItemInFolder(entry.path)
    return { ok: true }
  })

  ipcMain.handle('app:remove', async (_e, { id }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    if (running.has(id)) stopApp(id)
    library.ignored = [...new Set([...library.ignored, entry.path])]
    delete library.apps[id]
    await removeIconFile(entry.iconFile)
    await removeIconFile(entry.customIconFile)
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:clear-hidden', async () => {
    library.ignored = []
    await saveLibrary()
    await scanLibrary()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:refresh', async (_e, { id }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    delete entry.metaKey
    await removeIconFile(entry.iconFile)
    entry.iconFile = null
    await scanLibrary()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:icon:pick', async (event, { id }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    const win = windowFromEvent(event)
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose an icon',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, code: 'CANCELED' }
    const src = result.filePaths[0]
    const ext = (path.extname(src).slice(1) || 'png').toLowerCase()
    const name = safeIconName(`${id}-custom-${Date.now()}`, ext)
    await removeIconFile(entry.customIconFile)
    await fsp.copyFile(src, path.join(ICON_DIR, name))
    entry.customIconFile = name
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('app:icon:reset', async (_e, { id }) => {
    const entry = library.apps[id]
    if (!entry) return { ok: false, message: 'Not found' }
    await removeIconFile(entry.customIconFile)
    delete entry.customIconFile
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('apps:import', async (event) => {
    const win = windowFromEvent(event)
    const result = await dialog.showOpenDialog(win, {
      title: 'Add AppImages to GlassDeck',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'AppImage', extensions: ['appimage', 'AppImage'] }],
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, code: 'CANCELED' }
    await importPaths(result.filePaths)
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('apps:add-paths', async (_e, { paths }) => {
    if (!Array.isArray(paths) || !paths.length) return { ok: false, message: 'No files' }
    const ids = await importPaths(paths)
    if (!ids.length) return { ok: false, message: 'No AppImages in that drop' }
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('folder:add', async (event) => {
    const win = windowFromEvent(event)
    const result = await dialog.showOpenDialog(win, {
      title: 'Add a folder to scan',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, code: 'CANCELED' }
    const dir = prettyPath(result.filePaths[0])
    if (!settings.folders.includes(dir)) settings.folders.push(dir)
    await saveSettings()
    await scanLibrary()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('folder:remove', async (_e, { folder }) => {
    settings.folders = settings.folders.filter((f) => f !== folder)
    await saveSettings()
    // drop scanned entries that lived in that folder
    const abs = expandHome(folder)
    for (const [id, entry] of Object.entries(library.apps)) {
      if (entry.source === 'scan' && entry.path.startsWith(abs + path.sep)) delete library.apps[id]
    }
    await saveLibrary()
    broadcast()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('settings:update', async (_e, patch) => {
    if (!patch || typeof patch !== 'object') return { ok: false }
    const prevFolders = JSON.stringify(settings.folders)
    settings = { ...settings, ...patch }
    if (patch.folders) {
      settings.folders = [...new Set(patch.folders.map((f) => prettyPath(expandHome(f))))]
    }
    await saveSettings()
    broadcast()
    if (JSON.stringify(settings.folders) !== prevFolders) await scanLibrary()
    return { ok: true, state: buildState() }
  })

  ipcMain.handle('win:minimize', (event) => { windowFromEvent(event)?.minimize() })
  ipcMain.handle('win:toggle-max', (event) => {
    const win = windowFromEvent(event)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('win:close', (event) => { windowFromEvent(event)?.close() })
  ipcMain.handle('win:is-max', (event) => !!windowFromEvent(event)?.isMaximized())

  ipcMain.handle('shell:open', (_e, { url }) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url)
    return { ok: true }
  })

  ipcMain.handle('clipboard:write', (_e, { text }) => {
    clipboard.writeText(String(text ?? '').slice(0, 100000))
    return { ok: true }
  })

  ipcMain.handle('log:read', (_e, { id }) => ({ ok: true, log: logTail(id, 60) }))
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    protocol.handle('glassicon', async (request) => {
      try {
        const url = new URL(request.url)
        const file = decodeURIComponent(url.pathname.replace(/^\//, ''))
        if (!/^[a-zA-Z0-9._-]+$/.test(file) || path.basename(file) !== file) {
          return new Response('Bad icon', { status: 400 })
        }
        const abs = path.join(ICON_DIR, file)
        if (!abs.startsWith(ICON_DIR)) return new Response('Bad icon', { status: 400 })
        return net.fetch(pathToFileURL(abs).toString())
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })

    await loadStore()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // first scan in the background so the window paints instantly
    setTimeout(() => { scanLibrary().catch(() => {}) }, 350)

    setTimeout(async () => {
      if (!(await hasTool('unsquashfs'))) {
        emitToast({
          kind: 'info',
          message: 'Install squashfs-tools for icons & descriptions',
          detail: 'sudo apt install squashfs-tools — GlassDeck still works without it, using filenames only.',
        })
      }
    }, 2600)
  })

  app.on('window-all-closed', () => { app.quit() })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (app.isReady()) app.quit()
      else app.exit(0)
    })
  }

  app.on('before-quit', () => {
    for (const [id] of running) stopApp(id)
  })
}
