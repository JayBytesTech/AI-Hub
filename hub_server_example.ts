
// Example Fastify Hub Server (TypeScript)

import Fastify from 'fastify'

const server = Fastify()

server.get('/health', async () => {
  return { status: 'ok' }
})

server.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log("Hub running on port 3000")
})
