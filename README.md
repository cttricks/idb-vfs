# @cttricks/idb-vfs

A versioned virtual file system (VFS) for the browser built on top of IndexedDB.

This library provides a filesystem-like API (`createFile`, `readFile`, `moveFile`, etc.) while internally managing persistence, versioning, and history using IndexedDB.

---

## Features

* Files and folders with hierarchical structure
* Immutable file versioning using content hashes
* Undo / redo via history log
* Path-based and ID-based operations
* Session-scoped storage
* Event-driven architecture (EventTarget-based)
* Typed API (TypeScript-first)

---

## Installation

```bash
npm install @cttricks/idb-vfs
```

---

## Usage

```ts
import { createFS } from '@cttricks/idb-vfs'

const fs = await createFS({ sessionId: 'my-session' })

await fs.createFolder('/docs')
await fs.createFile('/docs/hello.txt', 'Hello World')

const content = await fs.readFileByPath('/docs/hello.txt')
console.log(content)
```

---

## Core Concepts

### Virtual File System

The library exposes a filesystem-like API while storing data in IndexedDB. Consumers interact with files and folders without managing storage details.

### Versioning

Each file update creates an immutable version identified by a hash. The filesystem tracks:

* `currentVersionHash`
* `originalVersionHash`

You can read any version directly:

```ts
await fs.readFile(fileId, versionHash)
```

### History (Undo / Redo)

All mutating operations are recorded as history entries. Undo and redo operate by switching version pointers or restoring structural changes.

```ts
await fs.undo()
await fs.redo()
```

### Sessions

All data is scoped to a session:

```ts
createFS({ sessionId })
```

Sessions isolate filesystem state and prevent collisions.

---

## API Overview

### File Operations

* `createFile(path, content)`
* `updateFile(fileId, content)`
* `readFile(fileId, versionHash?)`
* `readFileByPath(path)`
* `deleteFile(fileId)`
* `renameFile(fileId, newName)`
* `moveFile(fileId, targetFolderId)`

### Folder Operations

* `createFolder(path)`
* `deleteFolder(folderId, options?)`
* `renameFolder(folderId, newName)`
* `moveFolder(folderId, targetFolderId)`
* `listChildren(folderId)`

### History

* `undo()`
* `redo()`
* `restoreVersion(fileId, versionHash)`
* `getHistory()`

### Events

```ts
fs.on('FILE_CREATED', handler)
fs.on('FILE_UPDATED', handler)
```

Supported events:

* FILE_CREATED
* FILE_UPDATED
* FILE_DELETED
* FILE_RENAMED
* FILE_MOVED
* FOLDER_CREATED
* FOLDER_DELETED
* FOLDER_MOVED

---

## Design Principles

* Immutable data for version safety
* Pointer-based updates for performance
* Indexed access instead of full-tree rewrites
* Clear separation between structure and content

---

## Environment

* Browser runtime only
* Requires IndexedDB support
* Not intended for Node.js environments

---

## Build

```bash
npm run build
```

Outputs:

* ESM
* CJS
* Type definitions

---

## Documentation

Detailed documentation will be available in:

* `docs/setup.md`
* `docs/introduction.md`

---

## License

MIT
