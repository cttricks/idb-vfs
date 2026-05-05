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
