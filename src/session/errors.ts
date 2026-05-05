export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class InvalidSessionIdError extends SessionError {
  constructor() {
    super("Session id must be a non-empty string.");
    this.name = "InvalidSessionIdError";
  }
}

export class SessionIntegrityError extends SessionError {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" is missing a valid root folder node.`);
    this.name = "SessionIntegrityError";
  }
}
