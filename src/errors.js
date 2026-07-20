// When a handler registered with ipcMain.handle() throws, Electron's
// ipcRenderer.invoke() re-wraps it as something like:
//   "Error invoking remote method 'video:getInfo': Error: <original message>"
// That framing is meant for a developer reading a stack trace, not for
// text shown directly to the user — this strips it back down to the
// message the original Error was actually built with. Safe to run on any
// string: text that was never IPC-wrapped (e.g. errors thrown directly in
// the renderer) passes through untouched.
export function cleanErrorMessage(message) {
  if (typeof message !== 'string') return message;
  return message
    .trim()
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim();
}
