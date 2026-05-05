import { db, type IdbVfsDatabase } from "../core";
import type { FolderNode, SessionMeta } from "../types";
import { createId } from "../utils";
import { InvalidSessionIdError, SessionIntegrityError } from "./errors";

const ROOT_NODE_NAME = "/";

export interface CreateSessionResult {
  session: SessionMeta;
  rootNode: FolderNode;
}

function createRootNode(sessionId: string, timestamp: number): FolderNode {
  return {
    id: createId(`root:${sessionId}`),
    sessionId,
    parentId: null,
    name: ROOT_NODE_NAME,
    kind: "folder",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function createSession(
  sessionId: string,
  database: IdbVfsDatabase = db,
): Promise<CreateSessionResult> {
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
        const existingRootNode = existingSession.rootNodeId
          ? await database.nodes.get(existingSession.rootNodeId)
          : undefined;

        if (!existingRootNode || existingRootNode.kind !== "folder") {
          throw new SessionIntegrityError(normalizedSessionId);
        }

        return {
          session: existingSession,
          rootNode: existingRootNode,
        };
      }

      const timestamp = Date.now();
      const rootNode = createRootNode(normalizedSessionId, timestamp);
      const session: SessionMeta = {
        sessionId: normalizedSessionId,
        rootNodeId: rootNode.id,
        historyPointer: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await database.nodes.add(rootNode);
      await database.sessionMeta.add(session);

      return {
        session,
        rootNode,
      };
    },
  );
}
