# Phase 7: Media and Prefetching - Research

**Researched:** 2026-02-26
**Domain:** File upload/chunking, inline media rendering, blurhash placeholders, seeding stats, predictive prefetching
**Confidence:** HIGH

## Summary

Phase 7 builds the user-facing media experience on top of Phase 6's content-addressed block pipeline. The existing infrastructure is substantial: `prepareContentForGossip` already handles the inline-vs-deferred content decision, `BlockRef` protobuf carries hash/size/mime/width/height/micro-thumbnail, `resolveBlock` provides the 5-layer cascade, `useBlockContent` delivers progressive loading states, and `ContentPlaceholder`/`AttachmentCard` are ready-to-integrate UI components. The main work is: (1) file upload flow in the composer (attachment button, drag-drop, clipboard paste), (2) blocking send that chunks files into blocks before message publication, (3) inline image/video rendering with the dual placeholder strategy, (4) lightbox gallery for full-resolution viewing, (5) multi-image adaptive grid layout, (6) blurhash encoding/decoding for lightbox placeholders, (7) seeding stats dashboard, and (8) predictive prefetching (channel hover, scroll position, app launch).

The standard approach uses the existing `sharp` (already installed) for image processing, adds `blurhash` for encoding/decoding, `yet-another-react-lightbox` for the lightbox gallery, and `ffmpeg-static` + `fluent-ffmpeg` for video thumbnail extraction. Upload mechanics use the native HTML5 File API, drag-and-drop events, and React's `onPaste` handler -- no additional upload libraries needed. Prefetching uses `onMouseEnter` events on the channel list and IntersectionObserver for scroll-based triggering.

