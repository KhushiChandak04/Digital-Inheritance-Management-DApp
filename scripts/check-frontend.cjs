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
for (const reference of ["./styles.css", "./app.js", "ethers.umd.min.js"]) {
  if (!html.includes(reference)) throw new Error(`Frontend entrypoint is missing ${reference}`);
}

for (const requiredId of ["connectBtn", "beneficiaryForm", "depositForm", "initiateBtn", "cancelBtn", "executeBtn", "contractForm"]) {
  if (!html.includes(`id=\"${requiredId}\"`)) throw new Error(`Frontend entrypoint is missing #${requiredId}`);
}

console.log("Frontend build check passed: entrypoint, modules, backup, and core action hooks are present.");
