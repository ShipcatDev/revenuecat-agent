import { config, validateConfig } from "./config.js";
import { startTerminalChat, sendSingleMessage } from "./channels/terminal.js";

async function main(): Promise<void> {
  // Validate configuration
  try {
    validateConfig();
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const modeFlag = args.indexOf("--mode");
  const mode = modeFlag !== -1 ? args[modeFlag + 1] : "chat";

  const messageFlag = args.indexOf("--message");
  const message = messageFlag !== -1 ? args.slice(messageFlag + 1).join(" ") : null;

  switch (mode) {
    case "chat":
      await startTerminalChat();
      break;

    case "agent":
      if (!message) {
        console.error('❌ --mode agent requires --message "your message"');
        process.exit(1);
      }
      await sendSingleMessage(message);
      break;

    default:
      console.error(`❌ Unknown mode: ${mode}. Use "chat" or "agent".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
