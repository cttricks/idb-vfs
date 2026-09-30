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

## Interactive Playground & Demo

The repository includes a modern, Vercel-inspired desktop-style file explorer playground located in `demo-site/`. It demonstrates real-time file tree management, immutable CAS version time-travel, live mutation audit streaming, and CDN consumption.

To build and serve the static playground and local CDN:

```bash
# 1. Build the core library
npm run build

# 2. Host the library as a local CDN with CORS on port 3030
npm run serve:lib

# 3. Build and serve the playground site on port 3031
npm run build:demo
npm run serve:demo
```

Open `http://localhost:3031` in your browser.

## Documentation

Comprehensive architectural and integration documentation is available in [`docs/`](./docs/):

- [Architecture & Storage Internals](./docs/architecture.md): IndexedDB schema, CAS versioning, and undo/redo pointer mechanics.
- [API Reference](./docs/api-reference.md): Complete method signatures, options, and error contracts.
- [Integration Guide](./docs/integration-guide.md): Patterns for React, Next.js (App Router/SSR safety), and CDN usage.
- [Code Style & Conventions](./docs/code-style-and-conventions.md): Codebase organization, zero breaking changes policy, and type safety guidelines.
- [AGENTS.md](./AGENTS.md): High-level operational guidance for AI agents and maintainers.

## Notes

- **Runtime target**: Browser only (requires IndexedDB and Web Cryptography `crypto.subtle`)
- **Storage engine**: IndexedDB via Dexie
- **Isolation**: Multi-session support with atomic teardown via `terminateFS`
- **Zero Breaking Changes**: Actively consumed in production codebases; maintain backwards compatibility across all updates.

