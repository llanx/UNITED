/**
 * IPC channel name constants shared between preload and main process handlers.
 * Using constants prevents typo bugs where ipcRenderer.invoke hangs silently
 * because no matching ipcMain.handle exists.
 */
export const IPC = {
  // Identity
  IDENTITY_CREATE: 'identity:create',
  IDENTITY_RECOVER: 'identity:recover-mnemonic',
  IDENTITY_UNLOCK: 'identity:unlock',

  // Auth
  AUTH_CONNECT: 'auth:connect',
  AUTH_REGISTER: 'auth:register',
  AUTH_SIGN_CHALLENGE: 'auth:sign-challenge',

  // TOTP
  TOTP_ENROLL: 'totp:enroll',
  TOTP_VERIFY: 'totp:verify',

  // Server
  SERVER_INFO: 'server:info',
  SERVER_UPDATE_SETTINGS: 'server:update-settings',

  // Storage
  STORAGE_HAS_IDENTITY: 'storage:has-identity',
  STORAGE_GET_ACTIVE_SERVER: 'storage:get-active-server',
  STORAGE_GET_CHANNELS: 'storage:get-channels',
  STORAGE_GET_CACHED_STATE: 'storage:get-cached-state',
  STORAGE_SET_CACHED_STATE: 'storage:set-cached-state',

  // Provisioning
  PROVISIONING_START: 'provisioning:start',
  PROVISIONING_CANCEL: 'provisioning:cancel',
  PROVISIONING_RECEIVE: 'provisioning:receive',

  // Push events (main -> renderer)
  PUSH_CONNECTION_STATUS: 'connection:status',
  PUSH_AUTH_ERROR: 'auth:error',
  PUSH_SERVER_INFO_UPDATE: 'server:info-update',
} as const
