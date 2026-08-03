import { spawn } from "node:child_process";
import path from "node:path";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/run-next.mjs <dev|build|start> [...args]");
  process.exit(1);
}

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextArgs = [command, ...args];

if (process.platform === "win32" && (command === "dev" || command === "build") && !args.includes("--webpack")) {
  nextArgs.splice(1, 0, "--webpack");
}

const child = spawn(process.execPath, [nextBin, ...nextArgs], { stdio: "inherit" });

child.on("error", (error) => {
  console.error(`Failed to start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
