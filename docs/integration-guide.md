# Integration Guide

`idb-vfs` is designed to seamlessly integrate into TypeScript, React, Next.js, and web playground applications. Because it relies on the browser's `IndexedDB` and Web Cryptography (`crypto.subtle`) APIs, it must execute exclusively in browser / client environments.

---

## 1. Installation

### NPM / PNPM / Yarn

```bash
npm install idb-vfs
# or
pnpm add idb-vfs
# or
yarn add idb-vfs
```

### CDN / ESM Import

`idb-vfs` can be loaded dynamically in vanilla HTML or web environments via standard ESM:

```html
<script type="module">
  import { createFS } from "https://esm.sh/idb-vfs";

  const fs = await createFS({ sessionId: "browser-app" });
  await fs.createFile("/notes.txt", "Saved directly in browser IndexedDB!");
  console.log(await fs.readFile((await fs.resolvePath("/notes.txt")).id));
</script>
```

Or when self-hosting the library bundle on a local CDN server (e.g. port 3030):

```html
<script type="module">
  import { createFS } from "http://localhost:3030/index.mjs";
  const fs = await createFS({ sessionId: "local-session" });
</script>
```

---

## 2. React Integration

Using React, you can wrap `createFS` in a custom hook or Context Provider to manage file system state and reactively re-render on VFS events.

### Example: Custom React Hook (`useVFS`)

```tsx
import { useEffect, useState, useCallback } from "react";
import { createFS, type VersionedFileSystem, type Node } from "idb-vfs";

export function useVFS(sessionId: string) {
  const [fs, setFS] = useState<VersionedFileSystem | null>(null);
  const [tree, setTree] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize file system
  useEffect(() => {
    let active = true;

    async function init() {
      setLoading(true);
      const instance = await createFS({ sessionId });
      if (!active) return;
      setFS(instance);
      setLoading(false);
    }

    init();

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Subscribe to mutations
  const refreshTree = useCallback(async () => {
    if (!fs) return;
    const rootChildren = await fs.listChildren(fs.rootNodeId);
    setTree(rootChildren);
  }, [fs]);

  useEffect(() => {
    if (!fs) return;

    refreshTree();

    const unsubCreate = fs.on("FILE_CREATED", refreshTree);
    const unsubUpdate = fs.on("FILE_UPDATED", refreshTree);
    const unsubDelete = fs.on("FILE_DELETED", refreshTree);
    const unsubFolder = fs.on("FOLDER_CREATED", refreshTree);

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
      unsubFolder();
    };
  }, [fs, refreshTree]);

  return { fs, tree, loading, refreshTree };
}
```

---

## 3. Next.js Integration (App Router & Pages Router)

Because Next.js pre-renders components on the Node.js server where `IndexedDB` is undefined, you must ensure `idb-vfs` is imported or executed **client-side only**.

### App Router (`'use client'`)

In Next.js App Router, mark your component with `'use client'`:

```tsx
// app/editor/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function EditorPage() {
  const [status, setStatus] = useState("Initializing VFS...");

  useEffect(() => {
    async function load() {
      // Safe dynamic client import
      const { createFS } = await import("idb-vfs");
      const fs = await createFS({ sessionId: "user-workspace" });
      setStatus(`Connected to session: ${fs.sessionId}`);
    }

    load();
  }, []);

  return <div>{status}</div>;
}
```

### Dynamic Component with SSR Disabled

You can also use Next.js `dynamic`:

```tsx
import dynamic from "next/dynamic";

const FileExplorer = dynamic(() => import("@/components/FileExplorer"), {
  ssr: false,
});

export default function Page() {
  return <FileExplorer />;
}
```

---

## 4. Multi-Session Management

`idb-vfs` natively supports concurrent sessions within the same browser instance:

- Each session maintains its own distinct root node (`/`), tree hierarchy, and linear undo/redo stack.
- Versions with identical SHA-256 content are deduplicated across sessions.
- Terminating a session cleans up only that session's data without corrupting sibling sessions.

```ts
const sessionA = await createFS({ sessionId: "project-alpha" });
const sessionB = await createFS({ sessionId: "project-beta" });

await sessionA.createFile("/readme.md", "Alpha Project");
await sessionB.createFile("/readme.md", "Beta Project");
```
