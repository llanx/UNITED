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

  // Channels
  CHANNELS_FETCH: 'channels:fetch',
  CHANNELS_CREATE: 'channels:create',
  CHANNELS_UPDATE: 'channels:update',
  CHANNELS_DELETE: 'channels:delete',
  CHANNELS_REORDER: 'channels:reorder',

  // Categories
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  CATEGORIES_REORDER: 'categories:reorder',

  // Members
  MEMBERS_FETCH: 'members:fetch',

  // Roles
  ROLES_FETCH: 'roles:fetch',
  ROLES_CREATE: 'roles:create',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',
  ROLES_ASSIGN: 'roles:assign',
  ROLES_REMOVE: 'roles:remove',
  ROLES_GET_USER: 'roles:get-user',

  // Invites
  INVITE_JOIN: 'invite:join',
  INVITE_VALIDATE: 'invite:validate',

  // P2P
  P2P_START_MESH: 'p2p:start-mesh',
  P2P_STOP_MESH: 'p2p:stop-mesh',
  P2P_SEND_TEST_MESSAGE: 'p2p:send-test-message',
  P2P_PING_PEER: 'p2p:ping-peer',
  P2P_FORCE_RECONNECT: 'p2p:force-reconnect',
  P2P_GET_STATS: 'p2p:get-stats',
  P2P_PANEL_OPEN: 'p2p:panel-open',
  P2P_PANEL_CLOSE: 'p2p:panel-close',

  // Chat messages
  CHAT_SEND: 'chat:send',
  CHAT_FETCH_HISTORY: 'chat:fetch-history',
  CHAT_EDIT: 'chat:edit',
  CHAT_DELETE: 'chat:delete',

  // Reactions
  REACTIONS_ADD: 'reactions:add',
  REACTIONS_REMOVE: 'reactions:remove',
  REACTIONS_FETCH: 'reactions:fetch',

  // Presence
  PRESENCE_SET: 'presence:set',
  PRESENCE_FETCH: 'presence:fetch',

  // Last read / unread
  LAST_READ_UPDATE: 'last-read:update',
  LAST_READ_FETCH: 'last-read:fetch',

  // Notifications
  NOTIFICATIONS_SET_PREFS: 'notifications:set-prefs',
  NOTIFICATIONS_SHOW: 'notifications:show',

  // Direct Messages
  DM_PUBLISH_KEY: 'dm:publish-key',
  DM_LIST_CONVERSATIONS: 'dm:list-conversations',
  DM_CREATE_CONVERSATION: 'dm:create-conversation',
  DM_SEND_MESSAGE: 'dm:send-message',
  DM_FETCH_HISTORY: 'dm:fetch-history',
  DM_FETCH_OFFLINE: 'dm:fetch-offline',
  DM_DELETE_LOCAL: 'dm:delete-local',
  DM_GET_PEER_KEY_STATUS: 'dm:get-peer-key-status',
  DM_BLOCK_USER: 'dm:block-user',
  DM_UNBLOCK_USER: 'dm:unblock-user',

  // Push events (main -> renderer)
  PUSH_CONNECTION_STATUS: 'connection:status',
  PUSH_AUTH_ERROR: 'auth:error',
  PUSH_SERVER_INFO_UPDATE: 'server:info-update',
  PUSH_CHANNEL_EVENT: 'channels:event',
  PUSH_ROLE_EVENT: 'roles:event',
  PUSH_DEEP_LINK: 'deep-link:invite',
  PUSH_P2P_STATS: 'p2p:stats',
  PUSH_P2P_MESSAGE: 'p2p:message',
  PUSH_CHAT_EVENT: 'chat:event',
  PUSH_TYPING_EVENT: 'typing:event',
  PUSH_PRESENCE_EVENT: 'presence:event',
  PUSH_DM_EVENT: 'dm:event',
  PUSH_DM_KEY_ROTATED: 'dm:key-rotated',
} as const
