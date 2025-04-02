import { Bot, Keyboard } from "npm:grammy";
import { WELCOME_MESSAGE } from "./constant/index.ts";
import { mastra } from "./src/mastra/index.ts";

const bot = new Bot(Deno.env.get("BOT_TOKEN")!);

// Define valid agent types
type AgentType = "En_Id_Translate_Simple" | "En_Id_Translate_Comprehensive";

// Default mode is simple translation
const DEFAULT_MODE: AgentType = "En_Id_Translate_Simple";
const COMPREHENSIVE_MODE: AgentType = "En_Id_Translate_Comprehensive";

// Open the KV store
const kv = await Deno.openKv();

// Function to save user's translation mode preference
async function saveUserMode(userId: number, mode: AgentType): Promise<void> {
  await kv.set(["userMode", userId.toString()], mode);
  console.log(`Saved mode ${mode} for user ${userId}`);
}

// Function to get user's translation mode preference
async function getUserMode(userId: number): Promise<AgentType> {
  const result = await kv.get<AgentType>(["userMode", userId.toString()]);
  return result.value || DEFAULT_MODE;
}

// Animation frames for loading indicator
const loadingFrames = ["⏳", "⌛"];

// Create keyboard with translation options
const createTranslationMenu = () => {
  return new Keyboard()
    .text("Simple Translation")
    .text("Comprehensive Translation")
    .resized();
};

bot.command("start", (ctx) => {
  const keyboard = createTranslationMenu();
  ctx.reply(WELCOME_MESSAGE, {
    reply_markup: keyboard,
  });
});

bot.command("menu", (ctx) => {
  const keyboard = createTranslationMenu();
  ctx.reply("Please select translation mode:", {
    reply_markup: keyboard,
  });
});

// Handle menu selections
bot.hears("Simple Translation", async (ctx) => {
  if (ctx.from) {
    await saveUserMode(ctx.from.id, DEFAULT_MODE);
    ctx.reply(
      "Mode set to Simple Translation. You can now send me text to translate.",
    );
  }
});

bot.hears("Comprehensive Translation", async (ctx) => {
  if (ctx.from) {
    await saveUserMode(ctx.from.id, COMPREHENSIVE_MODE);
    ctx.reply(
      "Mode set to Comprehensive Translation. You can now send me text to translate.",
    );
  }
});

bot.on("message", async (ctx) => {
  if (ctx.message.text && ctx.from) {
    // Skip processing if it's one of our menu options
    if (
      ["Simple Translation", "Comprehensive Translation"].includes(
        ctx.message.text,
      )
    ) {
      return;
    }

    try {
      // First, send a loading message
      const loadingMessage = await ctx.reply(
        `${loadingFrames[0]} Processing your translation request...`,
      );

      // Get user's preferred mode from persistent storage
      const mode = await getUserMode(ctx.from.id);

      // Set up animation for loading indicator
      let frameIndex = 0;
      const updateInterval = setInterval(async () => {
        frameIndex = (frameIndex + 1) % loadingFrames.length;
        const currentMode = mode === DEFAULT_MODE
          ? "Simple Translation"
          : "Comprehensive Translation";
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            `${
              loadingFrames[frameIndex]
            } Translating with ${currentMode} mode...`,
          );
        } catch (error) {
          console.error("Error updating loading message:", error);
        }
      }, 1000);

      // Generate translation
      const agent = mastra.getAgent(mode);
      const result = await agent.generate(ctx.message.text);

      // Clear the update interval
      clearInterval(updateInterval);

      // Replace the loading message with the actual translation
      await ctx.api.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        `Translation:\n\n${result.text}`,
      );
    } catch (error) {
      console.error("Translation error:", error);
      ctx.reply(
        "Sorry, I encountered an error while translating. Please try again or change translation mode with /menu",
      );
    }
  }
});

bot.start();
