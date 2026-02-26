# Phase 7: Media and Prefetching - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Rich media sharing (images, video, documents) with inline rendering, blurhash placeholders, seeding/contribution indicators, and predictive prefetching. Built on Phase 6's content-addressed block pipeline. This phase delivers the user-facing media experience — upload flows, visual rendering, swarm contribution visibility, and predictive loading.

Phase 6 handles the block store, cache cascade, retention, and encryption. This phase consumes that pipeline to deliver: file uploads chunked into blocks, inline media rendering, blurhash/micro-thumbnail transitions, seeding stats, and prefetching behavior.

</domain>

<decisions>
## Implementation Decisions

### Upload & sharing flow
- Three upload methods from day one: attachment button (paperclip/+ icon in composer), drag-and-drop onto chat area, clipboard paste (Ctrl+V for screenshots/copied images)
- File size limit: 100 MB per file, default. Admin-configurable in `united.toml`. Self-hosted = admin decides.
- Multiple attachments: up to 10 files per message
- Blocking send: file is chunked and distributed to the block store BEFORE the message is sent. Progress bar shown in the composer area below the file preview. Message only appears in chat when blocks are guaranteed to exist (at minimum on sender's machine and partially on server). No "uploading..." state visible to recipients.

### Inline media rendering
- Images: constrained max box (~400-500px wide, ~350px tall). Small images render at original size. Large images scale down preserving aspect ratio. Click any image to open full-screen lightbox.
- Videos: thumbnail (first frame or mid-point still) with play button overlay. Click to play inline with standard controls. No autoplay.
- Placeholder strategy (dual-role):
  - **Inline chat:** Micro-thumbnail (~100px JPEG, <5KB from Phase 6 gossip payload) as the blurry preview while full image loads from peers
  - **Lightbox:** Blurhash string (~30 bytes, also in gossip payload) renders as a smooth color gradient at full viewport size while the full-resolution image loads
  - Both encodings are carried in the gossip message: micro-thumbnail for inline context (you can see what the image is), blurhash for lightbox polish (smooth gradient at large size)

### Multi-image layout
- Adaptive grid based on image count:
  - 2 images: side by side, each half the max width
  - 3 images: one large (2/3 width) + two stacked small (1/3 width)
  - 4 images: 2x2 grid
  - 5+ images: 2x2 grid with "+N more" overlay on the 4th image
- Clicking "+N more" or any visible image opens the lightbox gallery with arrow navigation through all images in the message
- Mixed media (images + files in one message): images render in adaptive grid above, non-image file cards listed below. Clean separation, no interleaving.

### Seeding & contribution UI
- Full stats dashboard in Settings under a "Network" or "P2P" tab:
  - Upload/download totals (cumulative)
  - Seeding ratio (upload:download)
  - Blocks seeded count
  - Storage breakdown by tier (own messages, hot, warm, altruistic) — visual breakdown of the storage budget
- Optional compact status bar indicator: off by default, can be enabled in Settings ("Show network activity in status bar"). Shows upload/download arrows with speed when enabled.
- Stats are private only — no visibility to other users. No public badges, no profile contribution indicators. Consistent with the social trust architecture's "no visible scores" principle.

### Prefetch triggers & aggressiveness
- **Channel hover:** Hovering a channel in the sidebar prefetches the last 20 messages for that channel (text + metadata; micro-thumbnails come free from gossip)
- **App launch:** Prefetches two channels: (1) the last-viewed channel (user's context), (2) the most active channel (community pulse, typically #general). Keeps launch prefetching light.
- **Scroll position:** At 70% scroll position, prefetch the next batch of messages. Text + metadata only; full media loads on demand as messages scroll into view.
- **Media prefetch policy:** Server admin configures in `united.toml` whether full media prefetching is available or limited to text + metadata only. Server policy is final — no user override. Default: text + metadata only (bandwidth-conservative). Admin can enable full media prefetching for communities with ample bandwidth.

### Claude's Discretion
- Exact lightbox implementation (animation, controls, keyboard navigation)
- GIF/animated image handling (auto-play is standard — follow Discord/Slack convention)
- Download/save behavior (standard right-click save + download button on file cards)
- Adaptive grid aspect ratio handling for mixed landscape/portrait images
- Video thumbnail generation (first frame vs. mid-point selection)
- Compact status bar indicator design (arrow icons, placement, update frequency)
- File preview in composer before send (thumbnail + filename + size + remove button is standard)

</decisions>

<specifics>
## Specific Ideas

- Blocking send ensures recipients never see a "loading" attachment from a freshly-sent message — blocks are guaranteed to exist when the message arrives. Clean UX, simpler block pipeline.
- Dual placeholder strategy (micro-thumbnail inline + blurhash in lightbox) leverages each format's strength: micro-thumbnails are more informative at small sizes (you can see what the image is), blurhash is smoother at large sizes (gradient fills the viewport elegantly)
- App launch prefetching two channels (last-viewed + most active) captures both "my context" and "the community pulse" — users typically either continue where they left off or check the main chat
- Seeding stats being private-only is a deliberate choice aligned with the social trust architecture — no gamification of contribution, no visible scores, no "better member" signals

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-media-and-prefetching*
*Context gathered: 2026-02-25*
