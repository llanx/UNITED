import type { IpcMain } from 'electron'

/**
 * Register crypto utility IPC handlers.
 * 01-04: No handlers registered yet. Real crypto operations (key derivation,
 * encryption helpers) will be added in 01-06 when sodium-native is wired up.
 */
export function registerCryptoHandlers(_ipcMain: IpcMain): void {
  // Intentionally empty — crypto operations are handled inline in auth.ts
  // stubs for 01-04. This module exists so index.ts can call register*
  // uniformly for all IPC domains.
}
