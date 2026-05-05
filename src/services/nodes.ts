import { emit } from "../events";
import { db, type IdbVfsDatabase, type NodeRecord } from "../core";
import { createSession } from "../session";
import type { FolderNode, Node as VfsNode } from "../types";
import { createId, getPathSegments, parseAbsolutePath } from "../utils";
import {
  DuplicateNodeNameError,
  InvalidFilePathError,
  InvalidNodeNameError,
  NodeNotFoundError,
  NotAFolderError,
  ParentFolderNotFoundError,
  RootNodeMutationError,
  SessionMismatchError,
  TreeCycleError,
} from "./errors";
import { recordHistoryEntry } from "./history-store";

type ChildLookupKey = [sessionId: string, parentId: string | null];

export interface DeleteFolderResult {
  deletedNodeIds: string[];
}

function normalizeNodeName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName || normalizedName.includes("/")) {
    throw new InvalidNodeNameError(name);
  }

  return normalizedName;
}

export async function listChildrenByParent(
  database: IdbVfsDatabase,
  sessionId: string,
  parentId: string | null,
): Promise<NodeRecord[]> {
  const key: ChildLookupKey = [sessionId, parentId];

  const children = await database.nodes
    .where("[sessionId+parentId]")
    .equals(key as never)
    .toArray();

  return children.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "folder" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function findChildByName(
  database: IdbVfsDatabase,
  sessionId: string,
  parentId: string | null,
  name: string,
): Promise<NodeRecord | undefined> {
  const children = await listChildrenByParent(database, sessionId, parentId);

  return children.find((child) => child.name === name);
}

export async function getNode(
  database: IdbVfsDatabase,
  nodeId: string,
): Promise<NodeRecord> {
  const node = await database.nodes.get(nodeId);

  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }

  return node;
}

export async function getFolderNode(
  database: IdbVfsDatabase,
  folderId: string,
): Promise<FolderNode> {
  const node = await getNode(database, folderId);

  if (node.kind !== "folder") {
    throw new NotAFolderError(folderId);
  }

  return node;
}

export async function resolveFolderPath(
  database: IdbVfsDatabase,
  sessionId: string,
  rootNode: FolderNode,
  segments: string[],
  sourcePath: string,
): Promise<FolderNode> {
  let currentFolder: FolderNode = rootNode;

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

export async function resolvePath(
  sessionId: string,
  path: string,
  database: IdbVfsDatabase = db,
): Promise<NodeRecord> {
  const normalizedPath = path.trim();
  const { rootNode } = await createSession(sessionId, database);
  const segments = getPathSegments(normalizedPath);

  return database.transaction("r", database.nodes, async () => {
    if (segments.length === 0) {
      return rootNode;
    }

    let currentNode: NodeRecord = rootNode;

    for (const segment of segments) {
      if (currentNode.kind !== "folder") {
        throw new NotAFolderError(currentNode.id);
      }

      const child = await findChildByName(
        database,
        rootNode.sessionId,
        currentNode.id,
        segment,
      );

      if (!child) {
        throw new ParentFolderNotFoundError(normalizedPath);
      }

      currentNode = child;
    }

    return currentNode;
  });
}

export async function listChildren(
  folderId: string,
  database: IdbVfsDatabase = db,
): Promise<NodeRecord[]> {
  return database.transaction("r", database.nodes, async () => {
    const folderNode = await getFolderNode(database, folderId);

    return listChildrenByParent(database, folderNode.sessionId, folderNode.id);
  });
}

export async function createFolder(
  sessionId: string,
  path: string,
  database: IdbVfsDatabase = db,
): Promise<FolderNode> {
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
      parsedPath.path,
    );

    const existingNode = await findChildByName(
      database,
      rootNode.sessionId,
      parentFolder.id,
      parsedPath.name,
    );

    if (existingNode) {
      throw new DuplicateNodeNameError(parsedPath.name, parentFolder.id);
    }

    const timestamp = Date.now();
    const folderNode: FolderNode = {
      id: createId(`folder:${rootNode.sessionId}`),
      sessionId: rootNode.sessionId,
      parentId: parentFolder.id,
      name: parsedPath.name,
      kind: "folder",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await database.nodes.add(folderNode);
    await recordHistoryEntry(database, {
      sessionId: folderNode.sessionId,
      timestamp,
      type: "FOLDER_CREATED",
      payload: {
        node: folderNode,
      },
    });

    return folderNode;
    },
  );

  emit("FOLDER_CREATED", {
    folder: folderNode,
  });

  return folderNode;
}

async function assertSiblingNameAvailable(
  database: IdbVfsDatabase,
  node: NodeRecord,
  targetParentId: string | null,
  targetName: string,
): Promise<void> {
  const sibling = await findChildByName(
    database,
    node.sessionId,
    targetParentId,
    targetName,
  );

  if (sibling && sibling.id !== node.id) {
    throw new DuplicateNodeNameError(targetName, targetParentId);
  }
}

export async function rename(
  nodeId: string,
  nextName: string,
  database: IdbVfsDatabase = db,
): Promise<NodeRecord> {
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
        changed: false,
      };
    }

    const updatedNode: NodeRecord = {
      ...node,
      name: normalizedName,
      updatedAt: Date.now(),
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
        nextName: normalizedName,
      },
    });

    return {
      node: updatedNode,
      previousName: node.name,
      changed: true,
    };
    },
  );

  if (result.changed && result.node.kind === "file") {
    emit("FILE_RENAMED", {
      file: result.node,
      previousName: result.previousName,
      currentName: result.node.name,
    });
  }

  return result.node;
}

async function isDescendantFolder(
  database: IdbVfsDatabase,
  folderId: string,
  potentialAncestorId: string,
): Promise<boolean> {
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

export async function move(
  nodeId: string,
  targetFolderId: string,
  database: IdbVfsDatabase = db,
): Promise<NodeRecord> {
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
        changed: false,
      };
    }

    const updatedNode: NodeRecord = {
      ...node,
      parentId: targetFolder.id,
      updatedAt: Date.now(),
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
        nextParentId: targetFolder.id,
      },
    });

    return {
      node: updatedNode,
      previousParentId: node.parentId,
      changed: true,
    };
    },
  );

  if (result.changed) {
    if (result.node.kind === "file") {
      emit("FILE_MOVED", {
        file: result.node,
        previousParentId: result.previousParentId,
        currentParentId: result.node.parentId,
      });
    } else {
      emit("FOLDER_MOVED", {
        folder: result.node,
        previousParentId: result.previousParentId,
        currentParentId: result.node.parentId,
      });
    }
  }

  return result.node;
}

async function collectFolderSubtreeIds(
  database: IdbVfsDatabase,
  folderNode: FolderNode,
): Promise<string[]> {
  const nodeIds = [folderNode.id];
  const queue: string[] = [folderNode.id];

  while (queue.length > 0) {
    const parentId = queue.shift()!;
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

export async function deleteFolder(
  folderId: string,
  database: IdbVfsDatabase = db,
): Promise<DeleteFolderResult> {
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
    const deletedNodes: VfsNode[] = [];

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
        nodes: deletedNodes,
      },
    });

    return {
      folder: folderNode,
      deletedNodeIds: nodeIds,
    };
    },
  );

  emit("FOLDER_DELETED", {
    folder: result.folder,
    deletedNodeIds: result.deletedNodeIds,
  });

  return {
    deletedNodeIds: result.deletedNodeIds,
  };
}
