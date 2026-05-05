import { emit } from "../events";
import { db, type IdbVfsDatabase } from "../core";
import type { FileNode, FolderNode, HistoryEntry, Node as VfsNode } from "../types";
import {
  FileVersionNotFoundError,
  NodeNotFoundError,
  NotAFileError,
} from "./errors";
import {
  getSessionHistoryEntries,
  recordHistoryEntry,
  updateSessionHistoryPointer,
} from "./history-store";

async function getNodeOrThrow(
  database: IdbVfsDatabase,
  nodeId: string,
): Promise<VfsNode> {
  const node = await database.nodes.get(nodeId);

  if (!node) {
    throw new NodeNotFoundError(nodeId);
  }

  return node;
}

async function getFileNodeOrThrow(
  database: IdbVfsDatabase,
  fileId: string,
): Promise<FileNode> {
  const node = await getNodeOrThrow(database, fileId);

  if (node.kind !== "file") {
    throw new NotAFileError(fileId);
  }

  return node;
}

async function putNodes(
  database: IdbVfsDatabase,
  nodes: VfsNode[],
): Promise<void> {
  for (const node of nodes) {
    await database.nodes.put(node);
  }
}

async function deleteNodes(
  database: IdbVfsDatabase,
  nodeIds: string[],
): Promise<void> {
  for (const nodeId of nodeIds) {
    await database.nodes.delete(nodeId);
  }
}

async function applyVersionPointer(
  database: IdbVfsDatabase,
  fileId: string,
  versionHash: string | null,
): Promise<FileNode> {
  const fileNode = await getFileNodeOrThrow(database, fileId);
  const updatedNode: FileNode = {
    ...fileNode,
    currentVersionHash: versionHash,
    updatedAt: Date.now(),
  };

  await database.nodes.put(updatedNode);

  return updatedNode;
}

async function applyHistoryEntry(
  database: IdbVfsDatabase,
  entry: HistoryEntry,
  direction: "undo" | "redo",
): Promise<void> {
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
      const targetHash =
        direction === "undo"
          ? entry.payload.previousVersionHash
          : entry.payload.nextVersionHash;
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
      const targetHash =
        direction === "undo"
          ? entry.payload.previousVersionHash
          : entry.payload.restoredVersionHash;
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
          entry.payload.nodes.map((node) => node.id),
        );
      }
      return;
    }
    case "NODE_RENAMED": {
      const node = await getNodeOrThrow(database, entry.payload.nodeId);
      const updatedNode: VfsNode = {
        ...node,
        name:
          direction === "undo"
            ? entry.payload.previousName
            : entry.payload.nextName,
        updatedAt: Date.now(),
      };

      await database.nodes.put(updatedNode);
      return;
    }
    case "NODE_MOVED": {
      const node = await getNodeOrThrow(database, entry.payload.nodeId);
      const updatedNode: VfsNode = {
        ...node,
        parentId:
          direction === "undo"
            ? entry.payload.previousParentId
            : entry.payload.nextParentId,
        updatedAt: Date.now(),
      };

      await database.nodes.put(updatedNode);
      return;
    }
  }
}

