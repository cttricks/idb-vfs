import { type IdbVfsDatabase } from "../core";
import type { HistoryEntry, SessionMeta } from "../types";
import { SessionNotFoundError } from "./errors";

export type HistoryEntryInput = HistoryEntry;

async function getSessionMetaOrThrow(
  database: IdbVfsDatabase,
  sessionId: string,
): Promise<SessionMeta> {
  const session = await database.sessionMeta.get(sessionId);

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  return session;
}

export async function getSessionHistoryEntries(
  database: IdbVfsDatabase,
  sessionId: string,
): Promise<HistoryEntry[]> {
  const entries = await database.history.toArray();

  return entries
    .filter((entry) => entry.sessionId === sessionId)
    .sort((left, right) => (left.id ?? 0) - (right.id ?? 0));
}

export async function updateSessionHistoryPointer(
  database: IdbVfsDatabase,
  sessionId: string,
  historyPointer: number | null,
): Promise<SessionMeta> {
  const session = await getSessionMetaOrThrow(database, sessionId);
  const updatedSession: SessionMeta = {
    ...session,
    historyPointer,
    updatedAt: Date.now(),
  };

  await database.sessionMeta.put(updatedSession);

  return updatedSession;
}

export async function recordHistoryEntry<TEntry extends HistoryEntryInput>(
  database: IdbVfsDatabase,
  entry: TEntry,
): Promise<TEntry & { id: number }> {
  const session = await getSessionMetaOrThrow(database, entry.sessionId);
  const entries = await getSessionHistoryEntries(database, entry.sessionId);

  for (const existingEntry of entries) {
    if (
      existingEntry.id !== undefined &&
      session.historyPointer !== null &&
      existingEntry.id > session.historyPointer
    ) {
      await database.history.delete(existingEntry.id);
    }
  }

  const nextId = await database.history.add(entry);
  const storedEntry = {
    ...entry,
    id: nextId,
  };

  await updateSessionHistoryPointer(database, entry.sessionId, nextId);

  return storedEntry;
}
