# Code Style and Conventions

This guide documents the engineering conventions, modularity principles, and quality standards for the `idb-vfs` codebase.

---

## 1. Core Engineering Principles

### 1.1 Zero Breaking Changes Policy
- **Actively Used Library**: `idb-vfs` is consumed in existing production codebases and published to NPM.
- The public API interface (`VersionedFileSystem`, `createFS`, `terminateFS`, event payloads, error classes) must remain backwards-compatible.
- Any additive features or extensions must maintain signature backwards compatibility.

### 1.2 Browser-Native & Zero Native Node Dependencies
- Target runtime: Modern Browsers (ES2022+).
- Use standard Web APIs: `indexedDB`, `crypto.subtle`, `EventTarget`, `CustomEvent`.
- Do not introduce Node.js built-ins (`fs`, `path`, `crypto`, `buffer`) in the runtime code.

### 1.3 Strict Type Safety
- All files must be TypeScript (`.ts`).
- Avoid `any`. Use strict generic inference, discriminated unions, and `unknown` with type guards.
- All exported functions and interfaces must provide explicit parameter and return types.

---

## 2. Directory Architecture & Boundaries

```
src/
├── api/          # Public facade (createFS, terminateFS, client bindings)
├── core/         # Dexie database instance, schemas, table definitions
├── events/       # EventTarget bus, event type definitions, event emitters
├── services/     # Pure business logic (files, nodes, history, transactions)
├── session/      # Session initialization, lifecycle, metadata management
├── types/        # Global TypeScript interfaces and model definitions
├── utils/        # Stateless helpers (path parsing, SHA-256 hash, ID generation)
└── index.ts      # Top-level library barrel export
```

### Module Boundary Rules:
1. **`utils/`**: Stateless, pure utility functions only. Must never import from `services/` or `core/`.
2. **`types/`**: Pure type declarations only. No runtime logic.
3. **`events/`**: Singleton or decoupled EventTarget bus.
4. **`services/`**: Implements business transactions. Interacts with `core/` database within Dexie transactions.
5. **`api/`**: Thin composition layer. Exposes consumer-facing functions and wraps service operations.

---

## 3. Database & Transaction Guidelines

1. **Transactional Integrity**: All multi-store mutations must be executed inside a Dexie transaction (`database.transaction("rw", ...)`).
2. **Atomicity**: Never emit mutation events (`emit(...)`) from inside the transaction callback. Only emit events *after* the database transaction commits successfully.
3. **Optimistic Checks**: Verify existence and integrity (e.g. cycle checks, duplicate name checks) inside the transaction to avoid race conditions.

---

## 4. Error Handling Conventions

- Do not throw raw strings or generic `Error` instances.
- Define domain-specific errors in `errors.ts` extending `Error`.
- Ensure each error class sets `this.name = "MyCustomError"`.
- Provide informative error messages with context (node ID, path, or conflicting name).

---

## 5. Build & Release Workflow

```bash
# Build ESM, CJS, and DTS bundles
npm run build

# Serve library over CORS for CDN consumption (port 3030)
npm run serve:lib

# Build static demo playground
npm run build:demo

# Serve static demo playground (port 3031)
npm run serve:demo
```
