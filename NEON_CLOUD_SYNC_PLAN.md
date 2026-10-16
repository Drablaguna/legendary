# Architectural Plan: Neon Database Integration & Offline-First Cloud Sync for Legendary To-Do

## 1. Executive Summary

This document outlines the architectural blueprint to transition **Legendary To-Do** from a purely client-side `localStorage` application to a cloud-synced, offline-first application hosted on **Cloudflare Pages** and backed by **Neon Serverless Postgres** (Free Tier).

### Key Architectural Tenets
1. **Zero-Latency Local-First Experience**: All UI reads and writes happen instantaneously against local storage (or IndexedDB). The user never waits on network requests.
2. **Offline-First Resilience**: Full functionality offline. Changes are stored in a persistent mutation queue (outbox) and automatically synchronized when connectivity is restored.
3. **Neon Free Tier & Performance Optimization**: Drastically minimize Neon compute time and round-trips via debounced mutation batching, avoiding compute wake-ups for idle or continuous operations.
4. **Secure Edge Middleware**: Cloudflare Pages Functions act as the serverless API proxy between Vue and Neon to keep database credentials secure and leverage edge HTTP connection pooling.

---

## 2. Neon Free Tier Analysis & Optimization Strategy

### 2.1 Understanding Neon Free Tier Constraints
Neon's free tier is generous but has specific operational dynamics to design around:
- **Compute Auto-Suspend**: Compute instances scale down to 0 after 5 minutes of inactivity. Cold start wake-up typically takes **~500ms–1.5s**.
- **Active Compute Hours**: Free tier grants ~100 active compute hours per month. If queries are fired continuously every few seconds, the instance will never suspend, quickly exhausting the quota.
- **Storage Limits**: 0.5 GiB (more than enough for tens of thousands of tasks, notes, and sessions).
- **Connection Limits**: Direct TCP connection limits apply, but Neon provides a serverless HTTP driver (`@neondatabase/serverless`) designed specifically for serverless/edge environments like Cloudflare Workers.

### 2.2 Impact on To-Do App Operations
- **Focus Timer**: The app computes seconds on the fly via `Date.now() - timer.startedAt`. The timer **does not write to storage every second**. Storage is only touched when starting/stopping sessions. This means the timer will **not** spam the database.
- **Keystroke Writes (Search / Form Drafts)**: Search is purely local. Form typing must not trigger remote database writes until "Save" is explicitly clicked.
- **Micro-Edits (Dragging, Toggling Done, Bulk Actions)**: Rapid toggles or bulk deletes could trigger dozens of queries if unthrottled.

### 2.3 Optimization Mitigation
- **Debounced Batching**: Batch local mutations and sync in bulk (e.g., 2–5 seconds debounce window or upon form save).
- **HTTP Query Transport**: Use `@neondatabase/serverless` over HTTP (`neon(DATABASE_URL)`). This eliminates TCP handshake overhead on edge cold starts and avoids pooling limits.
- **Delta Syncing**: Only push modified or newly created records, and pull only changes updated since `last_synced_at`.

---

## 3. Cloud Architecture & Data Flow

