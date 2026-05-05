import { createFS } from "../dist/index.mjs";

const elements = {
  sessionForm: document.querySelector("#sessionForm"),
  sessionId: document.querySelector("#sessionId"),
  rootNodeId: document.querySelector("#rootNodeId"),
  selectedTargetLabel: document.querySelector("#selectedTargetLabel"),
  status: document.querySelector("#status"),
  tree: document.querySelector("#tree"),
  history: document.querySelector("#history"),
  versions: document.querySelector("#versions"),
  versionsMeta: document.querySelector("#versionsMeta"),
  contentMeta: document.querySelector("#contentMeta"),
  contentView: document.querySelector("#contentView"),
  createFolderForm: document.querySelector("#createFolderForm"),
  createFileForm: document.querySelector("#createFileForm"),
  updateFileForm: document.querySelector("#updateFileForm"),
  renameFileForm: document.querySelector("#renameFileForm"),
  deleteFileForm: document.querySelector("#deleteFileForm"),
  renameFolderForm: document.querySelector("#renameFolderForm"),
  deleteFolderForm: document.querySelector("#deleteFolderForm"),
  moveForm: document.querySelector("#moveForm"),
  readVersionForm: document.querySelector("#readVersionForm"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  refreshButton: document.querySelector("#refreshButton"),
};

const state = {
  fs: null,
  selectedNodeId: null,
  selectedNodePath: "/",
  selectedNodeKind: "folder",
  unsubscribers: [],
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function clearSubscriptions() {
  for (const unsubscribe of state.unsubscribers) {
    unsubscribe();
  }
  state.unsubscribers = [];
}

function normalizeInputPath(path) {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function emptyState(message) {
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = message;
  return block;
}

async function resolveNode(path) {
  if (!state.fs) {
    throw new Error("Start a session first.");
  }
  return state.fs.resolvePath(normalizeInputPath(path));
}

async function resolveFile(path) {
  const node = await resolveNode(path);
  if (node.kind !== "file") {
    throw new Error(`Path "${path}" is not a file.`);
  }
  return node;
}

async function buildTree(nodeId, depth = 0, currentPath = "") {
  const children = await state.fs.listChildren(nodeId);
  const items = [];

  for (const child of children) {
    const childPath = currentPath ? `${currentPath}/${child.name}` : `/${child.name}`;
    items.push({ node: child, depth, path: childPath });

    if (child.kind === "folder") {
      items.push(...(await buildTree(child.id, depth + 1, childPath)));
    }
  }

  return items;
}

function selectNode(node, path) {
  state.selectedNodeId = node.id;
  state.selectedNodePath = path;
  state.selectedNodeKind = node.kind;
}

async function renderTree() {
  if (!state.fs) {
    elements.tree.replaceChildren(emptyState("Start a session to load the filesystem tree."));
    return;
  }

  const items = await buildTree(state.fs.rootNodeId);
  elements.tree.replaceChildren();

  if (items.length === 0) {
    elements.tree.append(emptyState("The root folder is ready. Create files or folders to begin."));
    return;
  }

  for (const { node, depth, path } of items) {
    const item = document.createElement("div");
    item.className = "tree-item";

    const row = document.createElement("div");
    row.className = "tree-row";

    const label = document.createElement("button");
    label.type = "button";
    label.className = "tree-label";
    label.addEventListener("click", async () => {
      selectNode(node, path);
      await renderSelection();
    });

    const indent = document.createElement("span");
    indent.className = "tree-indent";
    indent.style.marginLeft = `${depth * 14}px`;

    const tag = document.createElement("span");
    tag.className = `tree-tag ${node.kind === "file" ? "file" : ""}`;
    tag.textContent = node.kind;

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;

    const pathText = document.createElement("span");
    pathText.className = "tree-path";
    pathText.textContent = path;

    label.append(indent, tag, name, pathText);
    row.append(label);
    item.append(row);
    elements.tree.append(item);
  }
}

async function renderHistory() {
  if (!state.fs) {
    elements.history.replaceChildren(emptyState("History will appear after the session starts."));
    return;
  }

  const entries = await state.fs.getHistory();
  elements.history.replaceChildren();

  if (entries.length === 0) {
    elements.history.append(emptyState("No history entries yet."));
    return;
  }

  for (const entry of [...entries].reverse()) {
    const item = document.createElement("div");
    item.className = "history-item";

    const title = document.createElement("strong");
    title.textContent = entry.type;

    const meta = document.createElement("div");
    meta.className = "panel-meta";
    meta.textContent = `#${entry.id ?? "-"} · ${new Date(entry.timestamp).toLocaleTimeString()}`;

    const payload = document.createElement("pre");
    payload.textContent = JSON.stringify(entry.payload, null, 2);

    item.append(title, meta, payload);
    elements.history.append(item);
  }
}

async function renderVersions() {
  if (!state.fs || !state.selectedNodeId || state.selectedNodeKind !== "file") {
    elements.versionsMeta.textContent = "No file selected";
    elements.versions.replaceChildren(emptyState("Select a file from the tree to inspect versions."));
    return;
  }

  elements.versionsMeta.textContent = state.selectedNodePath;
  const versions = await state.fs.listFileVersions(state.selectedNodeId);
  elements.versions.replaceChildren();

  if (versions.length === 0) {
    elements.versions.append(emptyState("No versions found for this file."));
    return;
  }

  for (const version of versions) {
    const item = document.createElement("div");
    item.className = "version-item";

    const meta = document.createElement("div");
    meta.innerHTML = `
      <strong>${version.hash.slice(0, 18)}...</strong>
      <div class="panel-meta">${new Date(version.createdAt).toLocaleString()}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "version-actions";

    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "button-secondary";
    readButton.textContent = "Read";
    readButton.addEventListener("click", async () => {
      document.querySelector("#versionHash").value = version.hash;
      await renderContent(version.hash);
      setStatus(`Loaded version ${version.hash.slice(0, 12)}...`);
    });

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore";
    restoreButton.addEventListener("click", async () => {
      await state.fs.restoreVersion(state.selectedNodeId, version.hash);
      await refreshAll(`Restored version ${version.hash.slice(0, 12)}...`);
    });

    actions.append(readButton, restoreButton);
    item.append(meta, actions);
    elements.versions.append(item);
  }
}

async function renderContent(versionHash) {
  if (!state.fs || !state.selectedNodeId) {
    elements.contentMeta.textContent = "No file selected";
    elements.contentView.value = "";
    elements.contentView.placeholder = "Click a file in the tree to inspect its content.";
    return;
  }

  elements.selectedTargetLabel.textContent = state.selectedNodePath;

  if (state.selectedNodeKind !== "file") {
    elements.contentMeta.textContent = `${state.selectedNodePath} · folder`;
    elements.contentView.value = "";
    elements.contentView.placeholder = "Folders do not have file content. Select a file from the tree.";
    return;
  }

  elements.contentMeta.textContent = `${state.selectedNodePath} · file`;
  const content = await state.fs.readFile(state.selectedNodeId, versionHash);
  elements.contentView.value = content;
}

async function renderSelection() {
  if (!state.selectedNodeId) {
    elements.selectedTargetLabel.textContent = "/";
    elements.contentMeta.textContent = "No file selected";
    elements.contentView.value = "";
    elements.contentView.placeholder = "Click a file in the tree to inspect its content.";
    await renderVersions();
    return;
  }

  await renderContent();
  await renderVersions();
}

async function refreshAll(message = "") {
  await renderTree();
  await renderHistory();
  await renderSelection();

  if (message) {
    setStatus(message, false);
  }
}

async function startSession() {
  clearSubscriptions();
  state.selectedNodeId = null;
  state.selectedNodePath = "/";
  state.selectedNodeKind = "folder";
  state.fs = await createFS({ sessionId: elements.sessionId.value.trim() });
  elements.rootNodeId.textContent = state.fs.rootNodeId;

  const refreshFromEvent = async (event) => {
    await refreshAll(`Event: ${event.type}`);
  };

  for (const eventType of [
    "FILE_CREATED",
    "FILE_UPDATED",
    "FILE_DELETED",
    "FILE_RENAMED",
    "FILE_MOVED",
    "FOLDER_CREATED",
    "FOLDER_DELETED",
    "FOLDER_MOVED",
  ]) {
    state.unsubscribers.push(state.fs.on(eventType, refreshFromEvent));
  }

  await refreshAll(`Session "${state.fs.sessionId}" ready.`);
}

async function submitHandler(run) {
  try {
    await run();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

elements.sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(startSession);
});

elements.createFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#folderPath").value);
    await state.fs.createFolder(path);
    await refreshAll(`Created folder ${path}`);
  });
});

elements.createFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#createFilePath").value);
    const content = document.querySelector("#createFileContent").value;
    const file = await state.fs.createFile(path, content);
    selectNode(file, path);
    await refreshAll(`Created file ${path}`);
  });
});

elements.updateFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#updateFilePath").value);
    const content = document.querySelector("#updateFileContent").value;
    const file = await resolveFile(path);
    selectNode(file, path);
    await state.fs.updateFile(file.id, content);
    await refreshAll(`Updated file ${path}`);
  });
});

elements.renameFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#renameFilePath").value);
    const nextName = document.querySelector("#renameFileName").value.trim();
    const file = await resolveFile(path);
    await state.fs.rename(file.id, nextName);

    if (state.selectedNodeId === file.id) {
      const segments = path.split("/");
      segments[segments.length - 1] = nextName;
      state.selectedNodePath = segments.join("/") || "/";
      state.selectedNodeKind = "file";
    }

    await refreshAll(`Renamed file ${path} to ${nextName}`);
  });
});

elements.deleteFileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#deleteFilePath").value);
    const file = await resolveFile(path);
    await state.fs.deleteFile(file.id);

    if (state.selectedNodeId === file.id) {
      state.selectedNodeId = null;
      state.selectedNodePath = "/";
      state.selectedNodeKind = "folder";
    }

    await refreshAll(`Deleted file ${path}`);
  });
});

elements.renameFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#renameFolderPath").value);
    const nextName = document.querySelector("#renameFolderName").value.trim();
    const folder = await resolveNode(path);

    if (folder.kind !== "folder") {
      throw new Error(`Path "${path}" is not a folder.`);
    }

    await state.fs.rename(folder.id, nextName);

    if (state.selectedNodePath.startsWith(`${path}/`) || state.selectedNodePath === path) {
      const basePath = path.split("/").slice(0, -1).join("/") || "";
      const renamedPath = `${basePath}/${nextName}`.replace("//", "/");
      state.selectedNodePath = state.selectedNodePath === path
        ? renamedPath
        : state.selectedNodePath.replace(`${path}/`, `${renamedPath}/`);
    }

    await refreshAll(`Renamed folder ${path} to ${nextName}`);
  });
});

elements.deleteFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#deleteFolderPath").value);
    const folder = await resolveNode(path);

    if (folder.kind !== "folder") {
      throw new Error(`Path "${path}" is not a folder.`);
    }

    await state.fs.deleteFolder(folder.id);

    if (state.selectedNodePath === path || state.selectedNodePath.startsWith(`${path}/`)) {
      state.selectedNodeId = null;
      state.selectedNodePath = "/";
      state.selectedNodeKind = "folder";
    }

    await refreshAll(`Deleted folder tree ${path}`);
  });
});

elements.moveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const sourcePath = normalizeInputPath(document.querySelector("#moveSourcePath").value);
    const targetPath = normalizeInputPath(document.querySelector("#moveTargetPath").value);
    const sourceNode = await resolveNode(sourcePath);
    const targetNode = await resolveNode(targetPath);

    if (targetNode.kind !== "folder") {
      throw new Error(`Target path "${targetPath}" is not a folder.`);
    }

    await state.fs.move(sourceNode.id, targetNode.id);

    if (state.selectedNodeId === sourceNode.id || state.selectedNodePath.startsWith(`${sourcePath}/`)) {
      const movedPath = `${targetPath}/${sourceNode.name}`.replace("//", "/");
      state.selectedNodePath = state.selectedNodePath === sourcePath
        ? movedPath
        : state.selectedNodePath.replace(`${sourcePath}/`, `${movedPath}/`);
    }

    await refreshAll(`Moved ${sourcePath} into ${targetPath}`);
  });
});

elements.readVersionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHandler(async () => {
    const path = normalizeInputPath(document.querySelector("#versionFilePath").value);
    const versionHash = document.querySelector("#versionHash").value.trim();
    const file = await resolveFile(path);
    selectNode(file, path);
    await renderContent(versionHash || undefined);
    await renderVersions();
    setStatus(
      versionHash
        ? `Loaded version ${versionHash.slice(0, 12)}...`
        : `Loaded latest content for ${path}`,
    );
  });
});

elements.undoButton.addEventListener("click", () => {
  submitHandler(async () => {
    await state.fs.undo();
    await refreshAll("Undo applied.");
  });
});

elements.redoButton.addEventListener("click", () => {
  submitHandler(async () => {
    await state.fs.redo();
    await refreshAll("Redo applied.");
  });
});

elements.refreshButton.addEventListener("click", () => {
  submitHandler(async () => {
    await refreshAll("Views refreshed.");
  });
});

startSession().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
