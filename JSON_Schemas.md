
# JSON Schemas

## Tool Request
{
  "tool": "string",
  "args": {}
}

## Tool Response
{
  "success": true,
  "result": {}
}

## WebSocket Event

{
  "type": "chat.stream.delta",
  "runId": "string",
  "content": "token"
}
