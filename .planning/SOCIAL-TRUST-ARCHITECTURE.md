# Social Trust Architecture: UNITED

**Defined:** 2026-02-23
**Status:** Design complete, pending phase assignment

## Design Principles

1. **Pro-social behavior must be the path of least resistance.** The system's structure should make cooperation natural and defection costly — without scores, surveillance, or economic stakes.
2. **Trust is earned through time and participation, not purchased or self-declared.** Proven by Discourse (10+ years) and Wikipedia (20+ years) at scale.
3. **No visible reputation scores.** Slashdot and Stack Overflow proved that visible scores produce gaming, hierarchy, and toxicity. Internal mechanics may use hidden scores; users never see numbers.
4. **Server admins are the trust authority.** Aligns with UNITED's sovereignty model. No platform-level trust or moderation. Each community governs itself (Ostrom's Principle 3).
5. **Psychological safety over behavioral surveillance.** Monitoring chills expression (Edmondson, Google Project Aristotle). Reactive moderation (respond to reports) over proactive surveillance (analyze everyone).
6. **Connection and belonging build trust.** Social Identity Theory shows group belonging is a stronger trust driver than individual scoring. Invest in making people feel connected, not evaluated.

## Design Rationale

This architecture was chosen after evaluating trust, reputation, and Sybil resistance models across game theory, behavioral psychology, and 12 real-world implementations, including analysis of EigenTrust, SybilGuard/SybilRank, Token Curated Registries, proper scoring rules, Self-Determination Theory, Ostrom's 8 principles for commons governance, and Dunbar's number.

Key findings that drove the design:

- **Game-theoretic scoring sounds good but fails in practice.** Every production system that deployed complex reputation scoring (Slashdot, Stack Overflow, TCRs) either simplified it or suffered toxicity. Discourse's simple time-based system outperforms all complex alternatives studied.
- **Extrinsic rewards crowd out intrinsic motivation.** Self-Determination Theory (Deci & Ryan) and motivation crowding research show that scoring and staking transform relational acts into transactional ones, destroying the genuine cooperation they aim to measure.
- **Goodhart's Law is inescapable.** "When a measure becomes a target, it ceases to be a good measure." Slashdot's creator "always regretted" making karma visible. Stack Overflow's reputation system created gatekeeping that 73% of users said made the site unwelcoming.
- **Ostrom beats algorithms.** Nobel Prize-winning research across 800+ commons governance cases found that self-governed communities outperform externally imposed rules. The single strongest predictor: the governed write the rules.
- **Behavioral surveillance destroys psychological safety.** Edmondson's research (validated by Google's Project Aristotle) shows psychological safety is "by far the most important" dynamic for group effectiveness. Scoring behavior creates chilling effects.
- **Triadic closure builds trust without scoring.** A 2025 PNAS field experiment showed that even minimal mutual-connection cues increase tie formation by 35%. Social connection discovery achieves trust formation without any scoring system.
- **Small, curated networks are where trust signals work best.** Bapna et al. (2017, MIS Quarterly) showed mutual friend signals are most meaningful in smaller networks — exactly UNITED's server-based model.

---

## Layer 1: Structural Friction

The proven Discourse/Wikipedia pattern: time and participation unlock capabilities automatically.

### New Member Capabilities

New members join with restricted capabilities that unlock through normal participation:

```
Capability gates (server-admin configurable, sensible defaults):

  Post text messages:        Immediate (no restriction)
  React to messages:         Immediate
  Post links:                After 20 messages read + 3 days on server
  Upload files/images:       After 20 messages read + 3 days on server
  Use @mentions:             After 20 messages read + 3 days on server
  Join voice channels:       After 5 messages sent + 1 day on server
  Create invite links:       After 50 messages read + 10 sent + 7 days
  Use @everyone/@here:       Admin-granted only (never auto-unlocked)
```

### Why These Specific Gates