**Primary recommendation:** Wire the existing Phase 6 components (AttachmentCard, ContentPlaceholder, useBlockContent, prepareContentForGossip) into message rendering and composer flows. Add blurhash encoding alongside micro-thumbnail generation. Build the lightbox with yet-another-react-lightbox. Implement prefetching as lightweight store-level prefetch functions triggered by DOM events.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Three upload methods from day one: attachment button (paperclip/+ icon in composer), drag-and-drop onto chat area, clipboard paste (Ctrl+V for screenshots/copied images)
- File size limit: 100 MB per file, default. Admin-configurable in `united.toml`. Self-hosted = admin decides.
- Multiple attachments: up to 10 files per message
- Blocking send: file is chunked and distributed to the block store BEFORE the message is sent. Progress bar shown in the composer area below the file preview. Message only appears in chat when blocks are guaranteed to exist (at minimum on sender's machine and partially on server). No "uploading..." state visible to recipients.
- Images: constrained max box (~400-500px wide, ~350px tall). Small images render at original size. Large images scale down preserving aspect ratio. Click any image to open full-screen lightbox.
- Videos: thumbnail (first frame or mid-point still) with play button overlay. Click to play inline with standard controls. No autoplay.
- Placeholder strategy (dual-role): Micro-thumbnail (~100px JPEG, <5KB from Phase 6 gossip payload) as the blurry preview while full image loads from peers. Blurhash string (~30 bytes, also in gossip payload) renders as a smooth color gradient at full viewport size while the full-resolution image loads in lightbox.
- Multi-image layout: Adaptive grid (2: side-by-side, 3: 1+2, 4: 2x2, 5+: 2x2 with "+N more"). Clicking opens lightbox gallery with arrow navigation.
- Mixed media: images in adaptive grid above, non-image file cards below. Clean separation, no interleaving.
- Full stats dashboard in Settings under "Network" or "P2P" tab: upload/download totals, seeding ratio, blocks seeded, storage breakdown by tier.
- Optional compact status bar indicator: off by default, toggle in Settings. Shows upload/download arrows with speed.
- Stats are private only -- no public visibility.
- Channel hover prefetch: last 20 messages on sidebar hover.
- App launch prefetch: last-viewed + most active channel.
- Scroll position prefetch: at 70% scroll, prefetch next batch. Text + metadata only; full media on demand.
- Media prefetch policy: Server admin configures in `united.toml`. Server policy is final -- no user override. Default: text + metadata only.

### Claude's Discretion
- Exact lightbox implementation (animation, controls, keyboard navigation)
- GIF/animated image handling (auto-play is standard -- follow Discord/Slack convention)
- Download/save behavior (standard right-click save + download button on file cards)
- Adaptive grid aspect ratio handling for mixed landscape/portrait images
- Video thumbnail generation (first frame vs. mid-point selection)
- Compact status bar indicator design (arrow icons, placement, update frequency)
- File preview in composer before send (thumbnail + filename + size + remove button is standard)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDIA-01 | User can upload and share files (images, video, documents, archives) in channels and DMs | Upload flow via attachment button/drag-drop/clipboard paste, file chunking into blocks via existing `putBlock`, server upload via PUT /api/blocks, blocking send pattern |
| MEDIA-02 | User can see images and videos rendered inline within messages (not as download links) | InlineImage and InlineVideo components using `useBlockContent` hook, constrained max-box rendering, video thumbnails via ffmpeg |
| MEDIA-03 | User sees blurhash placeholders at exact aspect ratio while media loads from peers (zero layout reflow) | Blurhash encoding on sender via `blurhash` npm package, decode to canvas on receiver, dual-role strategy (micro-thumbnail inline + blurhash lightbox) |
| MEDIA-04 | Media is chunked into content-addressed blocks and distributed across the peer swarm | Existing `prepareContentForGossip` handles chunking and block storage. Multi-block chunking for files >50KB with BlockRef in gossip message |
| P2P-04 | User can configure their local storage buffer size (N GB) for seeding server content to other peers | Existing StorageSettings component (budget slider 1-50 GB, TTL slider 3-30 days). Already functional from Phase 6. |
| P2P-07 | User can see seeding/contribution indicators showing how much they contribute to the swarm | New NetworkStats dashboard: upload/download counters tracked in block protocol, cumulative stats persisted in SQLite, Zustand slice for live stats |
| P2P-08 | App prefetches content predictively: channel hover, scroll position at 70%, app launch prefetch | Prefetch functions in messages store, onMouseEnter on ChannelList items, IntersectionObserver for scroll, app startup prefetch logic |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | 0.34.x | Image processing (thumbnails, metadata, resize) | Already installed. Native Node.js module, fastest image processing available. Used by Phase 6 for micro-thumbnails. |
| blurhash | 2.0.5 | Encode/decode blurhash placeholder strings | Official Wolt library. Used by Mastodon, Signal, Jellyfin. Only ~30 bytes per image in gossip payload. |
| yet-another-react-lightbox | 3.29.x | Full-screen lightbox gallery with keyboard navigation | 104+ npm dependents. Supports keyboard/mouse/touch, plugin system (Zoom, Fullscreen, Thumbnails), React 18+, never shows partially loaded images. |
| fluent-ffmpeg | 2.1.x | Video thumbnail extraction (first frame) | Standard Node.js FFmpeg wrapper. Needed for video thumbnail generation. |
| ffmpeg-static | 5.3.x | FFmpeg binary bundling for Electron | Provides prebuilt FFmpeg binaries for macOS/Linux/Windows. Most actively maintained FFmpeg bundling package. |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-virtual | 3.13.x | Virtual scrolling for message lists | Already used for ChatView. Relevant for multi-image layouts within virtualized rows. |
| lru-cache | 11.2.x | In-memory block caching | Already used in L0 cache layer. May be used for decoded blurhash caching. |
| zustand | 5.0.x | State management for seeding stats and prefetch state | Already the app's state manager. New slices for network stats and prefetch. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| yet-another-react-lightbox | react-image-lightbox | YARL has plugin system, better maintained (published 12 days ago vs. 2+ years), built-in video support |
| fluent-ffmpeg + ffmpeg-static | HTMLVideoElement.captureStream() | Browser API avoids bundling FFmpeg (~70MB binary), but unreliable for extracting specific frames from buffered video |
| blurhash (JS) | thumbhash | ThumbHash produces higher quality but is newer/less adopted. BlurHash is the industry standard (Signal, Mastodon). |

**Installation:**
```bash
cd client && npm install blurhash yet-another-react-lightbox fluent-ffmpeg ffmpeg-static
```

**Note on ffmpeg-static:** This adds ~70-80MB to the Electron package (platform-specific FFmpeg binary). If video thumbnail support is deemed too heavy for v1, an alternative is to use a simple play-button overlay without a generated thumbnail (just show the video element with poster attribute). The user decision says "thumbnail (first frame or mid-point still)" which requires FFmpeg.

## Architecture Patterns

### Recommended Project Structure
```
client/src/
├── main/
│   ├── blocks/
│   │   ├── thumbnails.ts    # [EXTEND] Add blurhash encoding, video thumbnail extraction
│   │   └── ...              # Existing block store infrastructure
│   ├── ipc/
│   │   ├── blocks.ts        # [EXTEND] Add upload-with-progress handler
│   │   ├── media.ts         # [NEW] File picker dialog, drag-drop file reading, upload orchestration
│   │   └── stats.ts         # [NEW] Network stats tracking IPC
│   └── p2p/
│       ├── gossipsub.ts     # [EXTEND] Track upload/download bytes for stats
│       └── protocol.ts      # [EXTEND] Track bytes transferred for stats
├── renderer/src/
│   ├── components/
│   │   ├── InlineImage.tsx       # [NEW] Constrained image with micro-thumbnail + full load
│   │   ├── InlineVideo.tsx       # [NEW] Video thumbnail + play overlay + inline player
│   │   ├── ImageGrid.tsx         # [NEW] Adaptive multi-image grid layout
│   │   ├── Lightbox.tsx          # [NEW] YARL wrapper with blurhash placeholders
│   │   ├── FilePreview.tsx       # [NEW] Composer file preview (thumbnail + name + size + remove)
│   │   ├── UploadProgress.tsx    # [NEW] Progress bar in composer during blocking send
│   │   ├── NetworkStats.tsx      # [NEW] Seeding stats dashboard (Settings panel)
│   │   ├── StatusBarIndicator.tsx # [NEW] Compact upload/download speed indicator
│   │   ├── MessageComposer.tsx   # [EXTEND] Add attachment button, drag-drop, paste handler
│   │   ├── MessageRow.tsx        # [EXTEND] Render inline media attachments
│   │   ├── ChannelList.tsx       # [EXTEND] Add onMouseEnter prefetch trigger
│   │   └── ContentPlaceholder.tsx # [EXISTS] Already handles shimmer/fetching/unavailable
│   ├── hooks/
│   │   ├── useBlockContent.ts    # [EXISTS] Progressive block resolution
│   │   ├── usePrefetch.ts        # [NEW] Channel hover and scroll-based prefetch
│   │   └── useNetworkStats.ts    # [NEW] Subscribe to network stats push events
│   └── stores/
│       ├── messages.ts           # [EXTEND] Add prefetch actions
│       ├── blocks.ts             # [EXISTS] Block resolution state
│       ├── settings.ts           # [EXISTS] Storage budget settings
│       └── network.ts            # [NEW] Upload/download stats, seeding ratio
└── shared/
    ├── proto/
    │   ├── blocks.proto          # [EXTEND] Add blurhash field to BlockRef
    │   └── chat.proto            # [EXTEND] Add block_refs field to ChatMessage
    └── types/
        └── ipc-bridge.ts         # [EXTEND] Add media upload and stats APIs
```

### Pattern 1: Blocking Send with Progress
**What:** Files are chunked into blocks and stored before the message is published. Progress is reported back to the composer.
**When to use:** Every file attachment send operation.
**Example:**
```typescript
// Main process: media.ts
async function uploadFilesAndSend(
  channelId: string,
  content: string,
  files: FileAttachment[],
  onProgress: (fileIndex: number, percent: number) => void
): Promise<void> {
  const blockRefs: BlockRefData[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const data = await fs.promises.readFile(file.path)

    // Validate file size
    if (data.length > maxFileSizeBytes) {
      throw new Error(`File ${file.name} exceeds size limit`)
    }

    // Prepare content (generates thumbnail, stores block, returns ref)
    const result = await prepareContentForGossip(data, file.name, file.mimeType)
    if (result.blockRef) {
      // Also generate blurhash for image content
      if (isImageMime(file.mimeType)) {
        result.blockRef.blurhash = await generateBlurhash(data)
      }
      blockRefs.push(result.blockRef)

      // Upload block to server (super-seeder)
      await uploadBlockToServer(result.blockRef.hash, data)
      onProgress(i, 100)
    }
  }

  // Now send message with block references
  await sendMessageWithAttachments(channelId, content, blockRefs)
}
```

### Pattern 2: Dual Placeholder Strategy
**What:** Two placeholder encodings travel in the gossip message: micro-thumbnail for inline chat, blurhash for lightbox.
**When to use:** Any image attachment in a message.
**Example:**
```typescript
// Encoding (sender, main process):
import { encode } from 'blurhash'

async function generateBlurhash(imageData: Buffer): Promise<string> {
  // Resize to small dimensions for fast encoding (per official recommendation)
  const { data, info } = await sharp(imageData)
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4, // xComponents
    3  // yComponents
  )
}

// Decoding (receiver, renderer):
import { decode } from 'blurhash'

function BlurhashCanvas({ hash, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const pixels = decode(hash, width, height)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)
  }, [hash, width, height])

  return <canvas ref={canvasRef} width={width} height={height} />
}
```

### Pattern 3: Adaptive Multi-Image Grid
**What:** Images rendered in grid layouts that adapt to count (2: side-by-side, 3: 1+2, 4: 2x2, 5+: 2x2 with "+N more").
**When to use:** Messages with multiple image attachments.
**Example:**
```typescript
function ImageGrid({ images, onImageClick }: ImageGridProps) {
  const visibleCount = Math.min(images.length, 4)
  const extraCount = images.length - 4

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3', // CSS: first image spans 2 rows
    4: 'grid-cols-2 grid-rows-2',
  }[visibleCount] ?? 'grid-cols-2 grid-rows-2'

  return (
    <div className={`grid gap-1 max-w-[500px] ${gridClass}`}>
      {images.slice(0, visibleCount).map((img, i) => (
        <div key={img.hash} className="relative" onClick={() => onImageClick(i)}>
          <InlineImage blockRef={img} />
          {i === 3 && extraCount > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">+{extraCount}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

### Pattern 4: Prefetch on Channel Hover
**What:** Hovering a channel in the sidebar prefetches the last 20 messages for that channel.
**When to use:** Channel list sidebar items.
**Example:**
```typescript
// In ChannelList.tsx:
const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

const handleChannelHover = useCallback((channelId: string) => {
  // Debounce: only prefetch after 200ms hover
  prefetchTimeoutRef.current = setTimeout(() => {
    const existing = useStore.getState().channelMessages[channelId]
    if (!existing || existing.messages.length === 0) {
      // Prefetch silently (don't set loading state in UI)
      window.united.chat.fetchHistory(channelId, undefined, 20)
        .then(result => {
          useStore.getState().prefetchMessages(channelId, result.messages)
        })
        .catch(() => {}) // Silent failure
    }
  }, 200)
}, [])

const handleChannelLeave = useCallback(() => {
  if (prefetchTimeoutRef.current) {
    clearTimeout(prefetchTimeoutRef.current)
  }
}, [])
```

### Pattern 5: Video Thumbnail via FFmpeg
**What:** Extract a still frame from video files for the thumbnail overlay.
**When to use:** Video file attachments (mp4, webm, mov, etc.).
**Example:**
```typescript
// Main process: thumbnails.ts
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'

ffmpeg.setFfmpegPath(ffmpegStatic!)

async function generateVideoThumbnail(videoPath: string): Promise<Buffer> {
  const outputPath = join(tmpdir(), `united-thumb-${randomBytes(8).toString('hex')}.jpg`)

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['00:00:01'], // 1 second in (avoids black first frame)
        filename: outputPath,
        size: '?x200' // 200px height, maintain aspect ratio
      })
      .on('end', async () => {
        const data = await fs.promises.readFile(outputPath)
        await fs.promises.unlink(outputPath) // Cleanup temp file
        resolve(data)
      })
      .on('error', reject)
  })
}
```

### Anti-Patterns to Avoid
- **Streaming uploads to recipients before completion:** Blocking send is a locked decision. Never publish a message until all blocks are guaranteed stored locally and (partially) on server.
- **Loading full-resolution images eagerly:** Always use micro-thumbnail/blurhash first, then resolve full content on demand. The gossip payload carries only the lightweight placeholders.
- **Synchronous file processing in renderer:** All file reading, hashing, thumbnail generation, and block storage must happen in the main process. Renderer only receives base64 data via IPC.
- **Unbounded prefetch:** Hover prefetch must be debounced (200ms) and capped (20 messages). Never prefetch full media on hover -- text + metadata only per the locked decision.
- **Storing FFmpeg output in app directory:** Use `os.tmpdir()` for temporary video thumbnails, clean up after processing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blurhash encoding/decoding | Custom DCT-based blur algorithm | `blurhash` npm package | Proven algorithm used by Signal, Mastodon. Component count tuning matters. |
| Lightbox gallery | Custom modal with image navigation | `yet-another-react-lightbox` | Keyboard/touch/mouse navigation, zoom, fullscreen, plugin architecture. Handles edge cases (partial loads, aspect ratios). |
| Video frame extraction | Canvas captureStream or custom decoder | `fluent-ffmpeg` + `ffmpeg-static` | Reliable frame extraction across all video formats. Browser APIs are unreliable for seeking to specific timestamps. |
| Image resizing/format conversion | Canvas-based resizing | `sharp` (already installed) | Native performance, handles EXIF orientation, produces consistent JPEG quality. |
| Drag-and-drop file handling | Custom drag manager | HTML5 native DragEvent + dataTransfer.files | Browser standard, works with Electron's CSP, no additional dependency. |
| Adaptive grid layout | Manual position calculations | CSS Grid with template areas | CSS Grid handles responsive sizing natively. Template areas map cleanly to the 2/3/4/5+ layout patterns. |

**Key insight:** The Phase 6 infrastructure already solves the hard content-addressed storage problem. Phase 7 is primarily a UI/UX layer that wires existing block operations into the message composition and rendering flows. Don't re-invent the storage or resolution pipeline.

## Common Pitfalls

### Pitfall 1: BlockRef protobuf field addition breaks existing messages
**What goes wrong:** Adding `block_refs` to ChatMessage protobuf and `blurhash` to BlockRef causes older messages without these fields to fail parsing.
**Why it happens:** Protobuf fields are optional by default in proto3, but code that accesses them without null checks will crash.
**How to avoid:** Use `repeated BlockRef block_refs = 13;` (new field number) in ChatMessage. Always check `message.block_refs?.length > 0` before rendering attachments. Existing messages simply have empty arrays.
**Warning signs:** Error logs showing "undefined is not iterable" or blank messages after upgrade.

### Pitfall 2: FFmpeg binary not found in packaged Electron app
**What goes wrong:** `ffmpeg-static` resolves the binary path at build time, but Electron's ASAR packaging wraps node_modules into an archive where binaries can't be executed.
**Why it happens:** ASAR archives don't support executing embedded binaries. The ffmpeg binary needs to be excluded from ASAR.
**How to avoid:** Configure electron-builder to exclude ffmpeg-static from ASAR: `"asarUnpack": ["**/node_modules/ffmpeg-static/**"]`. Adjust the path resolution to use `app.getPath('exe')` as base when packaged.
**Warning signs:** "ENOENT" errors when calling ffmpeg in production builds but not in dev.

### Pitfall 3: Blocking send stalls the UI
**What goes wrong:** Large files (50-100 MB) take significant time to hash, encrypt, and upload. If progress isn't reported, the composer appears frozen.
**Why it happens:** File processing happens in the main process. Without IPC progress events, the renderer has no feedback.
**How to avoid:** Use IPC event-based progress reporting: main process emits progress events per-file, renderer updates the UploadProgress component. Use `webContents.send()` for push events (same pattern as P2P stats push).
**Warning signs:** UI feels unresponsive during file sends, no visual feedback during upload.

### Pitfall 4: Blurhash encoding on full-resolution images is slow
**What goes wrong:** Encoding a 4000x3000 image takes several seconds, blocking the send flow.
**Why it happens:** Blurhash's DCT encoding is O(width * height * components). The official docs recommend running on small images.
**How to avoid:** Resize to 32x32 before encoding (per official recommendation). The blur effect means detail is discarded anyway. Use the already-available `sharp` resize, then pass raw RGBA pixels to `blurhash.encode()`.
**Warning signs:** Send delays that increase proportionally with image resolution.

### Pitfall 5: Micro-thumbnail and blurhash data inflates gossip message
**What goes wrong:** With 10 image attachments, each carrying a ~3KB micro-thumbnail and ~30 byte blurhash, the gossip message approaches the 60KB envelope limit.
**Why it happens:** 10 images * 3KB = 30KB just for thumbnails, plus message content and protobuf overhead.
**How to avoid:** The existing 60KB envelope size guard will catch this. If the message exceeds the limit, reduce micro-thumbnail quality or skip thumbnails for attachments beyond the 4th (they're hidden behind "+N more" overlay anyway).
**Warning signs:** `validateEnvelopeSize` throwing errors when sending multi-image messages.

### Pitfall 6: Channel hover prefetch fires on every mouse movement
**What goes wrong:** Rapidly moving the mouse across the channel list triggers dozens of unnecessary API calls.
**Why it happens:** `onMouseEnter` fires on every channel item crossed.
**How to avoid:** Debounce with 200ms timeout. Clear timeout on `onMouseLeave`. Skip prefetch if channel already has messages loaded. Use a Set to track which channels have been prefetched this session.
**Warning signs:** Network tab showing burst of history API calls on mouse movement across sidebar.

### Pitfall 7: Video inline playback drains resources
**What goes wrong:** Multiple videos in chat history all load their source, consuming memory and bandwidth.
**Why it happens:** `<video>` elements with `src` attribute start buffering immediately.
**How to avoid:** Only set the video `src` when the user clicks the play button. Until then, show only the thumbnail + play overlay. Use a single `<video>` element that gets reused (or destroyed on scroll-out-of-view).
**Warning signs:** Memory usage climbing with scroll, bandwidth spikes without user interaction.

## Code Examples

### Composer Attachment Button (React)
```typescript
// Source: HTML5 File API + Electron IPC pattern
function AttachmentButton({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => fileInputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      onFilesSelected(files.slice(0, 10)) // Max 10 per message
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <>
      <button onClick={handleClick} title="Attach files">
        <PaperclipIcon />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </>
  )
}
```

### Drag-and-Drop Zone (React + Electron)
```typescript
// Source: HTML5 DragEvent API (standard browser pattern)
function DropZone({ onDrop, children }: { onDrop: (files: File[]) => void; children: React.ReactNode }) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).slice(0, 10)
    if (files.length > 0) onDrop(files)
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && <DropOverlay />}
    </div>
  )
}
```

### Clipboard Paste Handler
```typescript
// Source: React ClipboardEvent API
const handlePaste = (e: React.ClipboardEvent) => {
  const items = Array.from(e.clipboardData.items)
  const imageItems = items.filter(item => item.type.startsWith('image/'))

  if (imageItems.length > 0) {
    e.preventDefault()
    const files = imageItems
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)
    onFilesSelected(files)
  }
  // Non-image pastes fall through to normal textarea handling
}
```

### Blurhash Canvas Rendering (Renderer)
```typescript
// Source: blurhash npm package official API
import { decode, isBlurhashValid } from 'blurhash'
import { useRef, useEffect, memo } from 'react'