```
┌────────────────────────────────────────────────────────┐
│                   Client Browser                       │
│  ┌───────────────────────┐    ┌──────────────────────┐ │
│  │   Vue 3 Components    │◄──►│  Reactive UI Store   │ │
│  └───────────────────────┘    └──────────┬───────────┘ │
│                                          │             │
│                       Immediate Local    ▼             │
│                       Read/Write   ┌───────────┐       │
│                                    │ IndexedDB │       │
│                                    │  / Cache  │       │
│                                    └─────┬─────┘       │
│                                          │             │
│                         Offline Outbox   ▼             │
│                         Mutation Queue ┌─────────────┐ │
│                                        │ Sync Engine │ │
│                                        └─────┬───────┘ │
└──────────────────────────────────────────────┼─────────┘
                                               │ HTTPS Batched / Delta
                                               ▼
┌────────────────────────────────────────────────────────┐
│         Cloudflare Pages (Static Hosting & Edge)       │
│  ┌──────────────────────────────────────────────────┐  │
│  │   Cloudflare Pages Functions (/api/sync)         │  │
│  │   - Auth / Session validation (or user token)    │  │
│  │   - JSON Payload parsing                         │  │
│  │   - @neondatabase/serverless HTTP query driver   │  │
│  └──────────────────────────┬───────────────────────┘  │
└─────────────────────────────┼──────────────────────────┘
                              │ HTTP Pooled Queries
                              ▼
┌────────────────────────────────────────────────────────┐
│               Neon Serverless Postgres                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database (Free Tier)                 │  │
│  │  - users / domains / items / sessions / trash    │  │
│  │  - Single Transaction Batch Upserts              │  │
│  │  - Auto-suspends after 5 min idle                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Offline-First Sync Architecture

### 4.1 Mutation Outbox Pattern
Every state-changing action creates a local mutation record added to an `outbox` table in local storage:

```typescript
interface OutboxMutation {
  id: string;              // Unique UUID for the mutation
  table: "items" | "trash" | "settings";
  action: "UPSERT" | "DELETE";
  entityId: string;
  data: any;
  timestamp: number;
}
```

### 4.2 Sync Engine Lifecycle
1. **Optimistic Local Update**:
   - The UI immediately updates local state and writes to persistent storage.
   - Mutation is queued in `outbox`.
   - UI displays a subtle sync status indicator (`● Synced`, `↻ Syncing...`, or `◌ Offline`).
2. **Network Detection & Online Event**:
   - `window.addEventListener('online', triggerSync)` automatically triggers processing when network connectivity returns.
3. **Debounced Sync Trigger**:
   - While online, any new mutation sets a timer (e.g. 3-second debounce).
   - If more edits occur within the window, mutations are aggregated.
4. **Push & Pull Protocol (`POST /api/sync`)**:
   - Client sends:
     - `mutations`: Array of queued local operations.
     - `lastSyncedAt`: Timestamp of the last successful pull.
     - `clientId`: Unique client instance identifier.
   - Server processes in a single transaction:
     - Applies `mutations` using **Last-Write-Wins (LWW)** based on `updated_at`.
     - Queries all rows where `updated_at > lastSyncedAt`.
     - Returns `{ appliedIds: string[], serverChanges: { items, trash, settings }, serverTime: number }`.
   - Client reconciles:
     - Removes `appliedIds` from local outbox.
     - Merges `serverChanges` into local storage.
     - Updates `lastSyncedAt` to `serverTime`.

---

## 5. PostgreSQL Schema for Neon

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domain enum / lookup
CREATE TABLE IF NOT EXISTS domains (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL
);

INSERT INTO domains (id, name) VALUES 
('client', 'Client'),
('work', 'Work'),
('personal', 'Personal')
ON CONFLICT DO NOTHING;

-- Primary Items Table
CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(64) PRIMARY KEY,
    domain_id VARCHAR(32) REFERENCES domains(id) DEFAULT 'client',
    parent_id VARCHAR(64) REFERENCES items(id) ON DELETE SET NULL,
    tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    title VARCHAR(255) NOT NULL,
    notes TEXT DEFAULT '',
    done BOOLEAN DEFAULT FALSE,
    due_at BIGINT,
    target VARCHAR(16),
    time_spent BIGINT DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_items_domain_done ON items(domain_id, done);
CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);

-- Focus Timer Sessions Table
CREATE TABLE IF NOT EXISTS timer_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id VARCHAR(64) REFERENCES items(id) ON DELETE CASCADE,
    started_at BIGINT NOT NULL,
    seconds INTEGER NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timer_sessions_item ON timer_sessions(item_id);

-- Trash Table (Deleted items retained for 30 days)
CREATE TABLE IF NOT EXISTS trash_entries (
    id VARCHAR(64) PRIMARY KEY,
    root_id VARCHAR(64) NOT NULL,
    deleted_at BIGINT NOT NULL,
    payload JSONB NOT NULL,
    updated_at BIGINT NOT NULL
);

-- User / Global Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(64) PRIMARY KEY,
    theme VARCHAR(16) DEFAULT 'dark',
    xp_config JSONB NOT NULL,
    updated_at BIGINT NOT NULL
);
```

