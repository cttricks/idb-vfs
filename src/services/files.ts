import { db, type IdbVfsDatabase, type NodeRecord } from "../core";
import { createSession } from "../session";
import type { FileNode, FileVersion } from "../types";
import { createContentHash, createId, parseAbsolutePath } from "../utils";
import {
  DuplicateNodeNameError,
  FileVersionNotFoundError,
  InvalidFilePathError,
  NotAFileError,
} from "./errors";
import { findChildByName, getNode, resolveFolderPath } from "./nodes";

async function getFileNode(
  database: IdbVfsDatabase,
  fileId: string,
): Promise<FileNode> {
  const node = await getNode(database, fileId);

  if (node.kind !== "file") {
    throw new NotAFileError(fileId);
  }

  return node;
}

async function ensureFileVersion(
  database: IdbVfsDatabase,
  fileId: string,
  content: string,
  timestamp: number,
): Promise<FileVersion> {
  const hash = await createContentHash(content);
  const existingVersion = await database.fileVersions.get(hash);

  if (existingVersion) {
    return existingVersion;
  }

  const version: FileVersion = {
    hash,
    fileId,
    content,
    createdAt: timestamp,
  };

  await database.fileVersions.add(version);

  return version;
}

export async function createFile(
  sessionId: string,
  path: string,
  content: string,
  database: IdbVfsDatabase = db,
): Promise<FileNode> {
  let parsedPath;

  try {
    parsedPath = parseAbsolutePath(path);
  } catch {
    throw new InvalidFilePathError(path);
  }

  const { rootNode } = await createSession(sessionId, database);

  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
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
      const fileId = createId(`file:${rootNode.sessionId}`);
      const version = await ensureFileVersion(database, fileId, content, timestamp);
      const fileNode: FileNode = {
        id: fileId,
        sessionId: rootNode.sessionId,
        parentId: parentFolder.id,
        name: parsedPath.name,
        kind: "file",
        currentVersionHash: version.hash,
        originalVersionHash: version.hash,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await database.nodes.add(fileNode);

      return fileNode;
    },
  );
}

export async function readFile(
  fileId: string,
  versionHash?: string,
  database: IdbVfsDatabase = db,
): Promise<string> {
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
    },
  );
}

export async function updateFile(
  fileId: string,
  content: string,
  database: IdbVfsDatabase = db,
): Promise<FileNode> {
  return database.transaction(
    "rw",
    database.nodes,
    database.fileVersions,
    async () => {
      const fileNode = await getFileNode(database, fileId);
      const timestamp = Date.now();
      const version = await ensureFileVersion(database, fileId, content, timestamp);

      if (fileNode.currentVersionHash === version.hash) {
        return fileNode;
      }

      const updatedFileNode: FileNode = {
        ...fileNode,
        currentVersionHash: version.hash,
        updatedAt: timestamp,
      };

      await database.nodes.put(updatedFileNode);

      return updatedFileNode;
    },
  );
}

export async function getFileVersion(
  fileId: string,
  versionHash: string,
  database: IdbVfsDatabase = db,
): Promise<FileVersion> {
  return database.transaction(
    "r",
    database.nodes,
    database.fileVersions,
    async () => {
      await getFileNode(database, fileId);

      const version = await database.fileVersions.get(versionHash);

      if (!version) {
        throw new FileVersionNotFoundError(versionHash);
      }

      return version;
    },
  );
}
