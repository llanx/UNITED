import { contextBridge, ipcRenderer } from 'electron'
import type {
  UnitedAPI, ServerInfo, ServerSettings, StorageAPI,
  ChannelEvent, RoleEvent, P2PStats,
  ChatMessage, ChatHistoryResponse, ChatEvent,
  ReactionSummary, PresenceUpdate, TypingEvent, NotificationPrefs,
  DmEvent,
  BlockStorageUsage, BlockStoreConfig,
  NetworkStats,
  FileAttachment, UploadProgress,
  VoiceEvent
} from '@shared/ipc-bridge'
import type { ConnectionStatus } from '@shared/ws-protocol'
import { IPC } from '../main/ipc/channels'

const storageApi: StorageAPI = {
  hasIdentity: () =>
    ipcRenderer.invoke(IPC.STORAGE_HAS_IDENTITY),

  getActiveServer: () =>
    ipcRenderer.invoke(IPC.STORAGE_GET_ACTIVE_SERVER),

  getChannels: (serverId: string) =>
    ipcRenderer.invoke(IPC.STORAGE_GET_CHANNELS, serverId),

  getCachedState: <T>(key: string) =>
    ipcRenderer.invoke(IPC.STORAGE_GET_CACHED_STATE, key) as Promise<T | null>,

  setCachedState: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPC.STORAGE_SET_CACHED_STATE, key, value),
}

