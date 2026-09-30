# Virtual File System – IndexedDB (`idb-vfs`)

[![npm version](https://img.shields.io/npm/v/idb-vfs.svg?style=flat-square)](https://www.npmjs.com/package/idb-vfs)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](./LICENSE)
[![Playground](https://img.shields.io/badge/Live-Playground-success?style=flat-square)](https://idb-vfs-playground.cttricks.com)
[![Case Study](https://img.shields.io/badge/Case%20Study-ConceptNinjas%20AI-purple?style=flat-square)](https://cttricks.com/case-studies/conceptninjas-ai-lab)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg?style=flat-square)](#)

A fast, lightweight, and versioned **Virtual File System (VFS)** that runs 100% inside modern web browsers. Backed by **IndexedDB** and Dexie.js, it lets you create, organize, edit, and track files and folders client-side—with zero server setup required.


## What is `idb-vfs`?

Think of `idb-vfs` as a mini file system—just like the files and folders on your computer—living right in your browser's persistent storage.

- **Offline-First & Persistent**: Data stays safely saved in the browser's IndexedDB even when the page is reloaded or closed.
- **Git-like Version History**: Every time you update a file, an immutable SHA-256 version snapshot is saved. You can inspect or restore any past version at any time.
- **Undo & Redo Out-of-the-Box**: Built-in linear history pointer lets your users undo and redo actions (edits, renames, moves, deletions) effortlessly.
- **Hierarchical Paths**: Familiar file paths like `/docs/readme.txt` and `/src/index.ts`.
- **Reactive UI Events**: Emits native events (`FILE_CREATED`, `FILE_UPDATED`, `FOLDER_MOVED`, etc.) so your React, Next.js, or Vue UI updates instantly.

Ideal for **web-based IDEs, Markdown note apps, code playgrounds, AI agent workspaces, and local-first creative tools**.


## 📦 Installation

Install via your favorite package manager:

```bash
npm install idb-vfs
# or
pnpm add idb-vfs
# or
yarn add idb-vfs
```

Or load directly in HTML using ES Modules from a CDN:

```html
<script type="module">
  import { createFS } from "https://esm.sh/idb-vfs";

  const fs = await createFS({ sessionId: "my-sandbox" });
  await fs.createFile("/hello.txt", "Hello from the browser!");
</script>
```

## ⚡ Quick Start (Copy & Paste)

Here is everything you need to get started in under 60 seconds:

```ts
import { createFS, terminateFS } from "idb-vfs";

// 1. Connect to an isolated session (creates it if it doesn't exist)
const fs = await createFS({ sessionId: "workspace-1" });

// 2. Create folders and files using absolute paths
await fs.createFolder("/notes");
const file = await fs.createFile("/notes/todo.txt", "1. Buy milk\n2. Learn idb-vfs");

// 3. Read latest file content
const content = await fs.readFile(file.id);
console.log(content);

// 4. Update file (automatically creates a new SHA-256 version snapshot)
await fs.updateFile(file.id, "1. Buy milk\n2. Master idb-vfs!");

// 5. Undo the edit with 1 method call!
await fs.undo();

// 6. Inspect or restore past versions
const versions = await fs.listFileVersions(file.id);
console.log(`Saved versions:`, versions.length);

// 7. Cleanup & delete session when finished (optional)
// await terminateFS({ sessionId: "workspace-1" });
```

## Live Playground

Experience `idb-vfs` in action with our live, desktop-style file explorer playground:

👉 **[Launch Live Playground](https://idb-vfs-playground.cttricks.com)**

Test creating nested folders, editing files, time-traveling through immutable SHA-256 versions, and inspecting real-time mutation events directly in your browser.


## Why I Made This & Origin Story

When building client-side developer tooling, web-based IDEs, and generative AI interfaces, managing virtual files purely in JavaScript memory is fragile—one accidental page refresh wipes out the user's entire workspace. On the other hand, streaming every minor file edit or folder creation to a remote cloud server introduces network latency, requires authentication, and adds unnecessary infrastructure costs.

`idb-vfs` was designed to bridge this gap: providing a **full-featured, Git-like virtual file system with immutable content hashing and linear undo/redo that lives 100% inside browser IndexedDB**.

### Built For: "AI Studio" by ConceptNinjas

This library was originally designed and engineered for **AI Studio**, an advanced AI creation environment developed by **[ConceptNinjas](https://conceptninjas.com)**. In AI Studio, autonomous agents generate, iterate on, and execute multi-file project workspaces directly in the user's browser with instant responsiveness and zero backend latency.

📖 Read the full case study: **[ConceptNinjas AI Lab Case Study](https://cttricks.com/case-studies/conceptninjas-ai-lab)**


## Complete Guides & Documentation

To keep this README simple and accessible, detailed technical topics are organized in dedicated guides:

| Guide | Description |
|---|---|
|[**API Reference**](./docs/api-reference.md) | Full documentation for every method (`createFile`, `readFile`, `move`, `rename`, `undo`, `redo`), parameters, return values, events, and custom error types. |
|[**Integration Guide**](./docs/integration-guide.md) | Ready-to-use recipes for **React** (custom hooks), **Next.js App Router** (SSR-safe dynamic loading), and **CDN** usage. |
|[**Architecture & Internals**](./docs/architecture.md) | Deep dive into the IndexedDB database schema, Content-Addressable Storage (CAS with SHA-256), multi-session garbage collection, and undo/redo mechanics. |
|[**Code Style & Conventions**](./docs/code-style-and-conventions.md) | Modularity rules, TypeScript guidelines, transactional guarantees, and our zero-breaking-changes stability contract. |


## Frequently Asked Questions

<details>
<summary><strong>Where are my files stored?</strong></summary>

All data is stored locally in the user's browser using native **IndexedDB** (via Dexie.js). No server or database connection is needed, and storage persists across page refreshes and browser restarts until explicitly cleared.
</details>

<details>
<summary><strong>Can I have multiple independent workspaces?</strong></summary>

Yes! Just specify different `sessionId` strings (e.g. `createFS({ sessionId: "project-a" })` and `createFS({ sessionId: "project-b" })`). Each session has its own root directory (`/`), file tree, and undo/redo history.
</details>

<details>
<summary><strong>How does Undo and Redo work?</strong></summary>

Every operation (create file, update, rename, move, delete) records an entry in that session's history log. Calling `fs.undo()` rolls back the change and restores the previous state, while `fs.redo()` reapplies it.
</details>

<details>
<summary><strong>How does version history work?</strong></summary>

Every time file content is updated, `idb-vfs` calculates the SHA-256 cryptographic hash of the content. Identical content is deduplicated automatically. You can list all historical versions with `fs.listFileVersions(fileId)` and restore any version with `fs.restoreVersion(fileId, versionHash)`.
</details>

<br>

---

Licensed under the [Apache License, Version 2.0](./LICENSE).
