const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const version = process.argv[2];

if (!version) {
  console.error("Error: Version argument is required.");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

function updateJson(filePath, updater) {
  const fullPath = path.join(root, filePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`Skipping missing file: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  updater(data);

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + "\n");

  console.log(`Updated: ${filePath}`);
}

// package.json
updateJson("package.json", (data) => {
  data.version = version;
});

// package-lock.json
updateJson("package-lock.json", (data) => {
  data.version = version;

  if (data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
});

// tauri.conf.json
updateJson("src-tauri/tauri.conf.json", (data) => {
  data.version = version;
});

// Cargo.toml
const cargoPath = path.join(root, "src-tauri", "Cargo.toml");

if (fs.existsSync(cargoPath)) {
  let cargo = fs.readFileSync(cargoPath, "utf8");

  const packageSection = cargo.match(/^(\[package\][\s\S]*?)(?=^\[|\s*$)/m);

  if (!packageSection) {
    throw new Error("Could not find [package] in Cargo.toml");
  }

  const updatedSection = packageSection[1].replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  );

  cargo = cargo.replace(packageSection[1], updatedSection);

  fs.writeFileSync(cargoPath, cargo);
  console.log("Updated: src-tauri/Cargo.toml");
}

console.log(`\nARIS version synchronized to ${version}`);
