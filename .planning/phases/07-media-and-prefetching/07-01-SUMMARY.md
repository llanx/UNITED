---
phase: 07-media-and-prefetching
plan: 01
subsystem: media
tags: [protobuf, blurhash, ffmpeg, sharp, upload, blocks, ipc]

# Dependency graph
requires:
  - phase: 06-content-distribution
    provides: Block store, block encryption, IPC, cascade resolution
provides:
  - BlockRef proto with blurhash field for dual-placeholder strategy
  - ChatMessage proto with repeated block_refs for media attachments
  - Server max_upload_size_mb enforcement (413 Payload Too Large)
  - Migration 7 block_refs_json column on messages table
  - Server chat endpoints accepting and returning block_refs_json
  - Media upload IPC handlers with blocking send pattern
  - Blurhash generation from images (32x32 resize, 4x3 components)
  - Video thumbnail extraction via ffmpeg (1s still frame)
  - File picker dialog and upload progress push events
  - TypeScript BlockRefData, FileAttachment, UploadProgress interfaces
  - media namespace on UnitedAPI (uploadFiles, pickFiles, onUploadProgress)
affects: [07-media-and-prefetching, renderer-ui]

# Tech tracking
tech-stack:
  added: [blurhash, sharp, fluent-ffmpeg, ffmpeg-static, @types/fluent-ffmpeg]
  patterns: [blocking-send-upload, dual-placeholder-blurhash-micro-thumbnail]

key-files:
  created:
    - client/src/main/ipc/media.ts
  modified:
    - shared/proto/blocks.proto
    - shared/proto/chat.proto
    - server/src/config.rs
    - server/src/blocks/routes.rs
    - server/src/routes.rs
    - server/src/db/migrations.rs
    - server/src/chat/messages.rs
    - server/src/state.rs
    - server/src/main.rs
    - client/src/main/blocks/thumbnails.ts
    - client/src/main/ipc/channels.ts
    - client/src/main/index.ts
    - client/src/preload/index.ts
    - shared/types/ipc-bridge.ts
    - client/package.json

key-decisions:
  - "Blurhash encoding at 32x32 with 4x3 components for ~30 byte strings"
  - "Video thumbnail extracted at 1-second mark via ffmpeg to avoid black first frames"
  - "block_refs carried as JSON string in REST (block_refs_json), proto repeated field for WS"
  - "DefaultBodyLimit layer on PUT /api/blocks route for axum-level enforcement alongside handler check"
  - "sharp added as explicit dependency (was imported by thumbnails.ts but missing from package.json)"

patterns-established:
  - "Blocking send: files processed sequentially, all blocks uploaded before message published"
  - "Dual-placeholder: micro-thumbnail for inline chat, blurhash for fullscreen loading"
  - "Upload progress: per-file PUSH_UPLOAD_PROGRESS events from main to renderer"

requirements-completed: [MEDIA-01, MEDIA-04]

# Metrics
duration: 11min
completed: 2026-02-26
---

# Phase 7 Plan 01: Media Upload Infrastructure Summary

**File upload pipeline with protobuf block_refs, server max_upload_size enforcement, blurhash encoding, video thumbnail extraction via ffmpeg, and blocking send IPC with progress reporting**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-26T21:13:35Z
- **Completed:** 2026-02-26T21:25:21Z
- **Tasks:** 2
- **Files modified:** 25

## Accomplishments
- Extended protobuf schemas (BlockRef blurhash field 8, ChatMessage block_refs field 13) and server migration 7 for block_refs_json column
- Server enforces configurable max upload size (default 100 MB) via both handler check (413) and DefaultBodyLimit axum layer
- Built complete media upload IPC module with blocking send: file read, block storage, server upload, thumbnail/blurhash generation, then message publish
- Added blurhash encoding (sharp 32x32 resize + 4x3 component encode) and video thumbnail extraction (ffmpeg still frame at 1s)
- Preload bridge exposes full media namespace (uploadFiles, pickFiles, onUploadProgress) for renderer consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend protobuf schemas, server migration, chat endpoints, and upload size enforcement** - `7e63978` (feat)
2. **Task 2: Media upload IPC handlers with blurhash, video thumbnails, and blocking send** - `e00cc4d` (feat)

