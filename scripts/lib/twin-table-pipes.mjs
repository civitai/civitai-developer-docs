// STUB: the interface of the post-build pass that restores `\|` escapes in twin
// table rows. It changes nothing yet, so scripts/test-twin-table-pipes.mjs must
// fail against it; the implementation lands in the next commit.

export function dropPipeEscapes(line) {
  return line;
}

export function escapedRows() {
  return new Map();
}

export function restoreTablePipes(twinText) {
  return { text: twinText, restored: 0, missed: [] };
}

export function restoreTwinTablePipes() {
  return { twins: 0, sections: 0, rowsRestored: 0, filesChanged: 0 };
}
