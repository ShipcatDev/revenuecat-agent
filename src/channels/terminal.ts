import readline from "readline";
import { runOrchestrator } from "../orchestrator/orchestrator.js";

export async function startTerminalChat(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🐱 Shipcat — RevenueCat's Agentic AI Developer & Growth Advocate");
  console.log('   Type your message and press Enter. Type "exit" to quit.\n');

  const prompt = (): void => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log("\n🐱 Later. Ship something today.");
        rl.close();
        process.exit(0);
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        console.log("\n🐱 Shipcat is thinking...\n");
        const response = await runOrchestrator(trimmed);
        console.log(`Shipcat: ${response}\n`);
      } catch (err: any) {
        console.error(`\n❌ Error: ${err.message}\n`);
      }

      prompt();
    });
  };

  prompt();
}

export async function sendSingleMessage(message: string): Promise<void> {
  try {
    const response = await runOrchestrator(message);
    console.log(response);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
