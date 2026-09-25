const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "frontend/index.html",
  "frontend/styles.css",
  "frontend/app.js",
  "frontend/contract-service.js",
  "frontend/config.js",
  "frontend/brand-logo-dark.png",
  "frontend/brand-logo-light.png",
  "frontend/index.backup.html",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing frontend file: ${file}`);
}

for (const file of ["frontend/app.js", "frontend/contract-service.js", "frontend/config.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend/app.js"), "utf8");
for (const reference of ["./styles.css", "./app.js", "./brand-logo-dark.png", "ethers.umd.min.js"]) {
  if (!html.includes(reference)) throw new Error(`Frontend entrypoint is missing ${reference}`);
}
for (const reference of ["./brand-logo-dark.png", "./brand-logo-light.png"]) {
  if (!app.includes(reference)) throw new Error(`Frontend theme logic is missing ${reference}`);
}

for (const requiredId of ["connectBtn", "beneficiaryForm", "depositForm", "initiateBtn", "cancelBtn", "executeBtn", "contractForm", "timelockForm", "timelockSelect", "customTimelockInput"]) {
  if (!html.includes(`id=\"${requiredId}\"`)) throw new Error(`Frontend entrypoint is missing #${requiredId}`);
}

const addressPattern = /^0x[0-9a-f]{40}$/i;
for (const address of [
  "0x22d491bde2303f2f43325b2108d26f1eaba1e32b",
  "0X22D491BDE2303F2F43325B2108D26F1EABA1E32B",
  "0x22D491bde2303f2f43325b2108d26f1eaba1e32b",
]) {
  if (!addressPattern.test(address)) throw new Error(`Valid address casing was rejected: ${address}`);
}
for (const address of ["0x1234", "0x22d491bde2303f2f43325b2108d26f1eaba1e3g", "not-an-address"]) {
  if (addressPattern.test(address)) throw new Error(`Invalid address was accepted: ${address}`);
}

console.log("Frontend build check passed: entrypoint, modules, backup, and core action hooks are present.");