function emitHistoryMutation(entry: HistoryEntry, direction: "undo" | "redo"): void {
  switch (entry.type) {
    case "FILE_CREATED": {
      if (direction === "undo") {
        emit("FILE_DELETED", {
          file: entry.payload.node,
        });
      } else {
        emit("FILE_CREATED", {
          file: entry.payload.node,
        });
      }
      return;
    }
    case "FILE_UPDATED": {
      const currentVersionHash =
        direction === "undo"
          ? entry.payload.previousVersionHash
          : entry.payload.nextVersionHash;
      const previousVersionHash =
        direction === "undo"
          ? entry.payload.nextVersionHash
          : entry.payload.previousVersionHash;

      emit("FILE_UPDATED", {
        file: {
          id: entry.payload.fileId,
          kind: "file",
          currentVersionHash,
        } as FileNode,
        previousVersionHash,
        currentVersionHash,
      });
      return;
    }
    case "FILE_DELETED": {
      if (direction === "undo") {
        emit("FILE_CREATED", {
          file: entry.payload.node,
        });
      } else {
        emit("FILE_DELETED", {
          file: entry.payload.node,
        });
      }
      return;
    }
    case "FILE_RESTORED": {
      const currentVersionHash =
        direction === "undo"
          ? entry.payload.previousVersionHash
          : entry.payload.restoredVersionHash;
      const previousVersionHash =
        direction === "undo"
          ? entry.payload.restoredVersionHash
          : entry.payload.previousVersionHash;

      emit("FILE_UPDATED", {
        file: {
          id: entry.payload.fileId,
          kind: "file",
          currentVersionHash,
        } as FileNode,
        previousVersionHash,
        currentVersionHash,
      });
      return;
    }
    case "FOLDER_CREATED": {
      if (direction === "undo") {
        emit("FOLDER_DELETED", {
          folder: entry.payload.node,
          deletedNodeIds: [entry.payload.node.id],
        });
      } else {
        emit("FOLDER_CREATED", {
          folder: entry.payload.node,
        });
      }
      return;
    }
    case "FOLDER_DELETED": {
      const folderNode = entry.payload.nodes.find(
        (node): node is FolderNode => node.kind === "folder" && node.parentId !== null,
      );

      if (!folderNode) {
        return;
      }

      if (direction === "undo") {
        emit("FOLDER_CREATED", {
          folder: folderNode,
        });
      } else {
        emit("FOLDER_DELETED", {
          folder: folderNode,
          deletedNodeIds: entry.payload.nodes.map((node) => node.id),
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
            name: direction === "undo" ? entry.payload.previousName : entry.payload.nextName,
          } as FileNode,
          previousName:
            direction === "undo" ? entry.payload.nextName : entry.payload.previousName,
          currentName:
            direction === "undo" ? entry.payload.previousName : entry.payload.nextName,
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
            parentId:
              direction === "undo"
                ? entry.payload.previousParentId
                : entry.payload.nextParentId,
          } as FileNode,
          previousParentId:
            direction === "undo"
              ? entry.payload.nextParentId
              : entry.payload.previousParentId,
          currentParentId:
            direction === "undo"
              ? entry.payload.previousParentId
              : entry.payload.nextParentId,
        });
      } else {
        emit("FOLDER_MOVED", {
          folder: {
            id: entry.payload.nodeId,
            kind: "folder",
            parentId:
              direction === "undo"
                ? entry.payload.previousParentId
                : entry.payload.nextParentId,
          } as FolderNode,
          previousParentId:
            direction === "undo"
              ? entry.payload.nextParentId
              : entry.payload.previousParentId,
          currentParentId:
            direction === "undo"
              ? entry.payload.previousParentId
              : entry.payload.nextParentId,
        });
      }
      return;
    }
  }
}

export async function undo(
  sessionId: string,
  database: IdbVfsDatabase = db,
): Promise<HistoryEntry | null> {
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

      const entryIndex = entries.findIndex((entry) => entry.id === session.historyPointer);

      if (entryIndex === -1) {
        return null;
      }

      const entry = entries[entryIndex]!;

      await applyHistoryEntry(database, entry, "undo");
      await updateSessionHistoryPointer(
        database,
        sessionId,
        entryIndex > 0 ? (entries[entryIndex - 1]?.id ?? null) : null,
      );

      emitHistoryMutation(entry, "undo");

      return entry;
    },
  );
}

export async function redo(
  sessionId: string,
  database: IdbVfsDatabase = db,
): Promise<HistoryEntry | null> {
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
      const nextEntry =
        historyPointer === null
          ? entries[0]
          : entries.find((entry) => (entry.id ?? 0) > historyPointer);

      if (!nextEntry || nextEntry.id === undefined) {
        return null;
      }

      await applyHistoryEntry(database, nextEntry, "redo");
      await updateSessionHistoryPointer(database, sessionId, nextEntry.id);

      emitHistoryMutation(nextEntry, "redo");

      return nextEntry;
    },
  );
}

export async function restoreVersion(
  fileId: string,
  versionHash: string,
  database: IdbVfsDatabase = db,
): Promise<FileNode> {
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

      const updatedNode: FileNode = {
        ...fileNode,
        currentVersionHash: versionHash,
        updatedAt: Date.now(),
      };

      await database.nodes.put(updatedNode);
      await recordHistoryEntry(database, {
        sessionId: fileNode.sessionId,
        timestamp: Date.now(),
        type: "FILE_RESTORED",
        payload: {
          fileId,
          previousVersionHash: fileNode.currentVersionHash,
          restoredVersionHash: versionHash,
        },
      });

      emit("FILE_UPDATED", {
        file: updatedNode,
        previousVersionHash: fileNode.currentVersionHash,
        currentVersionHash: updatedNode.currentVersionHash,
      });

      return updatedNode;
    },
  );
}

export { getSessionHistoryEntries as getHistory } from "./history-store";
