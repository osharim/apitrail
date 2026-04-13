function isTTY(): boolean {
  const proc = globalThis.process as NodeJS.Process | undefined
  if (proc?.env?.NO_COLOR) return false
  if (proc?.env?.FORCE_COLOR) return true
  return Boolean(proc?.['stdout']?.['isTTY'])
}

const enabled = isTTY()

const wrap =
  (open: number, close: number) =>
  (s: string | number): string =>
    enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s)

export const bold = wrap(1, 22)
export const dim = wrap(2, 22)
export const red = wrap(31, 39)
export const green = wrap(32, 39)
export const yellow = wrap(33, 39)
export const blue = wrap(34, 39)
export const magenta = wrap(35, 39)
export const cyan = wrap(36, 39)
export const gray = wrap(90, 39)
