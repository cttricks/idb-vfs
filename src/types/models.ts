export type NodeKind = "file" | "folder";

export interface BaseNode {
  id: string;
  sessionId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface FileNode extends BaseNode {
  kind: "file";
  currentVersionHash: string | null;
  originalVersionHash: string | null;
}

export interface FolderNode extends BaseNode {
  kind: "folder";
}

export type Node = FileNode | FolderNode;

export interface FileVersion {
  hash: string;
  fileId: string;
  content: string;
  createdAt: number;
}

interface HistoryEntryBase<TType extends string, TPayload> {
  id?: number;
  sessionId: string;
  timestamp: number;
  type: TType;
  payload: TPayload;
}

export type FileCreatedOperation = HistoryEntryBase<
  "FILE_CREATED",
  {
    fileId: string;
    parentId: string | null;
    name: string;
    versionHash: string | null;
  }
>;

export type FileUpdatedOperation = HistoryEntryBase<
  "FILE_UPDATED",
  {
    fileId: string;
    previousVersionHash: string | null;
    nextVersionHash: string;
  }
>;

export type FileDeletedOperation = HistoryEntryBase<
  "FILE_DELETED",
  {
    fileId: string;
    parentId: string | null;
    name: string;
    versionHash: string | null;
  }
>;

export type FileRestoredOperation = HistoryEntryBase<
  "FILE_RESTORED",
  {
    fileId: string;
    previousVersionHash: string | null;
    restoredVersionHash: string;
  }
>;

export type FolderCreatedOperation = HistoryEntryBase<
  "FOLDER_CREATED",
  {
    folderId: string;
    parentId: string | null;
    name: string;
  }
>;

export type FolderDeletedOperation = HistoryEntryBase<
  "FOLDER_DELETED",
  {
    folderId: string;
    parentId: string | null;
    name: string;
  }
>;

export type NodeRenamedOperation = HistoryEntryBase<
  "NODE_RENAMED",
  {
    nodeId: string;
    nodeKind: NodeKind;
    previousName: string;
    nextName: string;
  }
>;

export type NodeMovedOperation = HistoryEntryBase<
  "NODE_MOVED",
  {
    nodeId: string;
    nodeKind: NodeKind;
    previousParentId: string | null;
    nextParentId: string | null;
  }
>;

export type HistoryEntry =
  | FileCreatedOperation
  | FileUpdatedOperation
  | FileDeletedOperation
  | FileRestoredOperation
  | FolderCreatedOperation
  | FolderDeletedOperation
  | NodeRenamedOperation
  | NodeMovedOperation;

export interface SessionMeta {
  sessionId: string;
  rootNodeId: string | null;
  createdAt: number;
  updatedAt: number;
}
