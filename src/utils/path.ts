export interface ParsedPath {
  path: string;
  segments: string[];
  name: string;
  parentSegments: string[];
}

export function normalizeAbsolutePath(path: string): string {
  const normalizedPath = path.trim();

  if (!normalizedPath.startsWith("/")) {
    throw new Error("Path must start with '/'.");
  }

  return normalizedPath;
}

export function getPathSegments(path: string): string[] {
  return normalizeAbsolutePath(path).split("/").filter(Boolean);
}

export function parseAbsolutePath(path: string): ParsedPath {
  const normalizedPath = normalizeAbsolutePath(path);

  const segments = getPathSegments(normalizedPath);

  if (segments.length === 0) {
    throw new Error("Path must target a file name.");
  }

  return {
    path: normalizedPath,
    segments,
    name: segments[segments.length - 1]!,
    parentSegments: segments.slice(0, -1),
  };
}
