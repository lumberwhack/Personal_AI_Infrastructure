/**
 * PAI Installer v3.0 — Shell Helpers
 * Single source of truth for shell config/alias handling.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { DetectionResult } from "./types";

export type ShellKind = "zsh" | "bash" | "fish";

export interface ShellProfile {
  kind: ShellKind;
  configPath: string;
  configPathDisplay: string;
  configDir: string;
  activationCommand: string;
}

function detectKindFromName(name?: string): ShellKind | null {
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
  const profile = join(home, ".profile");
  if (existsSync(bashrc)) return bashrc;
  if (existsSync(bashProfile)) return bashProfile;
  if (existsSync(profile)) return profile;
  return bashrc;
}

function pickFallbackKind(home: string): ShellKind {
  if (existsSync(join(home, ".zshrc"))) return "zsh";
  if (existsSync(join(home, ".bashrc")) || existsSync(join(home, ".bash_profile")) || existsSync(join(home, ".profile"))) return "bash";
  if (existsSync(join(home, ".config", "fish", "config.fish"))) return "fish";
  return "zsh";
}

function toDisplayPath(path: string, home: string): string {
  return path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

function quotePath(path: string): string {
  const escaped = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function resolveShellProfile(detection?: DetectionResult | null): ShellProfile {
  const home = homedir();
  const detectedKind =
    detectKindFromName(detection?.shell?.name) ||
    detectKindFromName(process.env.SHELL?.split("/").pop()) ||
    pickFallbackKind(home);

  let configPath = join(home, ".zshrc");
  if (detectedKind === "bash") {
    configPath = resolveBashConfigPath(home);
  } else if (detectedKind === "fish") {
    configPath = join(home, ".config", "fish", "config.fish");
  }

  return {
    kind: detectedKind,
    configPath,
    configPathDisplay: toDisplayPath(configPath, home),
    configDir: dirname(configPath),
    activationCommand: `source ${toDisplayPath(configPath, home)} && pai`,
  };
}

export function buildAliasBlock(profile: ShellProfile, paiToolPath: string): string {
  const quotedToolPath = quotePath(paiToolPath);
  if (profile.kind === "fish") {
    return `# PAI alias\nfunction pai\n    bun ${quotedToolPath} $argv\nend`;
  }
  return `# PAI alias\nalias pai='bun ${quotedToolPath}'`;
}

export function stripExistingAlias(content: string, profile: ShellProfile): string {
  if (profile.kind === "fish") {
    return content
      .replace(/^#\s*(?:PAI|CORE)\s*alias.*\nfunction pai\n(?:[^\n]*\n)*?end\n?/gm, "")
      .replace(/^function pai\n(?:[^\n]*\n)*?end\n?/gm, "");
  }

  return content
    .replace(/^#\s*(?:PAI|CORE)\s*alias.*\n.*alias pai=.*\n?/gm, "")
    .replace(/^alias pai=.*\n?/gm, "");
}

export function hasAlias(content: string, profile: ShellProfile): boolean {
  if (profile.kind === "fish") {
    return content.includes("# PAI alias") && content.includes("function pai");
  }
  return content.includes("# PAI alias") && content.includes("alias pai=");
}