const api: UnitedAPI = {
  // Identity
  createIdentity: (passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_CREATE, passphrase),

  recoverFromMnemonic: (words: string[], passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_RECOVER, words, passphrase),

  unlockIdentity: (passphrase: string) =>
    ipcRenderer.invoke(IPC.IDENTITY_UNLOCK, passphrase),

  // Connection & Auth
  connectToServer: (url: string) =>
    ipcRenderer.invoke(IPC.AUTH_CONNECT, url),

  connectWs: () =>
    ipcRenderer.invoke(IPC.CONNECT_WS),

  register: (displayName: string, setupToken?: string) =>
    ipcRenderer.invoke(IPC.AUTH_REGISTER, displayName, setupToken),

  signChallenge: (challenge: Uint8Array) =>
    ipcRenderer.invoke(IPC.AUTH_SIGN_CHALLENGE, challenge),

  // TOTP
  enrollTotp: () =>
    ipcRenderer.invoke(IPC.TOTP_ENROLL),

  verifyTotp: (code: string) =>
    ipcRenderer.invoke(IPC.TOTP_VERIFY, code),

  // Server
  getServerInfo: () =>
    ipcRenderer.invoke(IPC.SERVER_INFO),

  updateServerSettings: (settings: ServerSettings) =>
    ipcRenderer.invoke(IPC.SERVER_UPDATE_SETTINGS, settings),

  // Channels
  channels: {
    fetch: () => ipcRenderer.invoke(IPC.CHANNELS_FETCH),
    create: (name: string, channelType: string, categoryId: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_CREATE, name, channelType, categoryId),
    update: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_UPDATE, id, name),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.CHANNELS_DELETE, id),
    reorder: (channels: Array<{ id: string; position: number }>) =>
      ipcRenderer.invoke(IPC.CHANNELS_REORDER, channels),
  },

  // Categories
  categories: {
    create: (name: string) => ipcRenderer.invoke(IPC.CATEGORIES_CREATE, name),
    update: (id: string, name: string) => ipcRenderer.invoke(IPC.CATEGORIES_UPDATE, id, name),
    delete: (id: string) => ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),
    reorder: (categories: Array<{ id: string; position: number }>) =>
      ipcRenderer.invoke(IPC.CATEGORIES_REORDER, categories),
  },

  // Members
  members: {
    fetch: () => ipcRenderer.invoke(IPC.MEMBERS_FETCH),
  },

  // Roles
  roles: {
    fetch: () => ipcRenderer.invoke(IPC.ROLES_FETCH),
    create: (name: string, permissions: number, color?: string) =>
      ipcRenderer.invoke(IPC.ROLES_CREATE, name, permissions, color),
    update: (id: string, name?: string, permissions?: number, color?: string) =>
      ipcRenderer.invoke(IPC.ROLES_UPDATE, id, name, permissions, color),
    delete: (id: string) => ipcRenderer.invoke(IPC.ROLES_DELETE, id),
    assign: (userId: string, roleId: string) =>
      ipcRenderer.invoke(IPC.ROLES_ASSIGN, userId, roleId),
    remove: (userId: string, roleId: string) =>
      ipcRenderer.invoke(IPC.ROLES_REMOVE, userId, roleId),
    getUserRoles: (userId: string) =>
      ipcRenderer.invoke(IPC.ROLES_GET_USER, userId),
  },

  // Invites
  invite: {
    validateInvite: (serverUrl: string, inviteCode: string) =>
      ipcRenderer.invoke(IPC.INVITE_VALIDATE, serverUrl, inviteCode),
    joinViaInvite: (serverUrl: string, inviteCode: string) =>
      ipcRenderer.invoke(IPC.INVITE_JOIN, serverUrl, inviteCode),
  },

  // P2P
  p2p: {
    startMesh: () => ipcRenderer.invoke(IPC.P2P_START_MESH),
    stopMesh: () => ipcRenderer.invoke(IPC.P2P_STOP_MESH),
    sendTestMessage: (topic: string, text: string) =>
      ipcRenderer.invoke(IPC.P2P_SEND_TEST_MESSAGE, topic, text),
    pingPeer: (peerId: string) =>
      ipcRenderer.invoke(IPC.P2P_PING_PEER, peerId),
    forceReconnect: () => ipcRenderer.invoke(IPC.P2P_FORCE_RECONNECT),
    getStats: () => ipcRenderer.invoke(IPC.P2P_GET_STATS),
    onStatsUpdate: (callback: (stats: P2PStats) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, stats: P2PStats) =>
        callback(stats)
      ipcRenderer.on(IPC.PUSH_P2P_STATS, listener)
      return () => { ipcRenderer.removeListener(IPC.PUSH_P2P_STATS, listener) }
    },
    openPanel: () => { ipcRenderer.invoke(IPC.P2P_PANEL_OPEN) },
    closePanel: () => { ipcRenderer.invoke(IPC.P2P_PANEL_CLOSE) },
  },

  // Chat
  chat: {
    send: (channelId: string, content: string, replyToId?: string) =>
      ipcRenderer.invoke(IPC.CHAT_SEND, channelId, content, replyToId),
    fetchHistory: (channelId: string, beforeSequence?: number, limit?: number) =>
      ipcRenderer.invoke(IPC.CHAT_FETCH_HISTORY, channelId, beforeSequence, limit),
    edit: (channelId: string, messageId: string, content: string) =>
      ipcRenderer.invoke(IPC.CHAT_EDIT, channelId, messageId, content),
    delete: (channelId: string, messageId: string) =>
      ipcRenderer.invoke(IPC.CHAT_DELETE, channelId, messageId),
  },

  // Reactions
  reactions: {
    add: (messageId: string, emoji: string) =>
      ipcRenderer.invoke(IPC.REACTIONS_ADD, messageId, emoji),
    remove: (messageId: string, emoji: string) =>
      ipcRenderer.invoke(IPC.REACTIONS_REMOVE, messageId, emoji),
    fetch: (messageId: string) =>
      ipcRenderer.invoke(IPC.REACTIONS_FETCH, messageId),
  },

  // Presence
  presence: {
    set: (status: 'online' | 'away' | 'dnd' | 'offline') =>
      ipcRenderer.invoke(IPC.PRESENCE_SET, status),
  },

  // Last Read
  lastRead: {
    update: (channelId: string, lastSequence: number) =>
      ipcRenderer.invoke(IPC.LAST_READ_UPDATE, channelId, lastSequence),
    fetch: (channelId: string) =>
      ipcRenderer.invoke(IPC.LAST_READ_FETCH, channelId),
  },

  // Notifications
  notifications: {
    setPrefs: (channelId: string, prefs: NotificationPrefs) =>
      ipcRenderer.invoke(IPC.NOTIFICATIONS_SET_PREFS, channelId, prefs),
    show: (opts: { title: string; body: string; channelId: string; serverName?: string }) =>
      ipcRenderer.invoke(IPC.NOTIFICATIONS_SHOW, opts),
  },

  // Direct Messages
  dm: {
    publishKey: () =>
      ipcRenderer.invoke(IPC.DM_PUBLISH_KEY),
    listConversations: () =>
      ipcRenderer.invoke(IPC.DM_LIST_CONVERSATIONS),
    createConversation: (recipientPubkey: string) =>
      ipcRenderer.invoke(IPC.DM_CREATE_CONVERSATION, recipientPubkey),
    sendMessage: (conversationId: string, recipientPubkey: string, content: string) =>
      ipcRenderer.invoke(IPC.DM_SEND_MESSAGE, conversationId, recipientPubkey, content),
    fetchHistory: (conversationId: string, recipientPubkey: string, beforeSeq?: number, limit?: number) =>
      ipcRenderer.invoke(IPC.DM_FETCH_HISTORY, conversationId, recipientPubkey, beforeSeq, limit),
    fetchOffline: () =>
      ipcRenderer.invoke(IPC.DM_FETCH_OFFLINE),
    deleteLocal: (conversationId: string, messageId: string) =>
      ipcRenderer.invoke(IPC.DM_DELETE_LOCAL, conversationId, messageId),
    getPeerKeyStatus: (peerPubkey: string) =>
      ipcRenderer.invoke(IPC.DM_GET_PEER_KEY_STATUS, peerPubkey),
    onDmEvent: (callback: (event: DmEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: DmEvent) => callback(data)
      ipcRenderer.on(IPC.PUSH_DM_EVENT, listener)
      return () => { ipcRenderer.removeListener(IPC.PUSH_DM_EVENT, listener) }
    },
    onKeyRotated: (callback: (userPubkey: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, userPubkey: string) => callback(userPubkey)
      ipcRenderer.on(IPC.PUSH_DM_KEY_ROTATED, listener)
      return () => { ipcRenderer.removeListener(IPC.PUSH_DM_KEY_ROTATED, listener) }
    },
  },

  // Voice
  voice: {
    join: (channelId: string) => ipcRenderer.invoke(IPC.VOICE_JOIN, channelId),
    leave: () => ipcRenderer.invoke(IPC.VOICE_LEAVE),
    sendSdpOffer: (targetUserId: string, sdp: string, channelId: string) =>
      ipcRenderer.invoke(IPC.VOICE_SEND_SDP_OFFER, targetUserId, sdp, channelId),
    sendSdpAnswer: (targetUserId: string, sdp: string, channelId: string) =>
      ipcRenderer.invoke(IPC.VOICE_SEND_SDP_ANSWER, targetUserId, sdp, channelId),
    sendIceCandidate: (targetUserId: string, candidateJson: string, channelId: string) =>
      ipcRenderer.invoke(IPC.VOICE_SEND_ICE_CANDIDATE, targetUserId, candidateJson, channelId),
    sendStateUpdate: (channelId: string, muted: boolean, deafened: boolean) =>
      ipcRenderer.invoke(IPC.VOICE_SEND_STATE_UPDATE, channelId, muted, deafened),
    sendSpeaking: (channelId: string, speaking: boolean) =>
      ipcRenderer.invoke(IPC.VOICE_SEND_SPEAKING, channelId, speaking),
    setPttKey: (key: number) => ipcRenderer.invoke(IPC.VOICE_SET_PTT_KEY, key),
    getPttKey: () => ipcRenderer.invoke(IPC.VOICE_GET_PTT_KEY),
    setMode: (mode: 'vad' | 'ptt') => ipcRenderer.invoke(IPC.VOICE_SET_MODE, mode),
    checkMicPermission: () => ipcRenderer.invoke(IPC.VOICE_CHECK_MIC_PERMISSION),
  },

  onVoiceEvent: (cb: (event: VoiceEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: VoiceEvent) => cb(event)
    ipcRenderer.on(IPC.PUSH_VOICE_EVENT, handler)
    return () => { ipcRenderer.removeListener(IPC.PUSH_VOICE_EVENT, handler) }
  },

  onPttState: (cb: (active: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, active: boolean) => cb(active)
    ipcRenderer.on(IPC.PUSH_PTT_STATE, handler)
    return () => { ipcRenderer.removeListener(IPC.PUSH_PTT_STATE, handler) }
  },

  // Media
  media: {
    uploadFiles: (params: { channelId: string; content: string; replyToId?: string; files: FileAttachment[] }) =>
      ipcRenderer.invoke(IPC.MEDIA_UPLOAD_FILES, params),
    pickFiles: () => ipcRenderer.invoke(IPC.MEDIA_PICK_FILES),
    onUploadProgress: (cb: (progress: UploadProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: UploadProgress) => cb(data)
      ipcRenderer.on(IPC.PUSH_UPLOAD_PROGRESS, listener)
      return () => { ipcRenderer.removeListener(IPC.PUSH_UPLOAD_PROGRESS, listener) }
    },
  },

  // Network Stats
  stats: {
    getNetworkStats: () => ipcRenderer.invoke(IPC.STATS_GET_NETWORK),
    getStorageUsage: () => ipcRenderer.invoke(IPC.STATS_GET_STORAGE),
    onNetworkStats: (cb: (stats: NetworkStats) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: NetworkStats) => cb(data)
      ipcRenderer.on(IPC.PUSH_NETWORK_STATS, listener)
      return () => { ipcRenderer.removeListener(IPC.PUSH_NETWORK_STATS, listener) }
    },
  },

  // Block Store
  blocks: {
    putBlock: (dataBase64: string, tier: number, meta?: Partial<{ mimeType: string; width: number; height: number; filename: string }>) =>
      ipcRenderer.invoke(IPC.BLOCK_PUT, dataBase64, tier, meta),
    getBlock: (hash: string) =>
      ipcRenderer.invoke(IPC.BLOCK_GET, hash) as Promise<string | null>,
    hasBlock: (hash: string) =>
      ipcRenderer.invoke(IPC.BLOCK_HAS, hash) as Promise<boolean>,
    deleteBlock: (hash: string) =>
      ipcRenderer.invoke(IPC.BLOCK_DELETE, hash) as Promise<void>,
    getStorageUsage: () =>
      ipcRenderer.invoke(IPC.BLOCK_STORAGE_USAGE) as Promise<BlockStorageUsage>,
    getConfig: () =>
      ipcRenderer.invoke(IPC.BLOCK_GET_CONFIG) as Promise<BlockStoreConfig>,
    setConfig: (config: Partial<BlockStoreConfig>) =>
      ipcRenderer.invoke(IPC.BLOCK_SET_CONFIG, config) as Promise<void>,
    resolveBlock: (hash: string) =>
      ipcRenderer.invoke(IPC.BLOCK_RESOLVE, hash) as Promise<string | null>,
  },

  // Device Provisioning (SEC-12)
  provisioning: {
    startProvisioning: () =>
      ipcRenderer.invoke(IPC.PROVISIONING_START),

    cancelProvisioning: () =>
      ipcRenderer.invoke(IPC.PROVISIONING_CANCEL),

    receiveProvisioning: (qrPayload: string) =>
      ipcRenderer.invoke(IPC.PROVISIONING_RECEIVE, qrPayload),
  },

  // Storage
  storage: storageApi,

  // Push events (main -> renderer)
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ConnectionStatus) =>
      callback(status)
    ipcRenderer.on(IPC.PUSH_CONNECTION_STATUS, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_CONNECTION_STATUS, listener) }
  },

  onAuthError: (callback: (code: number, message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, code: number, message: string) =>
      callback(code, message)
    ipcRenderer.on(IPC.PUSH_AUTH_ERROR, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_AUTH_ERROR, listener) }
  },

  onServerInfoUpdate: (callback: (info: ServerInfo) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: ServerInfo) =>
      callback(info)
    ipcRenderer.on(IPC.PUSH_SERVER_INFO_UPDATE, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_SERVER_INFO_UPDATE, listener) }
  },

  onChannelEvent: (callback: (event: ChannelEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChannelEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_CHANNEL_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_CHANNEL_EVENT, listener) }
  },

  onRoleEvent: (callback: (event: RoleEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: RoleEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_ROLE_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_ROLE_EVENT, listener) }
  },

  onDeepLinkInvite: (callback: (inviteCode: string, serverUrl?: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, inviteCode: string, serverUrl?: string) =>
      callback(inviteCode, serverUrl)
    ipcRenderer.on(IPC.PUSH_DEEP_LINK, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_DEEP_LINK, listener) }
  },

  onChatEvent: (callback: (event: ChatEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ChatEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_CHAT_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_CHAT_EVENT, listener) }
  },

  onTypingEvent: (callback: (event: TypingEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: TypingEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_TYPING_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_TYPING_EVENT, listener) }
  },

  onPresenceEvent: (callback: (event: PresenceUpdate) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: PresenceUpdate) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_PRESENCE_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_PRESENCE_EVENT, listener) }
  },

  onDmEvent: (callback: (event: DmEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DmEvent) =>
      callback(data)
    ipcRenderer.on(IPC.PUSH_DM_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_DM_EVENT, listener) }
  },

  onDmKeyRotated: (callback: (userPubkey: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, userPubkey: string) =>
      callback(userPubkey)
    ipcRenderer.on(IPC.PUSH_DM_KEY_ROTATED, listener)
    return () => { ipcRenderer.removeListener(IPC.PUSH_DM_KEY_ROTATED, listener) }
  }
}

contextBridge.exposeInMainWorld('united', api)
