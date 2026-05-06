// src/events/bus.ts
var eventTarget = new EventTarget();
function on(eventType, handler) {
  eventTarget.addEventListener(eventType, handler);
}
function off(eventType, handler) {
  eventTarget.removeEventListener(eventType, handler);
}
function emit(eventType, payload) {
  const event = new CustomEvent(eventType, {
    detail: payload
  });
  eventTarget.dispatchEvent(event);
  return event;
}

// src/core/database.ts
import Dexie from "dexie";
var DATABASE_NAME = "idb-vfs";
var DATABASE_VERSION = 2;
var IdbVfsDatabase = class extends Dexie {
  nodes;
  fileVersions;
  history;
  sessionMeta;
  constructor() {
    super(DATABASE_NAME);
    this.version(DATABASE_VERSION).stores({
      nodes: "id, [sessionId+parentId]",
      fileVersions: "hash, fileId",
      history: "++id, timestamp",
      sessionMeta: "sessionId"
    });
  }
};
var db = new IdbVfsDatabase();

// src/services/errors.ts
var FileServiceError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FileServiceError";
  }
};
var InvalidFilePathError = class extends FileServiceError {
  constructor(path) {
    super(`Invalid file path "${path}".`);
    this.name = "InvalidFilePathError";
  }
};
var NodeNotFoundError = class extends FileServiceError {
  constructor(nodeId) {
    super(`Node "${nodeId}" was not found.`);
    this.name = "NodeNotFoundError";
  }
};
var ParentFolderNotFoundError = class extends FileServiceError {
  constructor(path) {
    super(`Parent folder for path "${path}" was not found.`);
    this.name = "ParentFolderNotFoundError";
  }
};
var NotAFolderError = class extends FileServiceError {
  constructor(nodeId) {
    super(`Node "${nodeId}" is not a folder.`);
    this.name = "NotAFolderError";
  }
};
var NotAFileError = class extends FileServiceError {
  constructor(nodeId) {
    super(`Node "${nodeId}" is not a file.`);
    this.name = "NotAFileError";
  }
};
var DuplicateNodeNameError = class extends FileServiceError {
  constructor(name, parentId) {
    super(`A node named "${name}" already exists under parent "${parentId ?? "root"}".`);
    this.name = "DuplicateNodeNameError";
  }
};
var FileVersionNotFoundError = class extends FileServiceError {
  constructor(hash) {
    super(`File version "${hash}" was not found.`);
    this.name = "FileVersionNotFoundError";
  }
};
var InvalidNodeNameError = class extends FileServiceError {
  constructor(name) {
    super(`Invalid node name "${name}".`);
    this.name = "InvalidNodeNameError";
  }
};
var RootNodeMutationError = class extends FileServiceError {
  constructor(operation) {
    super(`Cannot ${operation} the root folder node.`);
    this.name = "RootNodeMutationError";
  }
};
var SessionMismatchError = class extends FileServiceError {
  constructor(nodeId, targetFolderId) {
    super(`Node "${nodeId}" cannot be moved into folder "${targetFolderId}" from a different session.`);
    this.name = "SessionMismatchError";
  }
};
var TreeCycleError = class extends FileServiceError {
  constructor(nodeId, targetFolderId) {
    super(`Moving node "${nodeId}" into folder "${targetFolderId}" would create a cycle.`);
    this.name = "TreeCycleError";
  }
};
var SessionNotFoundError = class extends FileServiceError {
  constructor(sessionId) {
    super(`Session "${sessionId}" was not found.`);
    this.name = "SessionNotFoundError";
  }
};

// src/utils/ids.ts
function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }
  const randomSuffix = Math.random().toString(36).slice(2, 12);
  return `${prefix}:${Date.now().toString(36)}${randomSuffix}`;
}

// src/utils/hash.ts
function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function createContentHash(content) {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", contentBytes);
  return bytesToHex(new Uint8Array(digest));
}

// src/utils/path.ts
function normalizeAbsolutePath(path) {
  const normalizedPath = path.trim();
  if (!normalizedPath.startsWith("/")) {
    throw new Error("Path must start with '/'.");
  }
  return normalizedPath;
}
function getPathSegments(path) {
  return normalizeAbsolutePath(path).split("/").filter(Boolean);
}
function parseAbsolutePath(path) {
  const normalizedPath = normalizeAbsolutePath(path);
  const segments = getPathSegments(normalizedPath);
  if (segments.length === 0) {
    throw new Error("Path must target a file name.");
  }
  return {
    path: normalizedPath,
    segments,
    name: segments[segments.length - 1],
    parentSegments: segments.slice(0, -1)
  };
}

// src/session/errors.ts
var SessionError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionError";
  }
};
var InvalidSessionIdError = class extends SessionError {
  constructor() {
    super("Session id must be a non-empty string.");
    this.name = "InvalidSessionIdError";
  }
};
var SessionIntegrityError = class extends SessionError {
  constructor(sessionId) {
    super(`Session "${sessionId}" is missing a valid root folder node.`);
    this.name = "SessionIntegrityError";
  }
};

