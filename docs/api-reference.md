# API Reference

This document provides a comprehensive reference of the public API exported by `idb-vfs`.

---

## 1. Top-Level Functions

### `createFS(options: CreateFSOptions): Promise<VersionedFileSystem>`

Initializes or connects to a session-scoped virtual file system instance.

```ts
import { createFS } from "idb-vfs";

const fs = await createFS({ sessionId: "workspace-1" });
```

**Parameters:**
- `options.sessionId` (`string`, required): Unique session identifier. Reconnecting with an existing `sessionId` restores its tree and history state.

**Returns:**
- A `Promise<VersionedFileSystem>` client bound to the specified session.

---

### `terminateFS(options: TerminateFSOptions): Promise<TerminateFSResult>`

Tears down a session, deletes all its nodes and history entries, prunes orphan file versions, and closes the database if no sessions remain.

```ts
import { terminateFS } from "idb-vfs";

const result = await terminateFS({ sessionId: "workspace-1" });
console.log(result.deletedNodes, result.databaseClosed);
```

**Parameters:**
- `options.sessionId` (`string`, required): Identifier of the session to terminate.

**Returns:**
- `Promise<TerminateFSResult>`:
  - `sessionId`: string
  - `deletedNodes`: number
  - `deletedFileVersions`: number
  - `deletedHistoryEntries`: number
  - `deletedSession`: boolean
  - `databaseClosed`: boolean

---

### `createFSClient(options, database)` / `terminateFSClient(options, database)`

Advanced methods that allow injecting a custom `IdbVfsDatabase` instance instead of the default singleton. Useful for testing or custom Dexie configurations.

---

## 2. `VersionedFileSystem` Interface

An instance of `VersionedFileSystem` provides methods to manipulate files, folders, versions, history, and events:

```ts
export interface VersionedFileSystem {
  sessionId: string;
  rootNodeId: string;

  // File Operations
  createFile(path: string, content: string): Promise<FileNode>;
  deleteFile(fileId: string): Promise<FileNode>;
  readFile(fileId: string, versionHash?: string): Promise<string>;
  updateFile(fileId: string, content: string): Promise<FileNode>;
  listFileVersions(fileId: string): Promise<FileVersion[]>;
  restoreVersion(fileId: string, versionHash: string): Promise<FileNode>;

  // Folder & Node Operations
  createFolder(path: string): Promise<FolderNode>;
  deleteFolder(folderId: string): Promise<{ deletedNodeIds: string[] }>;
  rename(nodeId: string, nextName: string): Promise<Node>;
  move(nodeId: string, targetFolderId: string): Promise<Node>;
  listChildren(folderId: string): Promise<Node[]>;
  resolvePath(path: string): Promise<Node>;

  // History & Time Travel
  undo(): Promise<HistoryEntry | null>;
  redo(): Promise<HistoryEntry | null>;
  getHistory(): Promise<HistoryEntry[]>;

  // Event Subscription
  on<TType extends VfsEventType>(eventType: TType, handler: VfsEventHandler<TType>): () => void;
  off<TType extends VfsEventType>(eventType: TType, handler: VfsEventHandler<TType>): void;
}
```

---

## 3. Method Specifications

### File Operations

#### `createFile(path: string, content: string): Promise<FileNode>`
Creates a new file at the specified absolute path (`/path/to/file.ext`).
- Throws `InvalidFilePathError` if the path is invalid or targets the root.
- Throws `ParentFolderNotFoundError` if intermediate parent folders do not exist.
- Throws `DuplicateNodeNameError` if a file or folder with the same name already exists in the destination folder.
- Emits: `FILE_CREATED`.

#### `readFile(fileId: string, versionHash?: string): Promise<string>`
Reads the UTF-8 text content of a file.
- If `versionHash` is omitted, reads the latest (`currentVersionHash`).
- If `versionHash` is provided, reads the exact immutable version.
- Throws `NodeNotFoundError`, `NotAFileError`, or `FileVersionNotFoundError`.

