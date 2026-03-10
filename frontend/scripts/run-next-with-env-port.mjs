import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const command = process.argv[2] || "dev";
const envKey = process.argv[3] || "NEXT_PUBLIC_AUTH_APP_URL";
const explicitPort = String(process.argv[4] || process.env.PORT || "").trim();
const defaultPort = String(process.env.DEFAULT_PORT || "3000").trim();

const rootDir = process.cwd();
const envFiles = [".env"];

const readEnvValue = (key) => {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim().replace(/^['"]|['"]$/g, "");
  }

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
};

const rawUrl = readEnvValue(envKey);
let port = explicitPort;

if (!port && rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.port) port = parsed.port;
  } catch {
    // Handled by validation below.
  }
}

const isValidPort = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 65535;
};

if (!port) {
  port = defaultPort;
}

if (!isValidPort(port)) {
  console.error(`[run-next-with-env-port] Invalid port: "${port}".`);
  process.exit(1);
}

const args = ["next", command];
args.push("-p", port);

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
