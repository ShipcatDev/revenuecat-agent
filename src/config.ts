import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: "claude-sonnet-4-5-20250929" as const,
    opusModel: "claude-opus-4-5-20251101" as const,
  },
  revenuecat: {
    apiKey: process.env.REVENUECAT_API_KEY || "",
    mcpUrl: "https://mcp.revenuecat.ai/mcp",
  },
  twitter: {
    apiKey: process.env.X_API_KEY || "",
    apiSecret: process.env.X_API_SECRET || "",
    accessToken: process.env.X_ACCESS_TOKEN || "",
    accessSecret: process.env.X_ACCESS_SECRET || "",
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || "",
  },
  paths: {
    root: PROJECT_ROOT,
    soul: path.join(PROJECT_ROOT, "SOUL.md"),
    agents: path.join(PROJECT_ROOT, "AGENTS.md"),
    content: path.join(PROJECT_ROOT, "content"),
    data: path.join(PROJECT_ROOT, "data"),
    reports: path.join(PROJECT_ROOT, "reports"),
    docs: path.join(PROJECT_ROOT, "docs"),
    memory: path.join(PROJECT_ROOT, "data", "memory.db"),
    prompts: path.join(__dirname, "prompts"),
  },
} as const;

export function validateConfig(): void {
  if (!config.anthropic.apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required. Set it in .env");
  }
}