| Gate | Rationale | Evidence |
|------|-----------|---------|
| Reading requirement | Lurking proves engagement, not just account creation | Discourse's most effective anti-spam insight |
| Time requirement | Creates a minimum cost for bot/Sybil accounts | Wikipedia: 4 days + 10 edits catches most vandals |
| Links/files gated | 90%+ of spam involves links or file uploads | Discourse TL0 restriction eliminates link spam |
| Voice delayed | Prevents voice-channel disruption by new accounts | Low friction (1 day) but filters drive-by trolling |
| Invites earned | Limits Sybil expansion rate per inviter | Rate-limited onboarding proven in invite-only communities |
| @everyone never auto-unlocked | Highest-abuse capability | Every platform that auto-grants this regrets it |

### Rate Limiting

New members (first 7 days): rate-limited to configurable messages per minute (default: 5/min). Prevents bot spam without affecting normal conversation. Rate limit lifts automatically after the time gate.

### Invitation Chains

When invite-only mode is enabled:

```
Invitation tracking:
  1. Member A creates invite link
  2. Person B uses invite → server records: B invited by A
  3. B later invites C → server records: C invited by B (chain: A → B → C)
  4. Admin can view full invitation tree
  5. Per-member invite limit: configurable (default: 3 active invites per week)
```

If a bad-actor cluster is detected, the admin can trace the invitation chain to the source inviter and assess whether it was negligence or complicity. This provides accountability without scoring.

### Server Admin Configuration

All thresholds configurable via server settings:

```toml
# Default server config
[trust.gates]
read_messages_for_links = 20
days_for_links = 3
sent_messages_for_voice = 5
days_for_voice = 1
read_messages_for_invites = 50
sent_messages_for_invites = 10
days_for_invites = 7

[trust.rate_limits]
new_member_messages_per_minute = 5
new_member_period_days = 7

[trust.invites]
max_active_invites_per_week = 3
invite_expiry_hours = 48
track_invitation_chains = true
```

Admins can disable any gate or set thresholds to zero for open communities.

---

## Layer 2: Community Identity & Norms

Trust comes from belonging. This layer invests in making communities feel cohesive and self-governed.

### Community Onboarding

When a new user joins a server, present community guidelines as a shared commitment:

```
Welcome to [Server Name]!

Here's what we value as a community:
  ✦ [Admin-written community values]
  ✦ [Admin-written community values]

You're one of us now. Here's how to get started:
  → Introduce yourself in #introductions
  → Check out #general for current conversations
  → [Admin-configured getting-started tips]
```

The framing is "you are one of us" — not "here are the rules you must obey." Social Identity Theory predicts this increases identification with the community and therefore cooperative behavior.

### Prosocial Nudges

Simple, structural prompts at friction points (not continuous monitoring):

- **First post prompt**: "Welcome! This is your first message in [#channel]. [Community norm reminder]."
- **Heated thread indicator**: When message velocity in a channel exceeds a threshold, display a subtle banner: "This conversation is moving fast. Take a moment before replying."
- **Social proof**: "87% of members in this server participate in #introductions" (encouraging onboarding completion).

These are the "norm reminders" that a Reddit r/science field experiment found increased rule-following comments by 8% and new user participation by 70%.

### Community Self-Governance (Ostrom Principles)

The platform provides governance toolkits that communities can adopt, adapt, or reject:

- **Norm templates**: Pre-written community guidelines for common server types (gaming, development, support, general). Admins customize freely.
- **Graduated sanctions template**: Warning → mute → temporary ban → permanent ban. Admins configure timeouts and thresholds.
- **Conflict resolution interface**: Structured mediation tool where two users in dispute can present their perspectives to a moderator. Ostrom's Principle 6 — accessible, low-cost conflict resolution. Almost universally missing from digital platforms.

---

## Layer 2b: Social Connection Discovery

Leverage triadic closure and small-world delight to build trust through curiosity, not scoring.

### Research Basis

All findings are causal or strongly replicated:

