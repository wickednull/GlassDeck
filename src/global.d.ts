import type {
  ApiResult, AppState, LaunchFailure, ScanProgress, Toast,
} from './types'

export type GlassDeckApi = {
  getState: () => Promise<AppState>
  readLog: (id: string) => Promise<{ ok: boolean; log: string }>
  scan: () => Promise<ApiResult>
  launch: (id: string, extractMode?: boolean) => Promise<ApiResult>
  stop: (id: string) => Promise<ApiResult>
  favorite: (id: string, value: boolean) => Promise<ApiResult>
  rename: (id: string, name: string) => Promise<ApiResult>
  fixExecutable: (id: string) => Promise<ApiResult>
  reveal: (id: string) => Promise<ApiResult>
  remove: (id: string) => Promise<ApiResult>
  clearHidden: () => Promise<ApiResult>
  refresh: (id: string) => Promise<ApiResult>
  pickIcon: (id: string) => Promise<ApiResult>
  resetIcon: (id: string) => Promise<ApiResult>
  importApps: () => Promise<ApiResult>
  addPaths: (paths: string[]) => Promise<ApiResult>
  addFolder: () => Promise<ApiResult>
  removeFolder: (folder: string) => Promise<ApiResult>
  updateSettings: (patch: Partial<AppState['settings']>) => Promise<ApiResult>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  openExternal: (url: string) => Promise<ApiResult>
  copyText: (text: string) => Promise<ApiResult>
  pathForFile: (file: File) => string
  onState: (cb: (state: AppState) => void) => () => void
  onProgress: (cb: (progress: ScanProgress) => void) => () => void
  onToast: (cb: (toast: Toast) => void) => () => void
  onLaunchFailed: (cb: (failure: LaunchFailure) => void) => () => void
  onMaximized: (cb: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    glassdeck: GlassDeckApi
  }
}

export {}