#### `updateFile(fileId: string, content: string): Promise<FileNode>`
Updates the file content.
- Computes SHA-256 hash. If unchanged, returns existing node without creating a new version.
- If changed, stores new `FileVersion`, updates `currentVersionHash`, and records a `FILE_UPDATED` history entry.
- Emits: `FILE_UPDATED`.

#### `deleteFile(fileId: string): Promise<FileNode>`
Removes the file node. Note: Historical versions remain in storage until session teardown or pruning.
- Emits: `FILE_DELETED`.

#### `listFileVersions(fileId: string): Promise<FileVersion[]>`
Returns all stored versions for a file, sorted descending by creation time (`createdAt`).

#### `restoreVersion(fileId: string, versionHash: string): Promise<FileNode>`
Restores an older version as the active `currentVersionHash`.
- Records a `FILE_RESTORED` history entry.
- Emits: `FILE_UPDATED`.

---

### Folder Operations

#### `createFolder(path: string): Promise<FolderNode>`
Creates a directory at the given path. Intermediate folders must already exist.
- Emits: `FOLDER_CREATED`.

#### `deleteFolder(folderId: string): Promise<{ deletedNodeIds: string[] }>`
Recursively deletes a directory and all descendants (subfolders and files).
- Throws `RootNodeMutationError` if attempting to delete the session root folder.
- Emits: `FOLDER_DELETED`.

#### `rename(nodeId: string, nextName: string): Promise<Node>`
Renames a file or folder.
- Throws `InvalidNodeNameError` if name is empty or contains `/`.
- Throws `DuplicateNodeNameError` if sibling already exists with that name.
- Emits: `FILE_RENAMED` (for files).

#### `move(nodeId: string, targetFolderId: string): Promise<Node>`
Moves a node into a target folder within the same session.
- Throws `TreeCycleError` if moving a folder into itself or one of its descendants.
- Emits: `FILE_MOVED` or `FOLDER_MOVED`.

#### `listChildren(folderId: string): Promise<Node[]>`
Lists direct children sorted with folders first, followed by alphabetical order.

#### `resolvePath(path: string): Promise<Node>`
Resolves an absolute path (e.g., `/docs/readme.txt` or `/`) to its corresponding `Node`.

---

## 4. Events System

Listen to filesystem events via `fs.on(eventType, handler)`. The return value is an unsubscribe callback.

```ts
const unsubscribe = fs.on("FILE_CREATED", (event) => {
  console.log("File created:", event.detail.file.name);
});

// Later:
unsubscribe();
```

### Event Names & Payloads

| Event Name | Detail Payload |
|---|---|
| `FILE_CREATED` | `{ file: FileNode }` |
| `FILE_UPDATED` | `{ file: FileNode, previousVersionHash: string \| null, currentVersionHash: string \| null }` |
| `FILE_DELETED` | `{ file: FileNode }` |
| `FILE_RENAMED` | `{ file: FileNode, previousName: string, currentName: string }` |
| `FILE_MOVED` | `{ file: FileNode, previousParentId: string \| null, currentParentId: string \| null }` |
| `FOLDER_CREATED` | `{ folder: FolderNode }` |
| `FOLDER_DELETED` | `{ folder: FolderNode, deletedNodeIds: string[] }` |
| `FOLDER_MOVED` | `{ folder: FolderNode, previousParentId: string \| null, currentParentId: string \| null }` |

---

## 5. Error Classes

All errors inherit from `Error` with a distinct `name` property:

- `NodeNotFoundError`: Node ID does not exist in the database.
- `NotAFileError`: An operation requiring a file targeted a folder.
- `NotAFolderError`: An operation requiring a folder targeted a file.
- `ParentFolderNotFoundError`: Parent directory in path does not exist.
- `DuplicateNodeNameError`: Sibling node with same name already exists in target parent.
- `InvalidFilePathError`: Malformed path format.
- `InvalidNodeNameError`: Name is empty or contains path delimiters.
- `TreeCycleError`: Attempted to move a folder into its own subtree.
- `RootNodeMutationError`: Attempted to delete or rename the root folder.
- `SessionMismatchError`: Attempted to move nodes between different sessions.
- `FileVersionNotFoundError`: Version hash not found in database.
