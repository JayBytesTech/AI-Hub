# Tools Runner

Rust JSON-RPC runner for local tool execution over stdio.

## Run

```bash
cargo run --manifest-path crates/tools-runner/Cargo.toml
```

Optional env var:
- `WORKSPACE_ROOT` (default: current working directory)
- `SHELL_CONFIRM_REQUIRED` (default: `true`)

## Protocol

Input: newline-delimited JSON-RPC request objects.

Example request:

```json
{"id":"1","method":"tool.call","params":{"tool":"fs.read","args":{"path":"README.md"}}}
```

Example response:

```json
{"id":"1","result":{"success":true,"data":{"path":"README.md","content":"..."}}}
```

## Implemented tools

- `fs.read` - read UTF-8 file content
- `fs.list` - list directory entries
- `fs.stat` - return file/directory metadata
- `search.ripgrep` - search text using `rg --json`
- `shell.run` - execute PowerShell command in `WORKSPACE_ROOT`
  - Requires `args.confirm=true` unless `SHELL_CONFIRM_REQUIRED=false`

All filesystem paths are resolved and constrained under `WORKSPACE_ROOT`.
