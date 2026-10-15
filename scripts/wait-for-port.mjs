// Waits until a TCP port accepts connections. Used in CI before running the tests.
import net from 'node:net';

const [host = 'localhost', port = '5432'] = process.argv.slice(2);
const TIMEOUT_MS = 30_000;
const RETRY_EVERY_MS = 1_000;

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.connect(Number(port), host);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

const deadline = Date.now() + TIMEOUT_MS;
while (!(await canConnect())) {
  if (Date.now() > deadline) {
    console.error(`${host}:${port} is not reachable after ${TIMEOUT_MS / 1000}s`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
}
console.log(`${host}:${port} is ready`);