// src/session/createSession.ts
var ROOT_NODE_NAME = "/";
function createRootNode(sessionId, timestamp) {
  return {
    id: createId(`root:${sessionId}`),
    sessionId,
    parentId: null,
    name: ROOT_NODE_NAME,
    kind: "folder",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
async function createSession(sessionId, database = db) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new InvalidSessionIdError();
  }
  return database.transaction(
    "rw",
    database.sessionMeta,
    database.nodes,
    async () => {
      const existingSession = await database.sessionMeta.get(normalizedSessionId);
      if (existingSession) {
        const existingRootNode = existingSession.rootNodeId ? await database.nodes.get(existingSession.rootNodeId) : void 0;
        if (!existingRootNode || existingRootNode.kind !== "folder") {
          throw new SessionIntegrityError(normalizedSessionId);
        }
        return {
          session: existingSession,
          rootNode: existingRootNode
        };
      }
      const timestamp = Date.now();
      const rootNode = createRootNode(normalizedSessionId, timestamp);
      const session = {
        sessionId: normalizedSessionId,
        rootNodeId: rootNode.id,
        historyPointer: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await database.nodes.add(rootNode);
      await database.sessionMeta.add(session);
      return {
        session,
        rootNode
      };
    }
  );
}

// src/services/history-store.ts
async function getSessionMetaOrThrow(database, sessionId) {
  const session = await database.sessionMeta.get(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }
  return session;
}
async function getSessionHistoryEntries(database, sessionId) {
  const entries = await database.history.toArray();
  return entries.filter((entry) => entry.sessionId === sessionId).sort((left, right) => (left.id ?? 0) - (right.id ?? 0));
}
async function updateSessionHistoryPointer(database, sessionId, historyPointer) {
  const session = await getSessionMetaOrThrow(database, sessionId);
  const updatedSession = {
    ...session,
    historyPointer,
    updatedAt: Date.now()
  };
  await database.sessionMeta.put(updatedSession);
  return updatedSession;
}
async function recordHistoryEntry(database, entry) {
  const session = await getSessionMetaOrThrow(database, entry.sessionId);
  const entries = await getSessionHistoryEntries(database, entry.sessionId);
  for (const existingEntry of entries) {
    if (existingEntry.id !== void 0 && session.historyPointer !== null && existingEntry.id > session.historyPointer) {
      await database.history.delete(existingEntry.id);
    }
  }
  const nextId = await database.history.add(entry);
  const storedEntry = {
    ...entry,
    id: nextId
  };
  await updateSessionHistoryPointer(database, entry.sessionId, nextId);
  return storedEntry;
}

// src/services/nodes.ts
function normalizeNodeName(name) {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.includes("/")) {
    throw new InvalidNodeNameError(name);
  }
  return normalizedName;
}
async function listChildrenByParent(database, sessionId, parentId) {
  const key = [sessionId, parentId];
  const children = await database.nodes.where("[sessionId+parentId]").equals(key).toArray();
  return children.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}
