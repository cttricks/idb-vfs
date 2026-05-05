import Dexie, { type Table } from "dexie";

const DATABASE_NAME = "idb-vfs";
const DATABASE_VERSION = 1;

export interface NodeRecord {
  id: string;
  sessionId: string;
  parentId: string | null;
  name: string;
  kind: "file" | "folder";
  createdAt: number;
  updatedAt: number;
  versionHash?: string;
}

export interface FileVersionRecord {
  hash: string;
  fileId: string;
  content: string;
  createdAt: number;
}

export interface HistoryRecord {
  id?: number;
  sessionId: string;
  operation: string;
  timestamp: number;
  payload: unknown;
}

export interface SessionMetaRecord {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}

export class IdbVfsDatabase extends Dexie {
  nodes!: Table<NodeRecord, NodeRecord["id"]>;
  fileVersions!: Table<FileVersionRecord, FileVersionRecord["hash"]>;
  history!: Table<HistoryRecord, number>;
  sessionMeta!: Table<SessionMetaRecord, SessionMetaRecord["sessionId"]>;

  constructor() {
    super(DATABASE_NAME);

    this.version(DATABASE_VERSION).stores({
      nodes: "id, [sessionId+parentId]",
      fileVersions: "hash, fileId",
      history: "++id, timestamp",
      sessionMeta: "sessionId",
    });
  }
}

export const db = new IdbVfsDatabase();

export const DB_TABLES = ["nodes", "fileVersions", "history", "sessionMeta"] as const;
