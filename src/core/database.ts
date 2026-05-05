import Dexie, { type Table } from "dexie";
import type {
  FileVersion,
  HistoryEntry,
  Node as VfsNode,
  SessionMeta,
} from "../types";

const DATABASE_NAME = "idb-vfs";
const DATABASE_VERSION = 1;

export type NodeRecord = VfsNode;

export type FileVersionRecord = FileVersion;

export type HistoryRecord = HistoryEntry;

export type SessionMetaRecord = SessionMeta;

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