interface BlurhashPlaceholderProps {
  hash: string
  width: number
  height: number
}

export const BlurhashPlaceholder = memo(function BlurhashPlaceholder({
  hash, width, height
}: BlurhashPlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!isBlurhashValid(hash).result) return
    const canvas = canvasRef.current
    if (!canvas) return

    // Decode at small resolution for performance, CSS scales up
    const decodeWidth = Math.min(width, 32)
    const decodeHeight = Math.min(height, 32)
    const pixels = decode(hash, decodeWidth, decodeHeight)

    canvas.width = decodeWidth
    canvas.height = decodeHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const imageData = ctx.createImageData(decodeWidth, decodeHeight)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)
  }, [hash, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
})
```

### Network Stats Tracking
```typescript
// Source: Application pattern (main process)
interface NetworkStats {
  bytesUploaded: number    // Cumulative
  bytesDownloaded: number  // Cumulative
  blocksSeeded: number     // Total blocks served to peers
  uploadSpeed: number      // Bytes/sec (rolling 10s window)
  downloadSpeed: number    // Bytes/sec (rolling 10s window)
}

// Track in protocol.ts when serving/receiving blocks:
function onBlockServed(hash: string, size: number) {
  stats.bytesUploaded += size
  stats.blocksSeeded++
  recentUploads.push({ time: Date.now(), size })
  persistStats()
}

