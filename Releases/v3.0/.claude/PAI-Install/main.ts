#!/usr/bin/env bun
/**
 * PAI Installer v3.0 — Main Entry Point
 * Routes to CLI, Web server (for Electron), or GUI (Electron app).
 *
 * Modes:
 *   --mode cli   → Interactive terminal wizard
 *   --mode web   → Start HTTP/WebSocket server (used internally by Electron)
 *   --mode gui   → Launch Electron app (which spawns web mode internally)
 */

import { spawn, spawnSync, execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

type InstallMode = "gui" | "web" | "cli";

function parseMode(argv: string[]): InstallMode {
  let requested: string | undefined;
  let sawModeFlag = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") {
      sawModeFlag = true;
      requested = argv[i + 1];
      break;
    }
    if (arg.startsWith("--mode=")) {
      sawModeFlag = true;
      requested = arg.slice("--mode=".length);
      break;
    }
  }

  // Default applies when main.ts is invoked directly without --mode.
  // PAI_INSTALL_MODE is handled by install.sh before delegating to this file.
  if (!sawModeFlag) return "gui";
  if (!requested) {
    throw new Error("Missing --mode value. Expected: gui, cli, or web.");
  }
  if (requested === "gui" || requested === "web" || requested === "cli") return requested;

  throw new Error(`Invalid mode "${requested}". Expected: gui, cli, or web.`);
}

const args = process.argv.slice(2);

const ROOT = import.meta.dir;

function hasInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function fallbackFromGui(reason: string): Promise<void> {
  console.error(`${reason}\n`);

  if (hasInteractiveTTY()) {
    console.log("Falling back to CLI installer...\n");
    const { runCLI } = await import("./cli/index");
    await runCLI();
    return;
  }

  console.log("No interactive terminal detected. Falling back to web installer...\n");
  await import("./web/server");
}

async function main() {
  const mode = parseMode(args);

  if (mode === "cli") {
    // Run CLI wizard
    const { runCLI } = await import("./cli/index");
    await runCLI();
  } else if (mode === "web") {
    // Start the HTTP + WebSocket server (Electron loads this)
    await import("./web/server");
  } else {
    // Launch Electron GUI app
    const electronDir = join(ROOT, "electron");
    const electronPkg = join(electronDir, "node_modules", ".package-lock.json");

    // Install electron dependencies if needed
    if (!existsSync(electronPkg)) {
      console.log("Installing GUI dependencies (first run only)...\n");
      const install = spawnSync("npm", ["install"], {
        cwd: electronDir,
        stdio: "inherit",
      });
      if (install.status !== 0) {
        await fallbackFromGui("Failed to install GUI dependencies.");
        return;
      }
    }

    // Clear macOS quarantine flags (prevents "app is damaged" error on copied installs)
    if (process.platform === "darwin") {
      try {
        execSync(`xattr -cr "${electronDir}"`, { stdio: "pipe", timeout: 30000 });
        console.log("Cleared macOS quarantine flags.\n");
      } catch {
        // Non-fatal
      }
    }

    console.log("Starting PAI Installer GUI...\n");
    const child = spawn("npm", ["start"], {
      cwd: electronDir,
      stdio: "inherit",
    });

    let handledFailure = false;
    const handleFailure = async (message: string) => {
      if (handledFailure) return;
      handledFailure = true;
      await fallbackFromGui(message);
    };

    child.on("error", (err) => {
      handleFailure(`Failed to launch GUI installer: ${err.message}`).catch(console.error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        process.exit(0);
        return;
      }

      const detail =
        typeof code === "number"
          ? `GUI installer exited with code ${code}.`
          : `GUI installer exited unexpectedly${signal ? ` (signal: ${signal})` : ""}.`;
      handleFailure(detail).catch(console.error);
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
