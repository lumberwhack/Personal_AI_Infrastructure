/**
 * PAI Installer v3.0 — Shell Helpers
 * Resolves user shell profile and alias command paths.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { DetectionResult } from "./types";

export type SupportedShell = "zsh" | "bash" | "fish";

export interface ShellProfile {
  name: SupportedShell;
  configPath: string;
  configPathDisplay: string;
  reloadCommand: string;
  activationCommand: string;
}

function normalizeShellName(name?: string | null): SupportedShell | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("zsh")) return "zsh";
  if (lower.includes("bash")) return "bash";
  if (lower.includes("fish")) return "fish";
  return null;
}

function resolveBashConfigPath(home: string): string {
  const bashrc = join(home, ".bashrc");
  const bashProfile = join(home, ".bash_profile");
  if (existsSync(bashrc)) return bashrc;
  if (existsSync(bashProfile)) return bashProfile;
  return bashrc;
}

function toDisplayPath(absPath: string, home: string): string {
  return absPath.startsWith(home + "/") ? "~" + absPath.slice(home.length) : absPath;
}

function pickFallbackShell(home: string): SupportedShell {
  if (existsSync(join(home, ".zshrc"))) return "zsh";
  if (existsSync(join(home, ".bashrc")) || existsSync(join(home, ".bash_profile"))) return "bash";
  if (existsSync(join(home, ".config", "fish", "config.fish"))) return "fish";
  return "zsh";
}

export function resolveShellProfile(detection?: DetectionResult | null): ShellProfile {
  const home = homedir();
  const detectedShell =
    normalizeShellName(detection?.shell?.name) ||
    normalizeShellName(process.env.SHELL?.split("/").pop()) ||
    pickFallbackShell(home);

  let configPath = join(home, ".zshrc");
  if (detectedShell === "bash") {
    configPath = resolveBashConfigPath(home);
  } else if (detectedShell === "fish") {
    configPath = join(home, ".config", "fish", "config.fish");
  }

  const configPathDisplay = toDisplayPath(configPath, home);
  const reloadCommand = `source ${configPathDisplay}`;

  return {
    name: detectedShell,
    configPath,
    configPathDisplay,
    reloadCommand,
    activationCommand: `${reloadCommand} && pai`,
  };
}

export function buildPaiAliasBlock(shell: SupportedShell, paiToolPath: string): string {
  if (shell === "fish") {
    return `# PAI alias\nfunction pai\n    bun ${paiToolPath} $argv\nend`;
  }
  return `# PAI alias\nalias pai='bun ${paiToolPath}'`;
}

export function stripExistingPaiAlias(content: string, shell: SupportedShell): string {
  if (shell === "fish") {
    return content
      .replace(/^#\s*(?:PAI|CORE)\s*alias.*\nfunction pai\n(?:[^\n]*\n)*?end\n?/gm, "")
      .replace(/^function pai\n(?:[^\n]*\n)*?end\n?/gm, "");
  }

  return content
    .replace(/^#\s*(?:PAI|CORE)\s*alias.*\n.*alias pai=.*\n?/gm, "")
    .replace(/^alias pai=.*\n?/gm, "");
}

export function hasPaiAlias(content: string, shell: SupportedShell): boolean {
  if (shell === "fish") {
    return content.includes("# PAI alias") && content.includes("function pai");
  }
  return content.includes("# PAI alias") && content.includes("alias pai=");
}