function onBlockReceived(hash: string, size: number) {
  stats.bytesDownloaded += size
  recentDownloads.push({ time: Date.now(), size })
  persistStats()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Loading spinner while image loads | Blurhash placeholder at exact dimensions | 2019+ (Wolt/Signal adoption) | Zero layout reflow, perceived instant loading |
| Download link for all attachments | Inline rendering with progressive loading | Standard since Discord/Slack era | Messages with media are immediately comprehensible |
| Eager load all media in view | On-demand loading with scroll-based triggers | React virtualization era (2020+) | Memory and bandwidth savings, especially for image-heavy channels |
| Client-side image processing | Server/main-process with sharp | sharp maturation (2018+) | Consistent quality, EXIF handling, native performance |

**Deprecated/outdated:**
- `sharp` versions before 0.33: Missing some WebP/AVIF features. Current project uses 0.34.x which is current.
- `react-image-lightbox`: Unmaintained since 2022. Use `yet-another-react-lightbox` instead.
- `jimp` for image processing: Pure JS, 10-50x slower than sharp. Not suitable for real-time upload flows.

## Open Questions

1. **Video thumbnail extraction dependency size**
   - What we know: `ffmpeg-static` adds ~70-80MB (platform-specific binary) to the Electron package
   - What's unclear: Whether this is acceptable for v1 given the project's desktop-only scope
   - Recommendation: Implement with FFmpeg. If package size is a concern at shipping time, fallback to a simple play-button overlay without thumbnail is possible (degrade gracefully). The architecture should support both paths.

2. **Multi-block chunking for large files**
   - What we know: Phase 6 stores entire files as single blocks. The existing `putBlock` takes the full file buffer.
   - What's unclear: Whether 100MB files should be split into multiple smaller blocks (e.g., 1MB chunks) for better P2P distribution, or kept as single blocks.
   - Recommendation: Keep single-block for v1. The 100MB limit is admin-configurable and most chat media is well under 10MB. Multi-block chunking adds significant complexity (chunk reassembly, parallel downloads, missing chunk handling) for minimal benefit at v1 scale. If needed, this is a Phase 6 enhancement, not a Phase 7 concern.

3. **Server-side file size limit enforcement**
   - What we know: The server PUT /api/blocks endpoint currently accepts arbitrary body sizes. The 100MB limit is only documented as a client-side decision.
   - What's unclear: Whether the server should also enforce the limit
   - Recommendation: Add `max_upload_size_mb` to `BlocksConfig` in the server config (default 100). Enforce with axum's `DefaultBodyLimit` extractor. This prevents abuse independent of client-side validation.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `client/src/main/blocks/`, `client/src/renderer/src/components/`, `client/src/renderer/src/stores/`, `shared/proto/blocks.proto`, `shared/proto/chat.proto`, `server/src/blocks/routes.rs`, `server/src/config.rs`
- [blurhash npm](https://www.npmjs.com/package/blurhash) - v2.0.5, official Wolt package
- [yet-another-react-lightbox](https://www.npmjs.com/package/yet-another-react-lightbox) - v3.29.1, published 12 days ago
- [Electron clipboard API](https://www.electronjs.org/docs/latest/api/clipboard) - Official Electron docs
- [Electron file drag & drop](https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop) - Official Electron docs

### Secondary (MEDIUM confidence)
- [ffmpeg-static npm](https://www.npmjs.com/package/ffmpeg-static) - v5.3.0, published 3 months ago
- [WebP Image Optimisation + BlurHash with Sharp in NodeJS](https://blog.opinly.ai/image-optimisation-with-sharp-in-nodejs/) - Integration pattern verified against blurhash npm docs
- [Include FFmpeg Binaries in Electron App](https://alexandercleasby.dev/blog/use-ffmpeg-electron) - ASAR unpack pattern verified against Electron docs
- [BlurHash official site](https://blurha.sh/) - Performance recommendations (resize before encoding)
- [YARL Documentation](https://yet-another-react-lightbox.com/documentation) - Plugin system, keyboard navigation

### Tertiary (LOW confidence)
- Video thumbnail timestamp selection (1s vs midpoint): No authoritative source found. 1-second timestamp is common practice to avoid black first frames. Marked for validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via npm, versions confirmed, existing codebase patterns established
- Architecture: HIGH - Building on well-established Phase 6 patterns (IPC bridge, Zustand slices, preload bridge, block store). Minimal new architectural decisions.
- Pitfalls: HIGH - Based on direct codebase analysis (BlockRef protobuf, envelope size limits, ASAR packaging) and verified library documentation

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable domain, no rapidly-changing dependencies)
