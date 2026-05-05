export class FileServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileServiceError";
  }
}

export class InvalidFilePathError extends FileServiceError {
  constructor(path: string) {
    super(`Invalid file path "${path}".`);
    this.name = "InvalidFilePathError";
  }
}

export class NodeNotFoundError extends FileServiceError {
  constructor(nodeId: string) {
    super(`Node "${nodeId}" was not found.`);
    this.name = "NodeNotFoundError";
  }
}

export class ParentFolderNotFoundError extends FileServiceError {
  constructor(path: string) {
    super(`Parent folder for path "${path}" was not found.`);
    this.name = "ParentFolderNotFoundError";
  }
}

export class NotAFolderError extends FileServiceError {
  constructor(nodeId: string) {
    super(`Node "${nodeId}" is not a folder.`);
    this.name = "NotAFolderError";
  }
}

export class NotAFileError extends FileServiceError {
  constructor(nodeId: string) {
    super(`Node "${nodeId}" is not a file.`);
    this.name = "NotAFileError";
  }
}

export class DuplicateNodeNameError extends FileServiceError {
  constructor(name: string, parentId: string | null) {
    super(`A node named "${name}" already exists under parent "${parentId ?? "root"}".`);
    this.name = "DuplicateNodeNameError";
  }
}

export class FileVersionNotFoundError extends FileServiceError {
  constructor(hash: string) {
    super(`File version "${hash}" was not found.`);
    this.name = "FileVersionNotFoundError";
  }
}

export class InvalidNodeNameError extends FileServiceError {
  constructor(name: string) {
    super(`Invalid node name "${name}".`);
    this.name = "InvalidNodeNameError";
  }
}

export class RootNodeMutationError extends FileServiceError {
  constructor(operation: string) {
    super(`Cannot ${operation} the root folder node.`);
    this.name = "RootNodeMutationError";
  }
}

export class SessionMismatchError extends FileServiceError {
  constructor(nodeId: string, targetFolderId: string) {
    super(`Node "${nodeId}" cannot be moved into folder "${targetFolderId}" from a different session.`);
    this.name = "SessionMismatchError";
  }
}

export class TreeCycleError extends FileServiceError {
  constructor(nodeId: string, targetFolderId: string) {
    super(`Moving node "${nodeId}" into folder "${targetFolderId}" would create a cycle.`);
    this.name = "TreeCycleError";
  }
}

export class SessionNotFoundError extends FileServiceError {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" was not found.`);
    this.name = "SessionNotFoundError";
  }
}
