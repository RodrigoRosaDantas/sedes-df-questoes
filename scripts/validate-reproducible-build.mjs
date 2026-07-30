import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true})
    .flatMap(entry => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? files(absolute) : [absolute];
    })
    .sort();
}

function digest() {
  if (!fs.existsSync(dist)) throw new Error("Dist ausente para teste de reprodutibilidade.");
  const hash = crypto.createHash("sha256");
  for (const absolute of files(dist)) {
    const relative = path.relative(dist, absolute).split(path.sep).join("/");
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const first = digest();
execFileSync("npm", ["run", "build"], {cwd: root, stdio: "inherit", env: process.env});
const second = digest();
if (first !== second) throw new Error(`Build não reproduzível: ${first} != ${second}`);
console.log(`✓ Build reproduzível confirmado: ${first}`);
