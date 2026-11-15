// Builds the two Symbiote downloads in dist/:
//
//   arca-symbiote-modio.zip    upload this to mod.io (TaleSpire's mod browser)
//   arca-symbiote-install.zip  give this to players: unzip, double-click
//                              install-arca.bat
//
// `npm run symbiote:pack`. Uses the system `tar`, which writes zip archives on
// Windows 10+ and macOS (bsdtar); on Linux, `zip` is used instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "symbiote");
const out = join(root, "dist");

const SYMBIOTE = ["manifest.json", "arca-bridge.js", "description.md", "icon.png", "notification.png"];
const INSTALLER = [...SYMBIOTE, "install-arca.bat", "README.md"];

function zip(name, files) {
  const target = join(out, name);
  rmSync(target, { force: true });
  if (process.platform === "linux") {
    execFileSync("zip", ["-j", target, ...files.map((f) => join(source, f))], { stdio: "inherit" });
  } else {
    // Windows' own bsdtar, by full path: Git Bash puts GNU tar first on PATH,
    // and GNU tar neither writes zip nor accepts "E:\..." as a local path.
    const tar =
      process.platform === "win32"
        ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    execFileSync(tar, ["-a", "-c", "-f", target, ...files], { cwd: source, stdio: "inherit" });
  }
  process.stdout.write(`wrote ${target}\n`);
}

mkdirSync(out, { recursive: true });
zip("arca-symbiote-modio.zip", SYMBIOTE);
zip("arca-symbiote-install.zip", INSTALLER);
