import { buildApp } from "./app.js";
import { getHubConfig } from "./config.js";

const config = getHubConfig();
const port = config.server.port;
const host = config.server.host;

const app = await buildApp({ logger: true });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