async function findChildByName(database, sessionId, parentId, name) {
  const children = await listChildrenByParent(database, sessionId, parentId);
  return children.find((child) => child.name === name);
}
async function getNode(database, nodeId) {
  const node = await database.nodes.get(nodeId);
  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }
  return node;
}
async function getFolderNode(database, folderId) {
  const node = await getNode(database, folderId);
  if (node.kind !== "folder") {
    throw new NotAFolderError(folderId);
  }
  return node;
}
async function resolveFolderPath(database, sessionId, rootNode, segments, sourcePath) {
  let currentFolder = rootNode;
  for (const segment of segments) {
    const child = await findChildByName(database, sessionId, currentFolder.id, segment);
    if (!child) {
      throw new ParentFolderNotFoundError(sourcePath);
    }
    if (child.kind !== "folder") {
      throw new NotAFolderError(child.id);
    }
    currentFolder = child;
  }
  return currentFolder;
}
async function resolvePath(sessionId, path, database = db) {
  const normalizedPath = path.trim();
  const { rootNode } = await createSession(sessionId, database);
  const segments = getPathSegments(normalizedPath);
  return database.transaction("r", database.nodes, async () => {
    if (segments.length === 0) {
      return rootNode;
    }
    let currentNode = rootNode;
    for (const segment of segments) {
      if (currentNode.kind !== "folder") {
        throw new NotAFolderError(currentNode.id);
      }
      const child = await findChildByName(
        database,
        rootNode.sessionId,
        currentNode.id,
        segment
      );
      if (!child) {
        throw new ParentFolderNotFoundError(normalizedPath);
      }
      currentNode = child;
    }
    return currentNode;
  });
}
async function listChildren(folderId, database = db) {
  return database.transaction("r", database.nodes, async () => {
    const folderNode = await getFolderNode(database, folderId);
    return listChildrenByParent(database, folderNode.sessionId, folderNode.id);
  });
}
async function createFolder(sessionId, path, database = db) {
  let parsedPath;
  try {
    parsedPath = parseAbsolutePath(path);
  } catch {
    throw new InvalidFilePathError(path);
  }
  const { rootNode } = await createSession(sessionId, database);
  const folderNode = await database.transaction(
    "rw",
    database.nodes,
    database.history,
    database.sessionMeta,
    async () => {
      const parentFolder = await resolveFolderPath(
        database,
        rootNode.sessionId,
        rootNode,
        parsedPath.parentSegments,
        parsedPath.path
      );
      const existingNode = await findChildByName(
        database,
        rootNode.sessionId,
        parentFolder.id,
        parsedPath.name
      );
      if (existingNode) {
        throw new DuplicateNodeNameError(parsedPath.name, parentFolder.id);
      }
      const timestamp = Date.now();
      const folderNode2 = {
        id: createId(`folder:${rootNode.sessionId}`),
        sessionId: rootNode.sessionId,
        parentId: parentFolder.id,
        name: parsedPath.name,
        kind: "folder",
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await database.nodes.add(folderNode2);
      await recordHistoryEntry(database, {
        sessionId: folderNode2.sessionId,
        timestamp,
        type: "FOLDER_CREATED",
        payload: {
          node: folderNode2
        }
      });
      return folderNode2;
    }
  );
  emit("FOLDER_CREATED", {
    folder: folderNode
  });
  return folderNode;
}
async function assertSiblingNameAvailable(database, node, targetParentId, targetName) {
  const sibling = await findChildByName(
    database,
    node.sessionId,
    targetParentId,
    targetName
  );
  if (sibling && sibling.id !== node.id) {
    throw new DuplicateNodeNameError(targetName, targetParentId);
  }
}
async function rename(nodeId, nextName, database = db) {
  const normalizedName = normalizeNodeName(nextName);
  const result = await database.transaction(
    "rw",
    database.nodes,
    database.history,
    database.sessionMeta,
    async () => {
      const node = await getNode(database, nodeId);
      if (node.parentId === null) {
        throw new RootNodeMutationError("rename");
      }
      await assertSiblingNameAvailable(database, node, node.parentId, normalizedName);
      if (node.name === normalizedName) {
        return {
          node,
          previousName: node.name,
          changed: false
        };
      }
      const updatedNode = {
        ...node,
        name: normalizedName,
        updatedAt: Date.now()
      };
      await database.nodes.put(updatedNode);
      await recordHistoryEntry(database, {
        sessionId: node.sessionId,
        timestamp: updatedNode.updatedAt,
        type: "NODE_RENAMED",
        payload: {
          nodeId: node.id,
          nodeKind: node.kind,
          previousName: node.name,
          nextName: normalizedName
        }
      });
      return {
        node: updatedNode,
        previousName: node.name,
        changed: true
      };
    }
  );
  if (result.changed && result.node.kind === "file") {
    emit("FILE_RENAMED", {
      file: result.node,
      previousName: result.previousName,
      currentName: result.node.name
    });
  }
  return result.node;
}
async function isDescendantFolder(database, folderId, potentialAncestorId) {
  let currentNode = await getFolderNode(database, folderId);
  while (currentNode.parentId) {
    if (currentNode.parentId === potentialAncestorId) {
      return true;
    }
    const parentNode = await getFolderNode(database, currentNode.parentId);
    currentNode = parentNode;
  }
  return false;
}
async function move(nodeId, targetFolderId, database = db) {
  const result = await database.transaction(
    "rw",
    database.nodes,
    database.history,
    database.sessionMeta,
    async () => {
      const node = await getNode(database, nodeId);
      const targetFolder = await getFolderNode(database, targetFolderId);
      if (node.parentId === null) {
        throw new RootNodeMutationError("move");
      }
      if (node.sessionId !== targetFolder.sessionId) {
        throw new SessionMismatchError(node.id, targetFolder.id);
      }
      if (node.kind === "folder") {
        if (node.id === targetFolder.id || await isDescendantFolder(database, targetFolder.id, node.id)) {
          throw new TreeCycleError(node.id, targetFolder.id);
        }
      }
      await assertSiblingNameAvailable(database, node, targetFolder.id, node.name);
      if (node.parentId === targetFolder.id) {
        return {
          node,
          previousParentId: node.parentId,
          changed: false
        };
      }
      const updatedNode = {
        ...node,
        parentId: targetFolder.id,
        updatedAt: Date.now()
      };
      await database.nodes.put(updatedNode);
      await recordHistoryEntry(database, {
        sessionId: node.sessionId,
        timestamp: updatedNode.updatedAt,
        type: "NODE_MOVED",
        payload: {
          nodeId: node.id,
          nodeKind: node.kind,
          previousParentId: node.parentId,
          nextParentId: targetFolder.id
        }
      });
      return {
        node: updatedNode,
        previousParentId: node.parentId,
        changed: true
      };
    }
  );
  if (result.changed) {
    if (result.node.kind === "file") {
      emit("FILE_MOVED", {
        file: result.node,
        previousParentId: result.previousParentId,
        currentParentId: result.node.parentId
      });
    } else {
      emit("FOLDER_MOVED", {
        folder: result.node,
        previousParentId: result.previousParentId,
        currentParentId: result.node.parentId
      });
    }
  }
  return result.node;
}
async function collectFolderSubtreeIds(database, folderNode) {
  const nodeIds = [folderNode.id];
  const queue = [folderNode.id];
  while (queue.length > 0) {
    const parentId = queue.shift();
    const children = await listChildrenByParent(database, folderNode.sessionId, parentId);
    for (const child of children) {
      nodeIds.push(child.id);
      if (child.kind === "folder") {
        queue.push(child.id);
      }
    }
  }
  return nodeIds;
}
async function deleteFolder(folderId, database = db) {
  const result = await database.transaction(
    "rw",
    database.nodes,
    database.history,
    database.sessionMeta,
    async () => {
      const folderNode = await getFolderNode(database, folderId);
      if (folderNode.parentId === null) {
        throw new RootNodeMutationError("delete");
      }
      const nodeIds = await collectFolderSubtreeIds(database, folderNode);
      const deletedNodes = [];
      for (const nodeId of nodeIds) {
        deletedNodes.push(await getNode(database, nodeId));
      }
      for (const nodeId of nodeIds) {
        await database.nodes.delete(nodeId);
      }
      await recordHistoryEntry(database, {
        sessionId: folderNode.sessionId,
        timestamp: Date.now(),
        type: "FOLDER_DELETED",
        payload: {
          nodes: deletedNodes
        }
      });
      return {
        folder: folderNode,
        deletedNodeIds: nodeIds
      };
    }
  );
  emit("FOLDER_DELETED", {
    folder: result.folder,
    deletedNodeIds: result.deletedNodeIds
  });
  return {
    deletedNodeIds: result.deletedNodeIds
  };
}

// src/services/files.ts
async function getFileNode(database, fileId) {
  const node = await getNode(database, fileId);
  if (node.kind !== "file") {
    throw new NotAFileError(fileId);
  }
  return node;
}
async function ensureFileVersion(database, fileId, content, timestamp) {
  const hash = await createContentHash(content);
  const existingVersion = await database.fileVersions.get(hash);
  if (existingVersion) {
    return existingVersion;
  }
  const version = {
    hash,
    fileId,
    content,
    createdAt: timestamp
  };
  await database.fileVersions.add(version);
  return version;
}
async function createFile(sessionId, path, content, database = db) {
  let parsedPath;
  try {
    parsedPath = parseAbsolutePath(path);
  } catch {
    throw new InvalidFilePathError(path);
  }
  const { rootNode } = await createSession(sessionId, database);
  const fileNode = await database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const parentFolder = await resolveFolderPath(
        database,
        rootNode.sessionId,
        rootNode,
        parsedPath.parentSegments,
        parsedPath.path
      );
      const existingNode = await findChildByName(
        database,
        rootNode.sessionId,
        parentFolder.id,
        parsedPath.name
      );
      if (existingNode) {
        throw new DuplicateNodeNameError(parsedPath.name, parentFolder.id);
      }
      const timestamp = Date.now();
      const fileId = createId(`file:${rootNode.sessionId}`);
      const version = await ensureFileVersion(database, fileId, content, timestamp);
      const fileNode2 = {
        id: fileId,
        sessionId: rootNode.sessionId,
        parentId: parentFolder.id,
        name: parsedPath.name,
        kind: "file",
        currentVersionHash: version.hash,
        originalVersionHash: version.hash,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await database.nodes.add(fileNode2);
      await recordHistoryEntry(database, {
        sessionId: fileNode2.sessionId,
        timestamp,
        type: "FILE_CREATED",
        payload: {
          node: fileNode2
        }
      });
      return fileNode2;
    }
  );
  emit("FILE_CREATED", {
    file: fileNode
  });
  return fileNode;
}
async function readFile(fileId, versionHash, database = db) {
  return database.transaction(
    "r",
    database.nodes,
    database.fileVersions,
    async () => {
      const fileNode = await getFileNode(database, fileId);
      const targetHash = versionHash ?? fileNode.currentVersionHash;
      if (!targetHash) {
        throw new FileVersionNotFoundError("null");
      }
      const version = await database.fileVersions.get(targetHash);
      if (!version) {
        throw new FileVersionNotFoundError(targetHash);
      }
      return version.content;
    }
  );
}
async function deleteFile(fileId, database = db) {
  const fileNode = await database.transaction(
    "rw",
    database.nodes,
    database.history,
    database.sessionMeta,
    async () => {
      const node = await getFileNode(database, fileId);
      await database.nodes.delete(node.id);
      await recordHistoryEntry(database, {
        sessionId: node.sessionId,
        timestamp: Date.now(),
        type: "FILE_DELETED",
        payload: {
          node
        }
      });
      return node;
    }
  );
  emit("FILE_DELETED", {
    file: fileNode
  });
  return fileNode;
}
async function updateFile(fileId, content, database = db) {
  const result = await database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const fileNode = await getFileNode(database, fileId);
      const timestamp = Date.now();
      const version = await ensureFileVersion(database, fileId, content, timestamp);
      if (fileNode.currentVersionHash === version.hash) {
        return {
          file: fileNode,
          previousVersionHash: fileNode.currentVersionHash,
          changed: false
        };
      }
      const updatedFileNode = {
        ...fileNode,
        currentVersionHash: version.hash,
        updatedAt: timestamp
      };
      await database.nodes.put(updatedFileNode);
      await recordHistoryEntry(database, {
        sessionId: fileNode.sessionId,
        timestamp,
        type: "FILE_UPDATED",
        payload: {
          fileId,
          previousVersionHash: fileNode.currentVersionHash,
          nextVersionHash: version.hash
        }
      });
      return {
        file: updatedFileNode,
        previousVersionHash: fileNode.currentVersionHash,
        changed: true
      };
    }
  );
  if (result.changed) {
    emit("FILE_UPDATED", {
      file: result.file,
      previousVersionHash: result.previousVersionHash,
      currentVersionHash: result.file.currentVersionHash
    });
  }
  return result.file;
}
async function listFileVersions(fileId, database = db) {
  return database.transaction(
    "r",
    database.nodes,
    database.fileVersions,
    async () => {
      await getFileNode(database, fileId);
      const versions = await database.fileVersions.where("fileId").equals(fileId).toArray();
      return versions.sort((left, right) => right.createdAt - left.createdAt);
    }
  );
}

