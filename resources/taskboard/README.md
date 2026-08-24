# Bundled Taskboard Server

Vendored copy of the [wesight-taskboard](https://github.com/yan-6/wesight-taskboard)
server (`server/`) and web UI (`public/`), so the WeSight taskboard view works
out of the box without installing the plugin separately.

- Zero npm dependencies: uses only `node:http` and `node:sqlite` (requires the
  Node 22+ runtime embedded in Electron; launched via `ELECTRON_RUN_AS_NODE=1`).
- Started by `src/main/taskboardServer.ts` on app launch, unless an external
  instance already answers on port 47824.
- Data lives in `userData/taskboard/` (override with `TASKBOARD_DATA_DIR`);
  the plugin's `.data/` directory is intentionally not included here.

When updating, sync `server/` and `public/` from the plugin repo and bump the
version note below.

Synced from wesight-taskboard v0.2.0 (2026-08-24).
