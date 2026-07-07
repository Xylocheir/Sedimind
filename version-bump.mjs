import { readFileSync, writeFileSync, existsSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

manifest.version = pkg.version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versionsFile = "versions.json";
const versions = existsSync(versionsFile)
  ? JSON.parse(readFileSync(versionsFile, "utf8"))
  : {};

versions[pkg.version] = pkg.minAppVersion || "1.5.0";
writeFileSync(versionsFile, JSON.stringify(versions, null, 2) + "\n");

console.log(`Bumped versions to ${pkg.version}`);
