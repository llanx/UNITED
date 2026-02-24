/**
 * Protobuf encode/decode layer for WebSocket messages.
 *
 * In 01-04 these are stubs — real protobuf codegen types come after
 * running `npm run proto:gen` (buf generate). The WsClient uses these
 * functions but the mock IPC handlers in 01-04 never actually open a
 * WebSocket connection, so these stubs are never called at runtime.
 */

export function encode(payload: Record<string, unknown>): Uint8Array {
  throw new Error('protobuf codegen required: run npm run proto:gen')
}

export function decode(data: Uint8Array): Record<string, unknown> {
  throw new Error('protobuf codegen required: run npm run proto:gen')
}

export function newRequestId(): string {
  return crypto.randomUUID()
}
