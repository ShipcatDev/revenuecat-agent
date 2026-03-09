import fs from "fs";
import { config } from "../config.js";

let soulCache: string | null = null;
let agentsCache: string | null = null;

export function loadSoulPrompt(): string {
  if (!soulCache) {
    soulCache = fs.readFileSync(config.paths.soul, "utf-8");
  }
  return soulCache;
}

export function loadAgentsRules(): string {
  if (!agentsCache) {
    agentsCache = fs.readFileSync(config.paths.agents, "utf-8");
  }
  return agentsCache;
}

export function loadSubAgentPrompt(agentName: string): string {
  const promptPath = `${config.paths.prompts}/sub-agents/${agentName}.md`;
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, "utf-8");
  }
  return "";
}

export function buildSystemPrompt(subAgentName?: string, extraContext?: string): string {
  const parts = [loadSoulPrompt()];

  if (subAgentName) {
    const subPrompt = loadSubAgentPrompt(subAgentName);
    if (subPrompt) {
      parts.push(`\n\n---\n\n## Agent-Specific Instructions\n\n${subPrompt}`);
    }
  }

  if (extraContext) {
    parts.push(`\n\n---\n\n## Current Context\n\n${extraContext}`);
  }

  return parts.join("");
}