// src/services/history.ts
async function getNodeOrThrow(database, nodeId) {
  const node = await database.nodes.get(nodeId);
  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }
  return node;
}
async function getFileNodeOrThrow(database, fileId) {
  const node = await getNodeOrThrow(database, fileId);
  if (node.kind !== "file") {
    throw new NotAFileError(fileId);
  }
  return node;
}
async function putNodes(database, nodes) {
  for (const node of nodes) {
    await database.nodes.put(node);
  }
}
async function deleteNodes(database, nodeIds) {
  for (const nodeId of nodeIds) {
    await database.nodes.delete(nodeId);
  }
}
async function applyVersionPointer(database, fileId, versionHash) {
  const fileNode = await getFileNodeOrThrow(database, fileId);
  const updatedNode = {
    ...fileNode,
    currentVersionHash: versionHash,
    updatedAt: Date.now()
  };
  await database.nodes.put(updatedNode);
  return updatedNode;
}
async function applyHistoryEntry(database, entry, direction) {
  switch (entry.type) {
    case "FILE_CREATED": {
      if (direction === "undo") {
        await database.nodes.delete(entry.payload.node.id);
      } else {
        await database.nodes.put(entry.payload.node);
      }
      return;
    }
    case "FILE_UPDATED": {
      const targetHash = direction === "undo" ? entry.payload.previousVersionHash : entry.payload.nextVersionHash;
      await applyVersionPointer(database, entry.payload.fileId, targetHash);
      return;
    }
    case "FILE_DELETED": {
      if (direction === "undo") {
        await database.nodes.put(entry.payload.node);
      } else {
        await database.nodes.delete(entry.payload.node.id);
      }
      return;
    }
    case "FILE_RESTORED": {
      const targetHash = direction === "undo" ? entry.payload.previousVersionHash : entry.payload.restoredVersionHash;
      await applyVersionPointer(database, entry.payload.fileId, targetHash);
      return;
    }
    case "FOLDER_CREATED": {
      if (direction === "undo") {
        await database.nodes.delete(entry.payload.node.id);
      } else {
        await database.nodes.put(entry.payload.node);
      }
      return;
    }
    case "FOLDER_DELETED": {
      if (direction === "undo") {
        await putNodes(database, entry.payload.nodes);
      } else {
        await deleteNodes(
          database,
          entry.payload.nodes.map((node) => node.id)
        );
      }
      return;
    }
    case "NODE_RENAMED": {
      const node = await getNodeOrThrow(database, entry.payload.nodeId);
      const updatedNode = {
        ...node,
        name: direction === "undo" ? entry.payload.previousName : entry.payload.nextName,
        updatedAt: Date.now()
      };
      await database.nodes.put(updatedNode);
      return;
    }
    case "NODE_MOVED": {
      const node = await getNodeOrThrow(database, entry.payload.nodeId);
      const updatedNode = {
        ...node,
        parentId: direction === "undo" ? entry.payload.previousParentId : entry.payload.nextParentId,
        updatedAt: Date.now()
      };
      await database.nodes.put(updatedNode);
      return;
    }
  }
}
function emitHistoryMutation(entry, direction) {
  switch (entry.type) {
    case "FILE_CREATED": {
      if (direction === "undo") {
        emit("FILE_DELETED", {
          file: entry.payload.node
        });
      } else {
        emit("FILE_CREATED", {
          file: entry.payload.node
        });
      }
      return;
    }
    case "FILE_UPDATED": {
      const currentVersionHash = direction === "undo" ? entry.payload.previousVersionHash : entry.payload.nextVersionHash;
      const previousVersionHash = direction === "undo" ? entry.payload.nextVersionHash : entry.payload.previousVersionHash;
      emit("FILE_UPDATED", {
        file: {
          id: entry.payload.fileId,
          kind: "file",
          currentVersionHash
        },
        previousVersionHash,
        currentVersionHash
      });
      return;
    }
    case "FILE_DELETED": {
      if (direction === "undo") {
        emit("FILE_CREATED", {
          file: entry.payload.node
        });
      } else {
        emit("FILE_DELETED", {
          file: entry.payload.node
        });
      }
      return;
    }
    case "FILE_RESTORED": {
      const currentVersionHash = direction === "undo" ? entry.payload.previousVersionHash : entry.payload.restoredVersionHash;
      const previousVersionHash = direction === "undo" ? entry.payload.restoredVersionHash : entry.payload.previousVersionHash;
      emit("FILE_UPDATED", {
        file: {
          id: entry.payload.fileId,
          kind: "file",
          currentVersionHash
        },
        previousVersionHash,
        currentVersionHash
      });
      return;
    }
    case "FOLDER_CREATED": {
      if (direction === "undo") {
        emit("FOLDER_DELETED", {
          folder: entry.payload.node,
          deletedNodeIds: [entry.payload.node.id]
        });
      } else {
        emit("FOLDER_CREATED", {
          folder: entry.payload.node
        });
      }
      return;
    }
    case "FOLDER_DELETED": {
      const folderNode = entry.payload.nodes.find(
        (node) => node.kind === "folder" && node.parentId !== null
      );
      if (!folderNode) {
        return;
      }
      if (direction === "undo") {
        emit("FOLDER_CREATED", {
          folder: folderNode
        });
      } else {
        emit("FOLDER_DELETED", {
          folder: folderNode,
          deletedNodeIds: entry.payload.nodes.map((node) => node.id)
        });
      }
      return;
    }
    case "NODE_RENAMED": {
      if (entry.payload.nodeKind === "file") {
        emit("FILE_RENAMED", {
          file: {
            id: entry.payload.nodeId,
            kind: "file",
            name: direction === "undo" ? entry.payload.previousName : entry.payload.nextName
          },
          previousName: direction === "undo" ? entry.payload.nextName : entry.payload.previousName,
          currentName: direction === "undo" ? entry.payload.previousName : entry.payload.nextName
        });
      }
      return;
    }
    case "NODE_MOVED": {
      if (entry.payload.nodeKind === "file") {
        emit("FILE_MOVED", {
          file: {
            id: entry.payload.nodeId,
            kind: "file",
            parentId: direction === "undo" ? entry.payload.previousParentId : entry.payload.nextParentId
          },
          previousParentId: direction === "undo" ? entry.payload.nextParentId : entry.payload.previousParentId,
          currentParentId: direction === "undo" ? entry.payload.previousParentId : entry.payload.nextParentId
        });
      } else {
        emit("FOLDER_MOVED", {
          folder: {
            id: entry.payload.nodeId,
            kind: "folder",
            parentId: direction === "undo" ? entry.payload.previousParentId : entry.payload.nextParentId
          },
          previousParentId: direction === "undo" ? entry.payload.nextParentId : entry.payload.previousParentId,
          currentParentId: direction === "undo" ? entry.payload.previousParentId : entry.payload.nextParentId
        });
      }
      return;
    }
  }
}
async function undo(sessionId, database = db) {
  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const entries = await getSessionHistoryEntries(database, sessionId);
      const session = await database.sessionMeta.get(sessionId);
      if (!session || session.historyPointer === null) {
        return null;
      }
      const entryIndex = entries.findIndex((entry2) => entry2.id === session.historyPointer);
      if (entryIndex === -1) {
        return null;
      }
      const entry = entries[entryIndex];
      await applyHistoryEntry(database, entry, "undo");
      await updateSessionHistoryPointer(
        database,
        sessionId,
        entryIndex > 0 ? entries[entryIndex - 1]?.id ?? null : null
      );
      emitHistoryMutation(entry, "undo");
      return entry;
    }
  );
}
async function redo(sessionId, database = db) {
  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const entries = await getSessionHistoryEntries(database, sessionId);
      const session = await database.sessionMeta.get(sessionId);
      if (!session) {
        return null;
      }
      const historyPointer = session.historyPointer;
      const nextEntry = historyPointer === null ? entries[0] : entries.find((entry) => (entry.id ?? 0) > historyPointer);
      if (!nextEntry || nextEntry.id === void 0) {
        return null;
      }
      await applyHistoryEntry(database, nextEntry, "redo");
      await updateSessionHistoryPointer(database, sessionId, nextEntry.id);
      emitHistoryMutation(nextEntry, "redo");
      return nextEntry;
    }
  );
}
async function restoreVersion(fileId, versionHash, database = db) {
  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const fileNode = await getFileNodeOrThrow(database, fileId);
      const version = await database.fileVersions.get(versionHash);
      if (!version) {
        throw new FileVersionNotFoundError(versionHash);
      }
      if (fileNode.currentVersionHash === versionHash) {
        return fileNode;
      }
      const updatedNode = {
        ...fileNode,
        currentVersionHash: versionHash,
        updatedAt: Date.now()
      };
      await database.nodes.put(updatedNode);
      await recordHistoryEntry(database, {
        sessionId: fileNode.sessionId,
        timestamp: Date.now(),
        type: "FILE_RESTORED",
        payload: {
          fileId,
          previousVersionHash: fileNode.currentVersionHash,
          restoredVersionHash: versionHash
        }
      });
      emit("FILE_UPDATED", {
        file: updatedNode,
        previousVersionHash: fileNode.currentVersionHash,
        currentVersionHash: updatedNode.currentVersionHash
      });
      return updatedNode;
    }
  );
}

