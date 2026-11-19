import os from "node:os";
import { loadConfig } from "./config.js";
import { createServer } from "./app.js";

const config = loadConfig();
const { server, close } = createServer(config);

server.listen(config.port, config.host, () => {
  const scheme = config.httpsKey ? "https" : "http";
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `${scheme}://${i.address}:${config.port}`);
  console.log(`\n  🫧 BubbleUp is up!  (${config.env})\n`);
  console.log(`  Local:    ${scheme}://localhost:${config.port}`);
  for (const url of lan) console.log(`  Network:  ${url}   ← share this with your class`);
  console.log(`  Data:     ${config.dataDir}\n`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, closing BubbleUp…`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref();
  try {
    await close();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
