import { db, type IdbVfsDatabase } from "../core";
import type { FileNode, HistoryEntry, Node as VfsNode } from "../types";

export interface TerminateFSOptions {
  sessionId: string;
}

export interface TerminateFSResult {
  sessionId: string;
  deletedNodes: number;
  deletedFileVersions: number;
  deletedHistoryEntries: number;
  deletedSession: boolean;
  databaseClosed: boolean;
}

function getFileNodeVersionHashes(fileNode: FileNode): string[] {
  return [fileNode.currentVersionHash, fileNode.originalVersionHash].filter(
    (hash): hash is string => Boolean(hash),
  );
}

function entryReferencesHash(entry: HistoryEntry, hash: string): boolean {
  switch (entry.type) {
    case "FILE_CREATED":
    case "FILE_DELETED":
      return getFileNodeVersionHashes(entry.payload.node).includes(hash);
    case "FILE_UPDATED":
      return (
        entry.payload.previousVersionHash === hash ||
        entry.payload.nextVersionHash === hash
      );
    case "FILE_RESTORED":
      return (
        entry.payload.previousVersionHash === hash ||
        entry.payload.restoredVersionHash === hash
      );
    case "FOLDER_DELETED":
      return entry.payload.nodes.some(
        (node) =>
          node.kind === "file" && getFileNodeVersionHashes(node).includes(hash),
      );
    default:
      return false;
  }
}

async function terminateSessionRecords(
  sessionId: string,
  database: IdbVfsDatabase,
): Promise<Omit<TerminateFSResult, "databaseClosed">> {
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
          deletedSession: false,
        };
      }

      const allNodes = await database.nodes.toArray();
      const allHistoryEntries = await database.history.toArray();
      const allFileVersions = await database.fileVersions.toArray();

      const sessionNodes = allNodes.filter((node) => node.sessionId === sessionId);
      const sessionFileIds = sessionNodes
        .filter((node): node is FileNode => node.kind === "file")
        .map((node) => node.id);
      const sessionHistoryEntries = allHistoryEntries.filter(
        (entry) => entry.sessionId === sessionId,
      );
      const remainingNodes = allNodes.filter((node) => node.sessionId !== sessionId);
      const remainingHistoryEntries = allHistoryEntries.filter(
        (entry) => entry.sessionId !== sessionId,
      );

      const candidateVersions = allFileVersions.filter((version) =>
        sessionFileIds.includes(version.fileId),
      );

      const remainingReferencedHashes = new Set<string>();

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
        if (entry.id !== undefined) {
          await database.history.delete(entry.id);
        }
      }

      await database.sessionMeta.delete(sessionId);

      return {
        sessionId,
        deletedNodes: sessionNodes.length,
        deletedFileVersions,
        deletedHistoryEntries: sessionHistoryEntries.length,
        deletedSession: true,
      };
    },
  );
}

export async function terminateFS(
  options: TerminateFSOptions,
): Promise<TerminateFSResult> {
  const result = await terminateSessionRecords(options.sessionId, db);
  const remainingSessions = await db.sessionMeta.toArray();
  const databaseClosed = remainingSessions.length === 0;

  if (databaseClosed) {
    db.close();
  }

  return {
    ...result,
    databaseClosed,
  };
}

export async function terminateFSClient(
  options: TerminateFSOptions,
  database: IdbVfsDatabase,
): Promise<TerminateFSResult> {
  const result = await terminateSessionRecords(options.sessionId, database);
  const remainingSessions = await database.sessionMeta.toArray();
  const databaseClosed = remainingSessions.length === 0;

  if (databaseClosed) {
    database.close();
  }

  return {
    ...result,
    databaseClosed,
  };
}
