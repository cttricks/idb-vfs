import { off, on, type VfsEventHandler, type VfsEventType } from "../events";
import type { IdbVfsDatabase } from "../core";
import {
  createFile,
  createFolder,
  deleteFolder,
  listChildren,
  move,
  readFile,
  redo,
  rename,
  resolvePath,
  restoreVersion,
  undo,
  updateFile,
} from "../services";
import { createSession } from "../session";

export interface CreateFSOptions {
  sessionId: string;
}

export interface VersionedFileSystem {
  sessionId: string;
  rootNodeId: string;
  createFile(path: string, content: string): ReturnType<typeof createFile>;
  readFile(fileId: string, versionHash?: string): ReturnType<typeof readFile>;
  updateFile(fileId: string, content: string): ReturnType<typeof updateFile>;
  createFolder(path: string): ReturnType<typeof createFolder>;
  deleteFolder(folderId: string): ReturnType<typeof deleteFolder>;
  rename(nodeId: string, nextName: string): ReturnType<typeof rename>;
  move(nodeId: string, targetFolderId: string): ReturnType<typeof move>;
  listChildren(folderId: string): ReturnType<typeof listChildren>;
  resolvePath(path: string): ReturnType<typeof resolvePath>;
  undo(): ReturnType<typeof undo>;
  redo(): ReturnType<typeof redo>;
  restoreVersion(fileId: string, versionHash: string): ReturnType<typeof restoreVersion>;
  on<TType extends VfsEventType>(
    eventType: TType,
    handler: VfsEventHandler<TType>,
  ): () => void;
  off<TType extends VfsEventType>(
    eventType: TType,
    handler: VfsEventHandler<TType>,
  ): void;
}

function createSessionBoundFS(
  sessionId: string,
  rootNodeId: string,
  database?: IdbVfsDatabase,
): VersionedFileSystem {
  return {
    sessionId,
    rootNodeId,
    createFile: (path, content) => createFile(sessionId, path, content, database),
    readFile: (fileId, versionHash) => readFile(fileId, versionHash, database),
    updateFile: (fileId, content) => updateFile(fileId, content, database),
    createFolder: (path) => createFolder(sessionId, path, database),
    deleteFolder: (folderId) => deleteFolder(folderId, database),
    rename: (nodeId, nextName) => rename(nodeId, nextName, database),
    move: (nodeId, targetFolderId) => move(nodeId, targetFolderId, database),
    listChildren: (folderId) => listChildren(folderId, database),
    resolvePath: (path) => resolvePath(sessionId, path, database),
    undo: () => undo(sessionId, database),
    redo: () => redo(sessionId, database),
    restoreVersion: (fileId, versionHash) => restoreVersion(fileId, versionHash, database),
    on: (eventType, handler) => {
      on(eventType, handler);
      return () => off(eventType, handler);
    },
    off: (eventType, handler) => {
      off(eventType, handler);
    },
  };
}

export async function createFS(
  options: CreateFSOptions,
): Promise<VersionedFileSystem> {
  const { session, rootNode } = await createSession(options.sessionId);

  return createSessionBoundFS(session.sessionId, rootNode.id);
}

export async function createFSClient(
  options: CreateFSOptions,
  database: IdbVfsDatabase,
): Promise<VersionedFileSystem> {
  const { session, rootNode } = await createSession(options.sessionId, database);

  return createSessionBoundFS(session.sessionId, rootNode.id, database);
}