// src/api/createFS.ts
function createSessionBoundFS(sessionId, rootNodeId, database) {
  return {
    sessionId,
    rootNodeId,
    createFile: (path, content) => createFile(sessionId, path, content, database),
    deleteFile: (fileId) => deleteFile(fileId, database),
    readFile: (fileId, versionHash) => readFile(fileId, versionHash, database),
    updateFile: (fileId, content) => updateFile(fileId, content, database),
    listFileVersions: (fileId) => listFileVersions(fileId, database),
    createFolder: (path) => createFolder(sessionId, path, database),
    deleteFolder: (folderId) => deleteFolder(folderId, database),
    rename: (nodeId, nextName) => rename(nodeId, nextName, database),
    move: (nodeId, targetFolderId) => move(nodeId, targetFolderId, database),
    listChildren: (folderId) => listChildren(folderId, database),
    resolvePath: (path) => resolvePath(sessionId, path, database),
    undo: () => undo(sessionId, database),
    redo: () => redo(sessionId, database),
    restoreVersion: (fileId, versionHash) => restoreVersion(fileId, versionHash, database),
    getHistory: () => getSessionHistoryEntries(database ?? db, sessionId),
    on: (eventType, handler) => {
      on(eventType, handler);
      return () => off(eventType, handler);
    },
    off: (eventType, handler) => {
      off(eventType, handler);
    }
  };
}
async function createFS(options) {
  const { session, rootNode } = await createSession(options.sessionId);
  return createSessionBoundFS(session.sessionId, rootNode.id);
}