| Finding | Source | Strength |
|---------|--------|----------|
| Minimal mutual-connection cues increase tie formation by 35% | PNAS 2025 field experiment | Causal |
| Ambient social awareness improves "who knows whom" by 88% | Leonardi 2015 field experiment | Causal |
| Small-world discovery triggers dopamine/surprise pathways | Milgram 1967; Watts 2003 | Strongly replicated |
| Trust transfers bidirectionally through mutual connections | Golbeck 2009, PLOS ONE | Strong |
| Mutual friend signals most meaningful in smaller networks | Bapna et al. 2017, MIS Quarterly | Causal |
| Curiosity-driven exploration > obligation-driven scoring | Information gap theory; SDT | Well-established |

### Feature: Connection Facts

Available to all users immediately — no gates. Serves as onboarding warmth for newcomers.

When viewing another user's profile, ambient social context is surfaced in the profile sidebar:

```
Connection facts (examples):
  "You and Jordan are both in the Rust Devs server"
  "Your friend Alex is also friends with Jordan"
  "You and Jordan both joined this server in its first month"
  "You and Jordan are both in GameDev Hub and Rust Devs" (cross-server, opt-in)
```

### Design Rules

These are evidence-derived, non-negotiable design constraints:

1. **Show shared connections, never connection counts.** "You and Alex both know Jordan" (delight, trust). "Alex has 200 connections" (social comparison, envy — WeChat 2024 study).

2. **Surface surprising/bridging connections.** Prioritize cross-community discoveries over confirming in-server relationships. Two people from different servers sharing a friend is far more delightful (Granovetter: weak/bridging ties are more socially valuable than reinforcing in-group bonds).

3. **Ambient presentation, not notifications.** Profile sidebars and hover cards only. Never push-notify. Leonardi's research: passive observation is how social metaknowledge develops naturally.

4. **Fully opt-in and controllable.** Users choose what connection information is visible about them. Opting out removes you from ALL connection facts — no leaking through mutual friends of opted-in users. (Pittsburgh 2013: researchers mapped 60%+ of "private" friends via mutual connection data on Facebook.)

5. **Never surface absence of connections.** If no shared connections exist, show nothing. "You have no shared connections" amplifies exclusion for peripheral/new users.

6. **Safety mode.** One prominent toggle: "Hide all my connection information." When enabled, the user is invisible in all connection facts for all other users. Designed for users in domestic violence, stalking, or harassment situations.

7. **Quality over quantity.** Display meaningful shared context (shared servers, shared friends, shared join timing) rather than raw numbers. Bapna et al.: mutual friend counts lose signal in larger networks; specific shared connections retain meaning.

### Cross-Server Implementation

Connection facts can span across servers when both users have opted in:

```
Cross-server connection sharing:
  1. Default: OFF (privacy-first)
  2. User enables "Share my server memberships for connection discovery" in settings
  3. When BOTH users have opted in, connection facts show:
     - Full server names they share
     - Mutual friends across servers
  4. Identity resolution: Ed25519 fingerprint (same keypair across servers)
  5. Computation: CLIENT-SIDE ONLY
     - User's client knows which servers they're on
     - Client matches fingerprints from member lists it has already fetched
     - Servers never exchange user lists or query each other about users
     - No new server-to-server protocol needed
```

### Privacy Risk Mitigations

| Risk | Evidence | Mitigation |
|------|----------|------------|
| Graph reconstruction attacks | Joshi et al. 2013: 60%+ of private friends exposed via mutual connections | Opt-in only; opting out removes you from ALL connection facts |
| Social engineering | Users lower defenses when mutual connections shown | Never auto-display connections involving very-new accounts (< 1 day) |
| Stalking/abuse | Abusers can map connections to locate targets | Safety mode: one toggle hides all connection data globally |
| Social comparison/envy | WeChat 2024: mutual-friend visibility caused jealousy | Never show counts; only show shared connections |
| Exclusion amplification | Peripheral users feel worse seeing sparse graphs | Never surface absence; show facts only when positive |
| Cross-server data leakage | Server A could learn user is also on Server B | Client-side computation only; servers never exchange user lists |

---

## Layer 3: Admin Moderation Toolkit

Server-admin moderation is the pattern that works. Matrix, Mastodon, EVE Online, and Second Life all use it successfully. Extend it, don't replace it.

### Existing (Already Designed)