---

## 6. Implementation Plan & File Modifications

### Phase 1: Edge API Layer on Cloudflare Pages
- **Path**: `functions/api/sync.js`
- **Dependencies**: `@neondatabase/serverless`
- **Functionality**:
  - Accept batched mutations and `lastSyncedAt`.
  - Open a serverless HTTP client using `context.env.DATABASE_URL`.
  - Execute batch upserts and deletes within a transaction.
  - Return updated server records for downstream delta sync.

### Phase 2: Local Storage Enhancement (Outbox & IndexedDB)
- **File**: [`src/services/storage.js`](file:///c:/Users/Drablaguna/Desktop/Legendary/src/services/storage.js) (new)
  - Abstraction layer over local persistence: maintains items, settings, trash, and the `outbox` queue.
  - Transparent fallback between `IndexedDB` and `localStorage`.

### Phase 3: Sync Engine Composable
- **File**: [`src/composables/useSyncEngine.js`](file:///c:/Users/Drablaguna/Desktop/Legendary/src/composables/useSyncEngine.js) (new)
  - Monitors `navigator.onLine` and `window.addEventListener('online')`.
  - Provides reactive status: `syncStatus` (`synced`, `syncing`, `offline`, `error`).
  - Manages the debounced sync queue: aggregates changes and executes `POST /api/sync`.
  - Exposes manual "Sync Now" trigger.

### Phase 4: Store Refactoring
- **File**: [`src/store/todoStore.js`](file:///c:/Users/Drablaguna/Desktop/Legendary/src/store/todoStore.js)
  - Hook every mutation (`createItem`, `updateItem`, `deleteItem`, `toggleDone`, `stopTimer`, `setTheme`) into the Outbox.
  - Keep state mutations synchronous for zero UI latency.
  - Trigger `scheduleSync()` asynchronously in the background.

### Phase 5: UI Sync Indicator
- **File**: [`src/views/HomeView.vue`](file:///c:/Users/Drablaguna/Desktop/Legendary/src/views/HomeView.vue) & [`src/views/SettingsView.vue`](file:///c:/Users/Drablaguna/Desktop/Legendary/src/views/SettingsView.vue)
  - Add an unobtrusive cloud status icon in the header (e.g., green dot for synced, amber for offline, spinning for syncing).
  - Add a "Sync & Storage" section in Settings showing last synced timestamp, pending offline changes, and a "Force Sync" button.

---

## 7. Performance & Cost Risk Assessment

| Potential Issue | Risk Level | Mitigation in Proposed Architecture |
| :--- | :--- | :--- |
| **Exceeding Free Compute Hours** | High if unthrottled | **3–5s Debounce + Outbox Batching**: Aggregates 10 quick edits into 1 single HTTP transaction. Compute goes to sleep 5 min after active use. |
| **Cold Start Latency** | Low for user, Medium for sync | UI is 100% optimistic local-first. The user experiences **0ms latency** regardless of whether Neon is suspended or waking up. |
| **Concurrent Edit Conflicts** | Low for single-user, Medium for multi-device | Record-level **Last-Write-Wins (LWW)** with epoch millisecond timestamps (`updated_at`). |
| **Storage Quota Exceeded** | Very Low | Tasks and timer sessions consume < 10 MB for several years of heavy personal use. |

---

## 8. Deployment Checklist for Cloudflare Pages

1. **Create Neon Database**:
   - Create project in Neon console and retrieve Postgres connection string (`postgres://...`).
   - Run the initial SQL migration script.
2. **Cloudflare Pages Setup**:
   - Connect Git repository to Cloudflare Pages.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node compatibility flag: `nodejs_compat` enabled.
3. **Environment Variables**:
   - In Cloudflare Pages dashboard: Set `DATABASE_URL` (secured, not exposed to browser).
4. **Deploy & Validate**:
   - Test offline mode via browser DevTools ("Network: Offline").
   - Perform edits, inspect outbox, restore network, and verify seamless database sync.
