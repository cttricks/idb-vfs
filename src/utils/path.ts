export interface ParsedPath {
  path: string;
  segments: string[];
  name: string;
  parentSegments: string[];
}

export function parseAbsolutePath(path: string): ParsedPath {
  const normalizedPath = path.trim();

  if (!normalizedPath.startsWith("/")) {
    throw new Error("Path must start with '/'.");
  }

  const segments = normalizedPath.split("/").filter(Boolean);

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