- **Kick** (SRVR-05): Remove a user from the server; they can rejoin
- **Ban** (SRVR-06): Remove a user and prevent rejoining; propagated to peers
- **Roles and permissions** (SRVR-03/04): Admin-defined role hierarchy with granular permissions

### New: Shared Blocklists

Server admins can subscribe to ban lists maintained by other admins they trust:

```
Shared blocklists:
  1. Server A bans user X (Ed25519 fingerprint)
  2. Server A publishes ban record: { fingerprint, reason, timestamp, admin_signature }
  3. Server B subscribes to Server A's ban list
  4. Server B admin sees notification: "User X was banned from Server A for: [reason]"
  5. Server B admin decides: import ban, ignore, or watch
  6. Decision is always the subscribing admin's — never automatic
```

Modeled on Mastodon's community blocklists and Matrix's Mjolnir policy lists. Practical, proven, decentralized.

### New: Behavioral Flags

Automated detection of obviously suspicious patterns, flagged to admin for human review:

```
Flaggable patterns (never auto-punish):
  - Rapid account creation from same IP range
  - Link spam (high link-to-text ratio in first messages)
  - Abnormal posting cadence (consistent machine-like intervals)
  - Mass DM sending to new contacts
  - Repeated exact-duplicate messages across channels
```

The admin dashboard shows flagged accounts with the reason. The admin reviews and decides. This is the Wikipedia ClueBot pattern: automated detection catches the obvious 95%, humans handle edge cases. False positive rate for behavioral sockpuppet detection is ~16% (Wikipedia research) — too high for automated punishment, acceptable for flagging.

### New: Moderation Audit Log

All moderation actions logged, visible to the admin team:

```
Audit log entry:
  {
    action: "ban",
    target_fingerprint: "ABCDE-FGHIJ-KLMNO-PQRST",
    admin_fingerprint: "VWXYZ-ABCDE-FGHIJ-KLMNO",
    reason: "Spam — posted phishing links in #general",
    timestamp: "2026-03-15T14:30:00Z",
    evidence: [message_id_1, message_id_2]
  }
```

Transparency within the admin team prevents abuse of power and supports Ostrom's Principle 4 (monitoring by community members accountable to the community).

### New: Graduated Sanctions

Ostrom's Principle 5 — proportional responses:

```
Graduated sanctions (configurable):
  1. Warning (visible only to the user + admin team)
  2. Mute (cannot send messages for N hours/days)
  3. Temporary ban (removed from server for N days, can rejoin after)
  4. Permanent ban (removed and blocked by fingerprint)
```

Admin chooses the level. The system suggests the next appropriate step based on prior sanctions for that user, but the admin always decides.

---

## Layer 4: Hidden Trust Mechanics (v1.x — Only If Needed)

This layer is **designed but not implemented in v1**. Deployed only if Layers 1-3 are insufficient for real problems that emerge in production.

### Hidden Trust Score

If deployed, a composite score from objective signals:

```
Trust score components (all server-local):
  - Time on server (days since join)
  - Activity level (messages read, messages sent, normalized)
  - Admin interactions (flags received, warnings, mutes — negative signals)
  - Invitation chain depth (how many hops from admin/founder)
  - Sanctions history (prior warnings, mutes, temp bans)
```

