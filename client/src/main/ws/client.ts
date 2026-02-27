import { EventEmitter } from 'events'
import {
  type ConnectionStatus,
  type ReconnectConfig,
  WS_CLOSE_CODES,
  DEFAULT_RECONNECT_CONFIG,
  calculateReconnectDelay
} from '@shared/ws-protocol'

/**
 * WebSocket client with exponential backoff reconnection.
 *
 * Emits:
 *   'status'     (status: ConnectionStatus)
 *   'message'    (data: Uint8Array)
 *   'auth-error' (code: number, message: string)
 */
export class WsClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url: string | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private status: ConnectionStatus = 'disconnected'
  private config: ReconnectConfig

  constructor(config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG) {
    super()
    this.config = config
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  connect(url: string): void {
    this.url = url
    this.attempt = 0
    this.doConnect()
  }

  disconnect(): void {
    this.url = null
    this.clearReconnectTimer()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  send(data: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }
    this.ws.send(data)
  }

  retryNow(): void {
    this.attempt = 0
    this.clearReconnectTimer()
    this.doConnect()
  }

  private doConnect(): void {
    if (!this.url) return

    this.clearReconnectTimer()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }

    try {
      this.ws = new WebSocket(this.url)
      this.ws.binaryType = 'arraybuffer'
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.attempt = 0
      this.setStatus('connected')
    }

    this.ws.onmessage = (event: MessageEvent) => {
      const data = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : event.data
      this.emit('message', data)
    }

    this.ws.onclose = (event: CloseEvent) => {
      this.ws = null

      // Non-reconnectable close codes
      if (event.code === WS_CLOSE_CODES.TOKEN_INVALID) {
        this.setStatus('disconnected')
        this.emit('auth-error', event.code, 'Token invalid — please log in again')
        return
      }
      if (event.code === WS_CLOSE_CODES.BANNED) {
        this.setStatus('disconnected')
        this.emit('auth-error', event.code, 'You have been banned from this server')
        return
      }

      // Token expired — signal for silent refresh
      if (event.code === WS_CLOSE_CODES.TOKEN_EXPIRED) {
        this.emit('auth-error', event.code, 'Token expired — refreshing')
      }

      // Reconnectable — schedule retry
      if (this.url) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    }
  }

  private scheduleReconnect(): void {
    if (!this.url) return
    if (this.attempt >= this.config.maxAttempts) {
      this.setStatus('disconnected')
      return
    }

    this.setStatus('reconnecting')

    // Immediate first retry (0ms), then exponential backoff
    // Schedule: immediate -> 1s -> 2s -> 4s -> 8s -> 16s -> 30s cap
    if (this.attempt === 0) {
      this.attempt++
      setTimeout(() => this.doConnect(), 0)
      return
    }

    const delay = calculateReconnectDelay(this.attempt - 1, this.config)
    this.attempt++
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', status)
  }
}

export const wsClient = new WsClient()