## Files Created/Modified
- `shared/proto/blocks.proto` - Added blurhash field (8) to BlockRef
- `shared/proto/chat.proto` - Added blocks.proto import and repeated block_refs field (13) to ChatMessage
- `server/src/config.rs` - Added max_upload_size_mb to BlocksConfig (default 100) and config template
- `server/src/blocks/routes.rs` - Upload size enforcement with 413 Payload Too Large
- `server/src/routes.rs` - DefaultBodyLimit layer on PUT /api/blocks route
- `server/src/db/migrations.rs` - Migration 7: block_refs_json TEXT column on messages table
- `server/src/chat/messages.rs` - Extended CreateMessageRequest/MessageResponse with block_refs_json, updated INSERT/SELECT queries
- `server/src/state.rs` - Added max_upload_size_mb to AppState
- `server/src/main.rs` - Populate max_upload_size_mb from config
- `server/tests/*.rs` - Updated 6 test files with max_upload_size_mb field
- `client/package.json` - Added blurhash, sharp, fluent-ffmpeg, ffmpeg-static, @types/fluent-ffmpeg
- `client/src/main/blocks/thumbnails.ts` - Added generateBlurhash(), isVideoMime(), generateVideoThumbnail()
- `client/src/main/ipc/media.ts` - New: media upload orchestration (blocking send, progress, file picker)
- `client/src/main/ipc/channels.ts` - Added MEDIA_UPLOAD_FILES, MEDIA_PICK_FILES, PUSH_UPLOAD_PROGRESS constants
- `client/src/main/index.ts` - Register media handlers with mainWindow reference
- `client/src/preload/index.ts` - Expose media namespace (uploadFiles, pickFiles, onUploadProgress)
- `shared/types/ipc-bridge.ts` - Added BlockRefData, FileAttachment, UploadProgress interfaces, media namespace on UnitedAPI, block_refs on ChatMessage

## Decisions Made
- Blurhash encoding uses 32x32 resize (via sharp) with 4x3 components producing ~30 byte strings -- fast and compact for inline transmission
- Video thumbnails extracted at 1-second mark to avoid common black-frame first-frame problem; graceful null return on failure
- block_refs stored as JSON string in SQL (block_refs_json TEXT) and REST responses, while proto uses typed repeated field for WS
- DefaultBodyLimit layer applied specifically to the PUT /api/blocks route rather than globally, alongside explicit handler-level size check
- sharp added as explicit dependency -- was imported by thumbnails.ts but missing from package.json (pre-existing gap, Rule 3 auto-fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added block_refs field to prost ChatMessage construction**
- **Found during:** Task 1 (server build)
- **Issue:** Adding `repeated united.blocks.BlockRef block_refs = 13` to chat.proto caused prost-generated ChatMessage struct to require the new `block_refs` field, breaking the existing construction in `create_message`
- **Fix:** Added `block_refs: vec![]` to the proto ChatMessage construction (block refs are carried as JSON in REST, not as proto in WS broadcast)
- **Files modified:** server/src/chat/messages.rs
- **Verification:** cargo build succeeds, all 42 tests pass

**2. [Rule 3 - Blocking] Added sharp as explicit dependency**
- **Found during:** Task 2 (dependency investigation)
- **Issue:** thumbnails.ts imports sharp but it was not in package.json dependencies (likely installed transitively or manually)
- **Fix:** Added sharp ^0.34.5 to package.json via npm install
- **Files modified:** client/package.json, client/package-lock.json
- **Verification:** `node -e "require('sharp')"` succeeds

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Upload pipeline complete, ready for Plan 02 (inline rendering UI) and Plan 03 (prefetch and seeding)
- Renderer can now call `window.united.media.uploadFiles()` for blocking file sends
- Server persists block_refs_json and returns it in message history and broadcast
- Blurhash + micro-thumbnail dual-placeholder data available for rendering placeholders

## Self-Check: PASSED

- All key files verified present on disk
- Both task commits (7e63978, e00cc4d) verified in git log
- Server: cargo test passes all tests
- Client: tsc --noEmit compiles clean

---
*Phase: 07-media-and-prefetching*
*Completed: 2026-02-26*