// src/api/terminateFS.ts
function getFileNodeVersionHashes(fileNode) {
  return [fileNode.currentVersionHash, fileNode.originalVersionHash].filter(
    (hash) => Boolean(hash)
  );
}
function entryReferencesHash(entry, hash) {
  switch (entry.type) {
    case "FILE_CREATED":
    case "FILE_DELETED":
      return getFileNodeVersionHashes(entry.payload.node).includes(hash);
    case "FILE_UPDATED":
      return entry.payload.previousVersionHash === hash || entry.payload.nextVersionHash === hash;
    case "FILE_RESTORED":
      return entry.payload.previousVersionHash === hash || entry.payload.restoredVersionHash === hash;
    case "FOLDER_DELETED":
      return entry.payload.nodes.some(
        (node) => node.kind === "file" && getFileNodeVersionHashes(node).includes(hash)
      );
    default:
      return false;
  }
}
async function terminateSessionRecords(sessionId, database) {
  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    database.history,
    database.sessionMeta,
    async () => {
      const session = await database.sessionMeta.get(sessionId);
      if (!session) {
        return {
          sessionId,
          deletedNodes: 0,
          deletedFileVersions: 0,
          deletedHistoryEntries: 0,
          deletedSession: false
        };
      }
      const allNodes = await database.nodes.toArray();
      const allHistoryEntries = await database.history.toArray();
      const allFileVersions = await database.fileVersions.toArray();
      const sessionNodes = allNodes.filter((node) => node.sessionId === sessionId);
      const sessionFileIds = sessionNodes.filter((node) => node.kind === "file").map((node) => node.id);
      const sessionHistoryEntries = allHistoryEntries.filter(
        (entry) => entry.sessionId === sessionId
      );
      const remainingNodes = allNodes.filter((node) => node.sessionId !== sessionId);
      const remainingHistoryEntries = allHistoryEntries.filter(
        (entry) => entry.sessionId !== sessionId
      );
      const candidateVersions = allFileVersions.filter(
        (version) => sessionFileIds.includes(version.fileId)
      );
      const remainingReferencedHashes = /* @__PURE__ */ new Set();
      for (const node of remainingNodes) {
        if (node.kind === "file") {
          for (const hash of getFileNodeVersionHashes(node)) {
            remainingReferencedHashes.add(hash);
          }
        }
      }
      for (const entry of remainingHistoryEntries) {
        for (const candidate of candidateVersions) {
          if (entryReferencesHash(entry, candidate.hash)) {
            remainingReferencedHashes.add(candidate.hash);
          }
        }
      }
      let deletedFileVersions = 0;
      for (const version of candidateVersions) {
        if (!remainingReferencedHashes.has(version.hash)) {
          await database.fileVersions.delete(version.hash);
          deletedFileVersions += 1;
        }
      }
      for (const node of sessionNodes) {
        await database.nodes.delete(node.id);
      }
      for (const entry of sessionHistoryEntries) {
        if (entry.id !== void 0) {
          await database.history.delete(entry.id);
        }
      }
      await database.sessionMeta.delete(sessionId);
      return {
        sessionId,
        deletedNodes: sessionNodes.length,
        deletedFileVersions,
        deletedHistoryEntries: sessionHistoryEntries.length,
        deletedSession: true
      };
    }
  );
}
async function terminateFS(options) {
  const result = await terminateSessionRecords(options.sessionId, db);
  const remainingSessions = await db.sessionMeta.toArray();
  const databaseClosed = remainingSessions.length === 0;
  if (databaseClosed) {
    db.close();
  }
  return {
    ...result,
    databaseClosed
  };
}

