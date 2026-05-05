import type { FileNode, FolderNode } from "../types";

export const VFS_EVENT_TYPES = [
  "FILE_CREATED",
  "FILE_UPDATED",
  "FILE_DELETED",
  "FILE_RENAMED",
  "FILE_MOVED",
  "FOLDER_CREATED",
  "FOLDER_DELETED",
  "FOLDER_MOVED",
] as const;

export type VfsEventType = (typeof VFS_EVENT_TYPES)[number];

export interface VfsEventPayloadMap {
  FILE_CREATED: {
    file: FileNode;
  };
  FILE_UPDATED: {
    file: FileNode;
    previousVersionHash: string | null;
    currentVersionHash: string | null;
  };
  FILE_DELETED: {
    file: FileNode;
  };
  FILE_RENAMED: {
    file: FileNode;
    previousName: string;
    currentName: string;
  };
  FILE_MOVED: {
    file: FileNode;
    previousParentId: string | null;
    currentParentId: string | null;
  };
  FOLDER_CREATED: {
    folder: FolderNode;
  };
  FOLDER_DELETED: {
    folder: FolderNode;
    deletedNodeIds: string[];
  };
  FOLDER_MOVED: {
    folder: FolderNode;
    previousParentId: string | null;
    currentParentId: string | null;
  };
}

export type VfsEventDetail<TType extends VfsEventType> = VfsEventPayloadMap[TType];
export type VfsEvent<TType extends VfsEventType> = CustomEvent<VfsEventDetail<TType>>;
export type VfsEventHandler<TType extends VfsEventType> = (event: VfsEvent<TType>) => void;

const eventTarget = new EventTarget();

export function on<TType extends VfsEventType>(
  eventType: TType,
  handler: VfsEventHandler<TType>,
): void {
  eventTarget.addEventListener(eventType, handler as EventListener);
}

export function off<TType extends VfsEventType>(
  eventType: TType,
  handler: VfsEventHandler<TType>,
): void {
  eventTarget.removeEventListener(eventType, handler as EventListener);
}

export function emit<TType extends VfsEventType>(
  eventType: TType,
  payload: VfsEventDetail<TType>,
): VfsEvent<TType> {
  const event = new CustomEvent(eventType, {
    detail: payload,
  }) as VfsEvent<TType>;

  eventTarget.dispatchEvent(event);

  return event;
}

export function getEventTarget(): EventTarget {
  return eventTarget;
}
