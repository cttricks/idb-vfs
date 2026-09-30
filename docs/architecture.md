# Architecture Specification

`idb-vfs` is a browser-first, type-safe, versioned virtual file system that uses the browser's native **IndexedDB** as its persistent storage engine via [Dexie.js](https://dexie.org/).

---

## 1. High-Level Mental Model

```
+-------------------------------------------------------------+
|                     Application Layer                       |
|           (React, Next.js, Vue, Vanilla TS, Playground)     |
+-------------------------------------------------------------+
                              |
                     Public API Facade
            createFS() / terminateFS() / EventTarget
                              |
+-------------------------------------------------------------+
|                      Service Layer                          |
|   Files (CAS)   |   Nodes (Tree)   |   History (Undo/Redo)  |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                   Storage & Session Layer                   |
|                  Dexie.js IndexedDB Schema                  |
|    [nodes]   [fileVersions]   [history]   [sessionMeta]     |
+-------------------------------------------------------------+
```

1. **Session-Scoped File Trees**: Every file and folder belongs to a unique `sessionId`. Each session has a dedicated root directory (`/`).
2. **Content-Addressable Storage (CAS)**: File contents are stored immutably, keyed by their SHA-256 cryptographic digest. Identical contents share storage records.
3. **Linear History with Head Pointer**: All mutations create sequential history entries. The current session state points to a position in this history log, enabling seamless deterministic undo and redo.
4. **Reactive Event Emitter**: State mutations emit typed browser-native custom events (`FILE_CREATED`, `FILE_UPDATED`, etc.), enabling reactive UI updates without polling.

---

## 2. IndexedDB Schema & Dexie Stores

The database is registered under database name `idb-vfs` at version `2`. It manages 4 core object stores:

```ts
db.version(2).stores({
  nodes: "id, [sessionId+parentId]",
  fileVersions: "hash, fileId",
  history: "++id, timestamp",
  sessionMeta: "sessionId",
});
```

### 2.1 Object Stores Breakdown

| Table | Primary Key | Indexes | Purpose |
|---|---|---|---|
| `nodes` | `id` (string) | `[sessionId+parentId]` | Stores all file and folder metadata, tree hierarchy, parent-child relations, and active version pointers. |
| `fileVersions` | `hash` (SHA-256 hex string) | `fileId` | Stores immutable text content, keyed by content hash. Includes creation timestamp and owner `fileId`. |
| `history` | `id` (auto-increment int) | `timestamp` | Append-only ledger of filesystem operations per session, used for undo, redo, and audit logging. |
| `sessionMeta` | `sessionId` (string) | - | Tracks root node reference, history pointer position, creation time, and last updated time. |

---

## 3. Data Models

### 3.1 Node Tree Model

Every node is either a `FileNode` or a `FolderNode`.

```ts
export type NodeKind = "file" | "folder";

export interface BaseNode {
  id: string;             // e.g., "file:my-session:1710000000000-0"
  sessionId: string;      // The session owning this node
  parentId: string | null;// ID of parent folder, or null for root folder
  name: string;           // File or folder name (e.g. "index.ts")
  createdAt: number;      // Unix timestamp
  updatedAt: number;      // Unix timestamp
}

export interface FileNode extends BaseNode {
  kind: "file";
  currentVersionHash: string | null;  // Points to active hash in fileVersions
  originalVersionHash: string | null; // Initial hash upon creation
}

export interface FolderNode extends BaseNode {
  kind: "folder";
}
```

### 3.2 Content Versioning (CAS)

When file content is written or updated:
1. The SHA-256 digest of the UTF-8 content is calculated via browser `crypto.subtle.digest`.
2. If a record with this hash already exists in `fileVersions`, it is reused (zero redundant storage).
3. The `FileNode.currentVersionHash` pointer is updated to the new digest.
4. History record is created referencing previous and next hashes.

```ts
export interface FileVersion {
  hash: string;       // SHA-256 hex string
  fileId: string;     // Node ID
  content: string;    // Raw string payload
  createdAt: number;  // Timestamp
}
```

---

## 4. Undo and Redo Mechanics

Undo/Redo uses a pointer into the session's linear history log:

```
[Entry 1] -> [Entry 2] -> [Entry 3] -> [Entry 4]
                             ^
                             |
                   session.historyPointer
```

- **Undo**: Applies the reverse operation of the entry at `historyPointer`, moves `historyPointer` backward by 1 entry, and fires appropriate inverse events.
- **Redo**: Locates the immediate next entry after `historyPointer`, reapplies the forward mutation, moves `historyPointer` forward, and fires events.
- **New Operations**: Mutating a node after undoing advances the history by appending a new operation.

---

## 5. Session Isolation and Teardown

`terminateFS({ sessionId })` performs atomic cleanup:
1. Deletes all `nodes` belonging to `sessionId`.
2. Deletes all `history` records for `sessionId`.
3. Performs garbage collection on `fileVersions`: any version referenced only by the deleted session is safely purged. If another active session shares that content hash, it is preserved.
4. Removes the `sessionMeta` record.
5. If no active sessions remain in `sessionMeta`, closes the underlying IndexedDB database connection cleanly.
