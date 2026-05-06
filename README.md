# idb-vfs

A browser-only TypeScript library for a versioned virtual file system backed by IndexedDB and Dexie.

## Features

- File and folder CRUD with a hierarchical tree
- Immutable file versions addressed by SHA-256 hash
- Undo and redo through a session history pointer
- Session-scoped filesystem instances
- Standalone session teardown with `terminateFS(...)`
- EventTarget-based mutation events
- ESM, CJS, and type declaration output

## Installation

```bash
npm install idb-vfs
```

## Quick Start

```ts
import { createFS, terminateFS } from "idb-vfs";

const fs = await createFS({ sessionId: "demo-session" });

await fs.createFolder("/docs");
const file = await fs.createFile("/docs/hello.txt", "Hello world");

const latest = await fs.readFile(file.id);
console.log(latest);

await terminateFS({ sessionId: "demo-session" });
```

## Public API

```ts
const fs = await createFS({ sessionId: "my-session" });
```

Available methods:

- `fs.createFile(path, content)`
- `fs.deleteFile(fileId)`
- `fs.readFile(fileId, versionHash?)`
- `fs.updateFile(fileId, content)`
- `fs.listFileVersions(fileId)`
- `fs.createFolder(path)`
- `fs.deleteFolder(folderId)`
- `fs.rename(nodeId, nextName)`
- `fs.move(nodeId, targetFolderId)`
- `fs.listChildren(folderId)`
- `fs.resolvePath(path)`
- `fs.undo()`
- `fs.redo()`
- `fs.restoreVersion(fileId, versionHash)`
- `fs.getHistory()`
- `fs.on(event, handler)`
- `fs.off(event, handler)`

Standalone session lifecycle:

- `createFS({ sessionId })`
- `terminateFS({ sessionId })`

`terminateFS(...)` removes that session's nodes, history entries, and session metadata. It also deletes file versions that are no longer referenced by any remaining session data, and closes the underlying DB when the last session is terminated.

## Events

Supported event names:

- `FILE_CREATED`
- `FILE_UPDATED`
- `FILE_DELETED`
- `FILE_RENAMED`
- `FILE_MOVED`
- `FOLDER_CREATED`
- `FOLDER_DELETED`
- `FOLDER_MOVED`

Example:

```ts
const unsubscribe = fs.on("FILE_CREATED", (event) => {
  console.log(event.detail.file.name);
});

unsubscribe();
```

## Build Output

```bash
npm run build
```

The package emits:

- `dist/index.mjs`
- `dist/index.js`
- `dist/index.d.ts`

## Notes

- Runtime target: browser only
- Storage backend: IndexedDB via Dexie
- No server sync or multi-user collaboration