// demo/app.js
var elements = {
  sessionForm: document.querySelector("#sessionForm"),
  sessionId: document.querySelector("#sessionId"),
  rootNodeId: document.querySelector("#rootNodeId"),
  terminateSession: document.querySelector("#terminateSession"),
  selectedTargetLabel: document.querySelector("#selectedTargetLabel"),
  status: document.querySelector("#status"),
  tree: document.querySelector("#tree"),
  history: document.querySelector("#history"),
  versions: document.querySelector("#versions"),
  versionsMeta: document.querySelector("#versionsMeta"),
  contentMeta: document.querySelector("#contentMeta"),
  contentView: document.querySelector("#contentView"),
  createFolderForm: document.querySelector("#createFolderForm"),
  createFileForm: document.querySelector("#createFileForm"),
  updateFileForm: document.querySelector("#updateFileForm"),
  renameFileForm: document.querySelector("#renameFileForm"),
  deleteFileForm: document.querySelector("#deleteFileForm"),
  renameFolderForm: document.querySelector("#renameFolderForm"),
  deleteFolderForm: document.querySelector("#deleteFolderForm"),
  moveForm: document.querySelector("#moveForm"),
  readVersionForm: document.querySelector("#readVersionForm"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  refreshButton: document.querySelector("#refreshButton")
};
var state = {
  fs: null,
  selectedNodeId: null,
  selectedNodePath: "/",
  selectedNodeKind: "folder",
  unsubscribers: []
};
function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}
function clearSubscriptions() {
  for (const unsubscribe of state.unsubscribers) {
    unsubscribe();
  }
  state.unsubscribers = [];
}
function normalizeInputPath(path) {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
function emptyState(message) {
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = message;
  return block;
}
async function resolveNode(path) {
  if (!state.fs) {
    throw new Error("Start a session first.");
  }
  return state.fs.resolvePath(normalizeInputPath(path));
}
async function resolveFile(path) {
  const node = await resolveNode(path);
  if (node.kind !== "file") {
    throw new Error(`Path "${path}" is not a file.`);
  }
  return node;
}
async function buildTree(nodeId, depth = 0, currentPath = "") {
  const children = await state.fs.listChildren(nodeId);
  const items = [];
  for (const child of children) {
    const childPath = currentPath ? `${currentPath}/${child.name}` : `/${child.name}`;
    items.push({ node: child, depth, path: childPath });
    if (child.kind === "folder") {
      items.push(...await buildTree(child.id, depth + 1, childPath));
    }
  }
  return items;
}
function selectNode(node, path) {
  state.selectedNodeId = node.id;
  state.selectedNodePath = path;
  state.selectedNodeKind = node.kind;
}
async function renderTree() {
  if (!state.fs) {
    elements.tree.replaceChildren(emptyState("Start a session to load the filesystem tree."));
    return;
  }
  const items = await buildTree(state.fs.rootNodeId);
  elements.tree.replaceChildren();
  if (items.length === 0) {
    elements.tree.append(emptyState("The root folder is ready. Create files or folders to begin."));
    return;
  }
  for (const { node, depth, path } of items) {
    const item = document.createElement("div");
    item.className = "tree-item";
    const row = document.createElement("div");
    row.className = "tree-row";
    const label = document.createElement("button");
    label.type = "button";
    label.className = "tree-label";
    label.addEventListener("click", async () => {
      selectNode(node, path);
      await renderSelection();
    });
    const indent = document.createElement("span");
    indent.className = "tree-indent";
    indent.style.marginLeft = `${depth * 14}px`;
    const tag = document.createElement("span");
    tag.className = `tree-tag ${node.kind === "file" ? "file" : ""}`;
    tag.textContent = node.kind;
    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;
    const pathText = document.createElement("span");
    pathText.className = "tree-path";
    pathText.textContent = path;
    label.append(indent, tag, name, pathText);
    row.append(label);
    item.append(row);
    elements.tree.append(item);
  }
}
async function renderHistory() {
  if (!state.fs) {
    elements.history.replaceChildren(emptyState("History will appear after the session starts."));
    return;
  }
  const entries = await state.fs.getHistory();
  elements.history.replaceChildren();
  if (entries.length === 0) {
    elements.history.append(emptyState("No history entries yet."));
    return;
  }
  for (const entry of [...entries].reverse()) {
    const item = document.createElement("div");
    item.className = "history-item";
    const title = document.createElement("strong");
    title.textContent = entry.type;
    const meta = document.createElement("div");
    meta.className = "panel-meta";
    meta.textContent = `#${entry.id ?? "-"} \xB7 ${new Date(entry.timestamp).toLocaleTimeString()}`;
    const payload = document.createElement("pre");
    payload.textContent = JSON.stringify(entry.payload, null, 2);
    item.append(title, meta, payload);
    elements.history.append(item);
  }
}
async function renderVersions() {
  if (!state.fs || !state.selectedNodeId || state.selectedNodeKind !== "file") {
    elements.versionsMeta.textContent = "No file selected";
    elements.versions.replaceChildren(emptyState("Select a file from the tree to inspect versions."));
    return;
  }
  elements.versionsMeta.textContent = state.selectedNodePath;
  const versions = await state.fs.listFileVersions(state.selectedNodeId);
  elements.versions.replaceChildren();
  if (versions.length === 0) {
    elements.versions.append(emptyState("No versions found for this file."));
    return;
  }
  for (const version of versions) {
    const item = document.createElement("div");
    item.className = "version-item";
    const meta = document.createElement("div");
    meta.innerHTML = `
      <strong>${version.hash.slice(0, 18)}...</strong>
      <div class="panel-meta">${new Date(version.createdAt).toLocaleString()}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "version-actions";
    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "button-secondary";
    readButton.textContent = "Read";
    readButton.addEventListener("click", async () => {
      document.querySelector("#versionHash").value = version.hash;
      await renderContent(version.hash);
      setStatus(`Loaded version ${version.hash.slice(0, 12)}...`);
    });
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", async () => {
      await state.fs.restoreVersion(state.selectedNodeId, version.hash);
      await refreshAll(`Restored version ${version.hash.slice(0, 12)}...`);
    });
    actions.append(readButton, restoreButton);
    item.append(meta, actions);
    elements.versions.append(item);
  }
}
async function renderContent(versionHash) {
  if (!state.fs || !state.selectedNodeId) {
    elements.contentMeta.textContent = "No file selected";
    elements.contentView.value = "";
    elements.contentView.placeholder = "Click a file in the tree to inspect its content.";
    return;
  }
  elements.selectedTargetLabel.textContent = state.selectedNodePath;
  if (state.selectedNodeKind !== "file") {
    elements.contentMeta.textContent = `${state.selectedNodePath} \xB7 folder`;
    elements.contentView.value = "";
    elements.contentView.placeholder = "Folders do not have file content. Select a file from the tree.";
    return;
  }
  elements.contentMeta.textContent = `${state.selectedNodePath} \xB7 file`;
  const content = await state.fs.readFile(state.selectedNodeId, versionHash);
  elements.contentView.value = content;
}
async function renderSelection() {
  if (!state.selectedNodeId) {
    elements.selectedTargetLabel.textContent = "/";
    elements.contentMeta.textContent = "No file selected";
    elements.contentView.value = "";
    elements.contentView.placeholder = "Click a file in the tree to inspect its content.";
    await renderVersions();
    return;
  }
  await renderContent();
  await renderVersions();
}
async function refreshAll(message = "") {
  await renderTree();
  await renderHistory();
  await renderSelection();
  if (message) {
    setStatus(message, false);
  }
}
async function startSession() {
  clearSubscriptions();
  state.selectedNodeId = null;
  state.selectedNodePath = "/";
  state.selectedNodeKind = "folder";
  state.fs = await createFS({ sessionId: elements.sessionId.value.trim() });
  elements.rootNodeId.textContent = state.fs.rootNodeId;
  const refreshFromEvent = async (event) => {
    await refreshAll(`Event: ${event.type}`);
  };
  for (const eventType of [
    "FILE_CREATED",
    "FILE_UPDATED",
    "FILE_DELETED",
    "FILE_RENAMED",
    "FILE_MOVED",
    "FOLDER_CREATED",
    "FOLDER_DELETED",
    "FOLDER_MOVED"
  ]) {
    state.unsubscribers.push(state.fs.on(eventType, refreshFromEvent));
  }
  await refreshAll(`Session "${state.fs.sessionId}" ready.`);
}
async function terminateSession() {
  const sessionId = elements.sessionId.value.trim();
  if (!sessionId) {
    throw new Error("Enter a session id before terminating.");
  }
  clearSubscriptions();
  await terminateFS({ sessionId });
  window.location.reload();
}
async function submitHandler(run) {
  try {
    await run();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}
elements.sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(startSession);
});
elements.terminateSession.addEventListener("click", () => {
  submitHandler(terminateSession);
});
elements.createFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#folderPath").value);
    await state.fs.createFolder(path);
    await refreshAll(`Created folder ${path}`);
  });
});
elements.createFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#createFilePath").value);
    const content = document.querySelector("#createFileContent").value;
    const file = await state.fs.createFile(path, content);
    selectNode(file, path);
    await refreshAll(`Created file ${path}`);
  });
});
elements.updateFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#updateFilePath").value);
    const content = document.querySelector("#updateFileContent").value;
    const file = await resolveFile(path);
    selectNode(file, path);
    await state.fs.updateFile(file.id, content);
    await refreshAll(`Updated file ${path}`);
  });
});
elements.renameFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#renameFilePath").value);
    const nextName = document.querySelector("#renameFileName").value.trim();
    const file = await resolveFile(path);
    await state.fs.rename(file.id, nextName);
    if (state.selectedNodeId === file.id) {
      const segments = path.split("/");
      segments[segments.length - 1] = nextName;
      state.selectedNodePath = segments.join("/") || "/";
      state.selectedNodeKind = "file";
    }
    await refreshAll(`Renamed file ${path} to ${nextName}`);
  });
});
elements.deleteFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#deleteFilePath").value);
    const file = await resolveFile(path);
    await state.fs.deleteFile(file.id);
    if (state.selectedNodeId === file.id) {
      state.selectedNodeId = null;
      state.selectedNodePath = "/";
      state.selectedNodeKind = "folder";
    }
    await refreshAll(`Deleted file ${path}`);
  });
});
elements.renameFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#renameFolderPath").value);
    const nextName = document.querySelector("#renameFolderName").value.trim();
    const folder = await resolveNode(path);
    if (folder.kind !== "folder") {
      throw new Error(`Path "${path}" is not a folder.`);
    }
    await state.fs.rename(folder.id, nextName);
    if (state.selectedNodePath.startsWith(`${path}/`) || state.selectedNodePath === path) {
      const basePath = path.split("/").slice(0, -1).join("/") || "";
      const renamedPath = `${basePath}/${nextName}`.replace("//", "/");
      state.selectedNodePath = state.selectedNodePath === path ? renamedPath : state.selectedNodePath.replace(`${path}/`, `${renamedPath}/`);
    }
    await refreshAll(`Renamed folder ${path} to ${nextName}`);
  });
});
elements.deleteFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#deleteFolderPath").value);
    const folder = await resolveNode(path);
    if (folder.kind !== "folder") {
      throw new Error(`Path "${path}" is not a folder.`);
    }
    await state.fs.deleteFolder(folder.id);
    if (state.selectedNodePath === path || state.selectedNodePath.startsWith(`${path}/`)) {
      state.selectedNodeId = null;
      state.selectedNodePath = "/";
      state.selectedNodeKind = "folder";
    }
    await refreshAll(`Deleted folder tree ${path}`);
  });
});
elements.moveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const sourcePath = normalizeInputPath(document.querySelector("#moveSourcePath").value);
    const targetPath = normalizeInputPath(document.querySelector("#moveTargetPath").value);
    const sourceNode = await resolveNode(sourcePath);
    const targetNode = await resolveNode(targetPath);
    if (targetNode.kind !== "folder") {
      throw new Error(`Target path "${targetPath}" is not a folder.`);
    }
    await state.fs.move(sourceNode.id, targetNode.id);
    if (state.selectedNodeId === sourceNode.id || state.selectedNodePath.startsWith(`${sourcePath}/`)) {
      const movedPath = `${targetPath}/${sourceNode.name}`.replace("//", "/");
      state.selectedNodePath = state.selectedNodePath === sourcePath ? movedPath : state.selectedNodePath.replace(`${sourcePath}/`, `${movedPath}/`);
    }
    await refreshAll(`Moved ${sourcePath} into ${targetPath}`);
  });
});
elements.readVersionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#versionFilePath").value);
    const versionHash = document.querySelector("#versionHash").value.trim();
    const file = await resolveFile(path);
    selectNode(file, path);
    await renderContent(versionHash || void 0);
    await renderVersions();
    setStatus(
      versionHash ? `Loaded version ${versionHash.slice(0, 12)}...` : `Loaded latest content for ${path}`
    );
  });
});
elements.undoButton.addEventListener("click", () => {
  submitHandler(async () => {
    await state.fs.undo();
    await refreshAll("Undo applied.");
  });
});
elements.redoButton.addEventListener("click", () => {
  submitHandler(async () => {
    await state.fs.redo();
    await refreshAll("Redo applied.");
  });
});
elements.refreshButton.addEventListener("click", () => {
  submitHandler(async () => {
    await refreshAll("Views refreshed.");
  });
});
startSession().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