Drives internal mechanics only:
- Message delivery priority during high-load situations
- Flag weight when reporting other users (more established users' reports weighted higher)
- Behavioral flag sensitivity (lower sensitivity for established users to reduce false positives)

**Never displayed to users.** Never called "trust" or "reputation" in the UI. No API endpoint exposes the score.

### Capability-Based Permissions

Instead of monolithic trust levels, individual capabilities unlock independently:

```
Capability matrix (independent axes):
  can_post_links:      time_gate OR admin_override
  can_upload_files:     time_gate OR admin_override
  can_invite:           time_gate OR admin_override
  flag_weight:          hidden_score (if deployed)
  vouch_for_newcomer:   not in v1
```

Modeled on Discourse's recent evolution from trust levels to group-based permissions.

### Trust Decay

Inactive accounts gradually lose accumulated hidden trust. Prevents early-mover advantage and "ghost trustees." After N days of inactivity (configurable, default: 90), trust begins to decay toward the "established but inactive" baseline.

### Anti-Whitewashing

New Ed25519 keypairs on the same server start at zero regardless of the user's claim to be "the same person." Combined with invitation chain tracking, this makes identity recycling costly — you need to find a new inviter willing to spend one of their limited invite slots.

---

## What We're NOT Building (And Why)

| Mechanism | Why Not | Evidence |
|-----------|---------|----------|
| **Visible trust/reputation scores** | Gaming becomes the dominant strategy; creates hierarchy and toxicity | Slashdot (creator regretted it), Stack Overflow (73% said still unwelcoming) |
| **Vouching with stake** | No evidence of success in social platforms; crowds out intrinsic motivation; creates plutocracy | TCR failures, SDT motivation crowding, DAO plutocracy research |
| **Iterated prisoner's dilemma mechanics** | Wrong model — community interaction is multilateral, asymmetric, continuous, not bilateral repeated games | Mechanism design literature; IPD produces grudging minimal cooperation |
| **Behavioral entropy surveillance** | Destroys psychological safety; 16% false positive rate is unacceptable for auto-punishment | Edmondson (psych safety), Wikipedia (false positive rate), chilling effects research |
| **Portable trust attestations (v1)** | No production system has achieved this; trust is context-dependent | Matrix (6+ years failed portability), cross-platform trust research |
| **Complex game-theoretic scoring** | Every real system that tried this simplified over time | Discourse simple > all complex alternatives studied |

---

## Threat Model

### What This Protects Against

| Threat | Protection |
|--------|------------|
| **Bot spam** | Time + reading gates prevent immediate link/file spam. Rate limiting caps message velocity. Behavioral flags catch machine-like patterns. |
| **Sybil attacks (bulk accounts)** | Invite-only mode + invitation chain tracking + per-member invite limits. Each fake account costs a real invite from a real member. |
| **Drive-by trolling** | Capability gates delay voice access and @mentions. Graduated sanctions provide proportional response. |
| **Coordinated raids** | Rate limiting + behavioral flags detect rapid account creation. Shared blocklists propagate bans across subscribing servers. |
| **Social engineering** | Connection facts never display for very-new accounts. Safety mode hides connection data for vulnerable users. |
| **Admin abuse of power** | Moderation audit log provides transparency. Community self-governance principles encourage accountability. |
| **Community fragmentation** | Connection discovery promotes cross-group ties. Prosocial nudges encourage constructive interaction. |

### What This Does NOT Protect Against

| Threat | Why | Mitigation |
|--------|-----|------------|
| **Sophisticated long-con infiltrators** | A patient human who participates genuinely for months cannot be detected by any system | EVE Online teaches us: this is an irreducible risk. The damage is bounded by the trust earned. |
| **Admin tyranny** | Server admin has final authority by design | Sovereignty model: users can leave. Audit log provides evidence for community pressure. |
| **Large-scale coordinated attack** | A well-funded attacker can maintain multiple genuine-seeming accounts over months | Invitation chain tracking limits the rate. Layer 4 hidden trust mechanics (if deployed) can weight flag credibility. |
| **Social graph deanonymization** | Client-side cross-server matching could be reverse-engineered | Cross-server connection sharing is opt-in with default off. Safety mode provides full invisibility. |

---

## Implementation Notes

### Server-Side (Rust)

New capability gate tracking:
- Track per-user: messages_read, messages_sent, days_since_join, last_active
- Gate checks on message send: verify capability unlocked before allowing link/file/mention
- Invitation chain: store inviter_fingerprint in user record
- Behavioral flags: periodic background job (configurable interval) scans recent activity patterns
- Moderation audit log: append-only table in SQLite

### Client-Side (Electron/React)

Connection facts:
- Client already fetches member lists from each joined server
- Match Ed25519 fingerprints across local member list caches
- Compute connection facts locally — zero new server API calls
- Display in profile sidebar/hover card component
- Opt-in toggle in user settings (stored in local identity preferences, synced to servers as a preference flag)

### Database Schema Additions

```sql
-- Capability tracking
ALTER TABLE server_members ADD COLUMN messages_read INTEGER DEFAULT 0;
ALTER TABLE server_members ADD COLUMN messages_sent INTEGER DEFAULT 0;
ALTER TABLE server_members ADD COLUMN joined_at TIMESTAMP;
ALTER TABLE server_members ADD COLUMN last_active TIMESTAMP;
ALTER TABLE server_members ADD COLUMN invited_by TEXT; -- fingerprint of inviter

-- Moderation audit log
CREATE TABLE moderation_log (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,          -- 'warning', 'mute', 'temp_ban', 'ban', 'kick', 'unmute', 'unban'
    target_fingerprint TEXT NOT NULL,
    admin_fingerprint TEXT NOT NULL,
    reason TEXT,
    evidence TEXT,                 -- JSON array of message IDs
    duration_hours INTEGER,        -- for mute/temp_ban
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Behavioral flags
CREATE TABLE behavioral_flags (
    id INTEGER PRIMARY KEY,
    target_fingerprint TEXT NOT NULL,
    flag_type TEXT NOT NULL,       -- 'link_spam', 'rapid_creation', 'machine_cadence', 'mass_dm', 'duplicate_messages'
    details TEXT,                  -- JSON with specifics
    reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by TEXT,              -- admin fingerprint
    review_action TEXT,            -- 'dismissed', 'warned', 'muted', 'banned'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shared blocklist subscriptions
CREATE TABLE blocklist_subscriptions (
    id INTEGER PRIMARY KEY,
    source_server_url TEXT NOT NULL,
    source_server_fingerprint TEXT NOT NULL,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    auto_import BOOLEAN DEFAULT FALSE  -- always false in v1, admin reviews each ban
);

CREATE TABLE blocklist_entries (
    id INTEGER PRIMARY KEY,
    subscription_id INTEGER REFERENCES blocklist_subscriptions(id),
    target_fingerprint TEXT NOT NULL,
    reason TEXT,
    banned_at TIMESTAMP,
    imported BOOLEAN DEFAULT FALSE,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP
);
```

### Configuration

```toml
# Server config additions for social trust
[trust.gates]
read_messages_for_links = 20
days_for_links = 3
sent_messages_for_voice = 5
days_for_voice = 1
read_messages_for_invites = 50
sent_messages_for_invites = 10
days_for_invites = 7

[trust.rate_limits]
new_member_messages_per_minute = 5
new_member_period_days = 7

[trust.invites]
max_active_invites_per_week = 3
invite_expiry_hours = 48
track_invitation_chains = true

[trust.behavioral_flags]
enabled = true
scan_interval_minutes = 15
link_spam_threshold = 0.5          # link-to-text ratio
machine_cadence_variance_ms = 100  # suspiciously consistent timing
mass_dm_threshold = 10             # DMs to new contacts per hour
duplicate_message_threshold = 3    # same message in different channels

[trust.moderation]
graduated_sanctions = true
default_mute_hours = 24
default_temp_ban_days = 7
audit_log_retention_days = 365

[trust.connection_facts]
enabled = true
cross_server_enabled = true
min_account_age_for_display_hours = 24  # don't show connection facts for brand-new accounts
```

---

## v2 Upgrade Path

Features explicitly deferred from v1, with design hooks for future addition:

| Feature | v2 Approach | Why Deferred |
|---------|-------------|-------------|
| **Hidden trust mechanics** | Layer 4 composite score driving internal mechanics | Not needed until Layers 1-3 prove insufficient |
| **Subjective/relative trust** | Each user sees trust filtered through their own graph position (Matrix/Trustnet model) | Requires mature social graph; premature optimization |
| **Server-local EigenTrust** | L-Level EigenTrust variant for servers 500+ users | Small servers don't have enough graph structure |
| **Zero-knowledge trust proofs** | Prove "member in good standing for 6+ months" without revealing server | ZK tooling still maturing; cross-server trust is unsolved |
| **Formal Sybil bounds** | SybilRank-style algorithms for large communities | Requires graph size assumptions that don't hold for small servers |
| **Proper scoring rules** | Incentive-compatible mechanism where accurate assessors gain credibility | Requires enough behavioral data to score against outcomes |
| **Cross-server trust attestations** | Only after ZK proofs are solved; trust is context-dependent | No production system has achieved portable trust |
| **AI-assisted moderation** | Content classification to assist admin review | Privacy implications need careful design |

---

## Research Sources

This design was informed by independent research across three domains:

**Game Theory & Mechanism Design:**
- EigenTrust (Kamvar et al., 2003) — eigenvector-based P2P reputation
- EigenTrust++ (Fan et al., Georgia Tech) — hardened against four attack models
- L-Level EigenTrust (2024) — distributed adaptive weighting
- SybilGuard/SybilLimit (Yu et al., 2006/2008) — social-graph Sybil defense
- SybilRank — random-walk Sybil detection (deployed at Facebook/Tuenti)
- SybilBelief/SybilSCAR — Sybil detection under weak homophily
- SoK: Sybil defense (Alvisi et al., Cornell) — survey of all social-graph defenses
- Jurca & Faltings — incentive-compatible reputation requires side payments
- Proper scoring rules — provably incentive-compatible assessment mechanisms
- Token Curated Registries — documented failures (CoinFund, Multicoin Capital analyses)
- DAO plutocracy research (Buterin) — stake-based governance concentrates power

**Behavioral Psychology:**
- Self-Determination Theory (Deci & Ryan, 2000) — autonomy, competence, relatedness
- Motivation crowding theory — extrinsic rewards destroy intrinsic motivation
- Social Identity Theory (Tajfel & Turner) — group belonging drives cooperation
- Dunbar's Number — trust meaningful at ~150; above that, shared purpose binds
- Ostrom's 8 Design Principles (Nobel Prize) — commons self-governance across 800+ cases
- Psychological Safety (Edmondson, 1999; Google Project Aristotle) — most important group dynamic
- Goodhart's Law — measures become targets, ceasing to measure what matters
- Nudge Theory (Thaler & Sunstein) — simple defaults outperform complex mechanisms
- Procedural Justice (Tyler) — perceived fairness predicts cooperation
- Triadic Closure (Simmel 1908, Granovetter 1973) — mutual connections drive tie formation
- Small-World phenomenon (Milgram 1967, Watts 2003) — connection discovery produces delight
- Ambient Awareness (Leonardi 2015) — passive social observation builds metaknowledge
- Trust Transference (Golbeck 2009) — trust transfers bidirectionally through mutual connections
- Strength of Weak Ties (Granovetter 1973) — bridging ties more valuable than bonding ties
- Social Capital (Putnam 2000) — bonding vs. bridging capital distinction

**Real-World Implementations Evaluated:**
- Discourse — trust levels 0-4, reading-based progression (most effective studied)
- Slashdot — karma and metamoderation (visible scores → gaming)
- Stack Overflow — reputation-gated power (gatekeeping, unwelcoming community)
- Wikipedia — ClueBot NG, autoconfirmed users, WikiTrust, sockpuppet detection
- Mastodon/Fediverse — defederation, shared blocklists, 2024 spam attacks
- Matrix/Element — Mjolnir/Draupnir, policy lists, homeserver trust model
- Scuttlebutt — friend-of-friend replication, implicit social-graph trust
- Signal/Briar — zero-reputation design, trust-on-first-use
- EVE Online — emergent social trust, long-con infiltration, social engineering
- Gitcoin Passport — multi-signal identity, cost-of-forgery framework
- Worldcoin — biometric identity failures, regulatory shutdowns
- Optimism RetroPGF — reputation-based allocation, popularity contest failure mode
- Facebook mutual friends — Bapna et al. trust study, Pittsburgh graph reconstruction attack
- WeChat Moments — friendship jealousy from mutual-friend visibility (2024)
- LinkedIn — shared connections as trust signal in professional contexts

---
*Defined: 2026-02-23*
*Last updated: 2026-02-23*
