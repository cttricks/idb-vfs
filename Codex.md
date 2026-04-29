# Codex Instructions: Versioned Browser File System (IndexedDB)

## Objective

Build a **production-grade TypeScript NPM library** implementing a **versioned virtual file system** on top of IndexedDB.

The system must support:

* File/folder CRUD
* Versioning via immutable content hashes
* Undo/Redo via history log
* Session isolation
* Event system (EventTarget-based)

---

## Hard Constraints

1. DO NOT implement everything at once.
2. Follow **strict phase-based execution**.
3. After each phase:

   * Ensure code compiles
   * Provide minimal validation
   * STOP and wait for user confirmation
4. DO NOT skip phases.
5. DO NOT refactor across phases unless explicitly instructed.

---

## Tech Stack

* Language: TypeScript
* Storage: IndexedDB (via Dexie.js)
* Build: tsup or rollup
* Target: ESM + CJS
* Runtime: Browser only

---

## Architecture Overview

### Core Model

* Node → file/folder metadata
* FileVersion → immutable content store
* HistoryEntry → undo/redo operations
* SessionMeta → session tracking

### Principle

Node points to version
Version stores content
History tracks pointer transitions

---

## Phase Plan

---

### Phase 1: Project Scaffold

#### Tasks

* Initialize npm package
* Setup TypeScript config
* Setup build system
* Create folder structure:

```
src/
  core/
  services/
  events/
  session/
  types/
  utils/
```

#### Output

* Buildable empty library
* Entry point exports placeholder

#### Validation

* `npm run build` succeeds

#### STOP

---

### Phase 2: Database Layer

#### Tasks

* Setup Dexie database
* Define schema:

Tables:

* nodes
* fileVersions
* history
* sessionMeta

#### Requirements

* Proper indexes:

  * nodes: [sessionId+parentId], id
  * fileVersions: hash, fileId
  * history: timestamp
* Export DB instance

#### Validation

* DB initializes without errors

#### STOP

---

### Phase 3: Type Definitions

#### Tasks

Define strict TypeScript interfaces:

* Node
* FileVersion
* HistoryEntry
* SessionMeta

Include:

* version pointers
* timestamps
* discriminated unions for operations

#### Validation

* Types compile cleanly

#### STOP

---

### Phase 4: Session Initialization

#### Tasks

* Implement `createSession(sessionId)`
* Create root directory node
* Store metadata

#### Validation

* Session persists in DB
* Root node exists

#### STOP

---

### Phase 5: File Versioning Core

#### Tasks

Implement:

* hash generator (SHA-256 using crypto.subtle)
* insert FileVersion
* link Node → version

#### APIs

```
createFile(path, content)
readFile(fileId, versionHash?)
updateFile(fileId, content)
```

#### Rules

* Versions are immutable
* No overwrites
* Hash = identity

#### Validation

* Create file
* Update file
* Read latest + specific version

#### STOP

---

### Phase 6: Folder + Tree Operations

#### Tasks

Implement:

* createFolder
* deleteFolder (recursive)
* rename
* move (file + folder)
* listChildren
* path resolver

#### Rules

* No path stored directly
* Resolve via parentId traversal

#### Validation

* Nested structure works
* Moves preserve integrity

#### STOP

---

### Phase 7: History (Undo/Redo)

#### Tasks

* Implement history store
* Maintain pointer index
* Add entries for all mutating ops

#### APIs

```
undo()
redo()
restoreVersion(fileId, hash)
```

#### Rules

* Undo = apply reverse operation
* Redo = reapply operation
* Pointer-based (NOT content diff)

#### Validation

* Multi-step undo/redo works
* Version switching is correct

#### STOP

---

### Phase 8: Event System

#### Tasks

* Implement EventTarget-based bus
* Expose:

```
on(event, handler)
off(event, handler)
emit(event, payload)
```

#### Events

* FILE_CREATED
* FILE_UPDATED
* FILE_DELETED
* FILE_RENAMED
* FILE_MOVED
* FOLDER_CREATED
* FOLDER_DELETED
* FOLDER_MOVED

#### Validation

* Events fire correctly after mutations

#### STOP

---

### Phase 9: Public API Layer

#### Tasks

Expose unified interface:

```
createFS({ sessionId })

fs.createFile(...)
fs.updateFile(...)
fs.undo()
fs.on(...)
```

#### Requirements

* Clean abstraction
* No DB leakage

#### Validation

* End-to-end usage works

#### STOP

---

### Phase 10: Packaging

#### Tasks

* Configure build output:

  * ESM
  * CJS
  * types

* Add:

  * package.json exports
  * README
  * typings

#### Validation

* Installable locally via `npm link`

#### STOP

---

## Phase 11: Testing Phase (Separate Mode)

### DO NOT MIX WITH BUILD PHASES

#### Tasks

1. Create `/demo/index.html`
2. Use vanilla JS (no frameworks)
3. Add UI controls:

* Create file
* Update file
* Delete file
* Create folder
* Move
* Undo / Redo
* Read version

4. Display:

* Current tree
* History log
* File content

#### Validation

* Manual interaction confirms all features

---

## Coding Rules

* Use async/await consistently
* Wrap all DB ops in transactions
* No silent failures
* Throw typed errors

---

## Non-Goals

* No server sync
* No multi-user concurrency
* No CRDT

---

## Completion Criteria

Library is complete when:

* All phases implemented
* Demo UI verifies behavior
* Build outputs consumable package

---

## Execution Instruction

Start with **Phase 1 only**.

After completing a phase:

* Summarize what was done
* Show file structure
* Ask for approval before continuing
