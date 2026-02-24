import type { IpcMain } from 'electron'
import { IPC } from './channels'
import type {
  IdentityCreateResult,
  IdentityUnlockResult,
  RegisterResult,
  TotpEnrollResult
} from '@shared/ipc-bridge'

/**
 * Register identity and auth IPC handlers.
 * 01-04: All handlers return mock data. Real crypto in 01-06.
 */
export function registerAuthHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.IDENTITY_CREATE, async (_event, _passphrase: string): Promise<IdentityCreateResult> => {
    return {
      fingerprint: 'UNITED-AAAAA-BBBBB-CCCCC-DDDDD',
      publicKey: new Uint8Array(32).fill(1),
      mnemonic: Array.from({ length: 24 }, (_, i) => `word${i + 1}`)
    }
  })

  ipcMain.handle(IPC.IDENTITY_RECOVER, async (_event, _words: string[], _passphrase: string): Promise<IdentityCreateResult> => {
    return {
      fingerprint: 'UNITED-AAAAA-BBBBB-CCCCC-DDDDD',
      publicKey: new Uint8Array(32).fill(1),
      mnemonic: Array.from({ length: 24 }, (_, i) => `word${i + 1}`)
    }
  })

  ipcMain.handle(IPC.IDENTITY_UNLOCK, async (_event, _passphrase: string): Promise<IdentityUnlockResult> => {
    return {
      fingerprint: 'UNITED-AAAAA-BBBBB-CCCCC-DDDDD',
      publicKey: new Uint8Array(32).fill(1)
    }
  })

  ipcMain.handle(IPC.AUTH_REGISTER, async (_event, _displayName: string, _setupToken?: string): Promise<RegisterResult> => {
    return { userId: 'mock-user-id-01' }
  })

  ipcMain.handle(IPC.AUTH_SIGN_CHALLENGE, async (_event, _challenge: Uint8Array): Promise<Uint8Array> => {
    return new Uint8Array(64).fill(2)
  })

  ipcMain.handle(IPC.TOTP_ENROLL, async (): Promise<TotpEnrollResult> => {
    return {
      secret: 'MOCKBASE32SECRET',
      otpauthUri: 'otpauth://totp/UNITED:mock@server?secret=MOCKBASE32SECRET',
      qrPng: new Uint8Array(0)
    }
  })

  ipcMain.handle(IPC.TOTP_VERIFY, async (_event, _code: string): Promise<boolean> => {
    return true
  })
}
