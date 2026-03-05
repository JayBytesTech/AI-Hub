
# Tool RPC Protocol Spec

Communication: JSON-RPC over stdio

## Request

{
  "id": "uuid",
  "method": "tool.call",
  "params": {
      "tool": "fs.read",
      "args": {
          "path": "src/index.ts"
      }
  }
}

## Response

{
  "id": "uuid",
  "result": {
      "success": true,
      "data": "...file contents..."
  }
}

## Supported Tools

fs.read
fs.write
fs.list
fs.stat

search.ripgrep

shell.run

git.status
git.diff
