import { Bot, Context, Keyboard } from "npm:grammy";
import { WELCOME_MESSAGE } from "./constant/index.ts";
import { mastra } from "./src/mastra/index.ts";
import {
  hydrateReply,
  parseMode,
  ParseModeFlavor,
} from "npm:@grammyjs/parse-mode";

const bot = new Bot<ParseModeFlavor<Context>>(Deno.env.get("BOT_TOKEN")!);

bot.use(hydrateReply);
bot.api.config.use(parseMode("MarkdownV2"));

type AgentType = "En_Id_Translate_Simple" | "En_Id_Translate_Comprehensive";

const DEFAULT_MODE: AgentType = "En_Id_Translate_Simple";
const COMPREHENSIVE_MODE: AgentType = "En_Id_Translate_Comprehensive";

const kv = await Deno.openKv();

async function saveUserMode(userId: number, mode: AgentType): Promise<void> {
  await kv.set(["userMode", userId.toString()], mode);
  console.log(`Saved mode ${mode} for user ${userId}`);
}

async function getUserMode(userId: number): Promise<AgentType> {
  const result = await kv.get<AgentType>(["userMode", userId.toString()]);
  return result.value || DEFAULT_MODE;
}

const loadingFrames = ["⏳", "⌛"];

const createTranslationMenu = () => {
  return new Keyboard()
    .text("Simple Translation")
    .text("Comprehensive Translation")
    .resized();
};

bot.command("start", (ctx) => {
  const keyboard = createTranslationMenu();
  ctx.reply(escapeMarkdown(WELCOME_MESSAGE), {
    reply_markup: keyboard,
  });
});

bot.command("menu", (ctx) => {
  const keyboard = createTranslationMenu();
  ctx.reply(escapeMarkdown("Please select translation mode:"), {
    reply_markup: keyboard,
  });
});

bot.hears("Simple Translation", async (ctx) => {
  if (ctx.from) {
    await saveUserMode(ctx.from.id, DEFAULT_MODE);
    ctx.reply(
      escapeMarkdown(
        "Mode set to Simple Translation. You can now send me text to translate.",
      ),
    );
  }
});

bot.hears("Comprehensive Translation", async (ctx) => {
  if (ctx.from) {
    await saveUserMode(ctx.from.id, COMPREHENSIVE_MODE);
    ctx.reply(
      escapeMarkdown(
        "Mode set to Comprehensive Translation. You can now send me text to translate.",
      ),
    );
  }
});

bot.on("message", async (ctx) => {
  if (ctx.message.text && ctx.from) {
    if (
      ["Simple Translation", "Comprehensive Translation"].includes(
        ctx.message.text,
      )
    ) {
      return;
    }

    try {
      const loadingMessage = await ctx.reply(
        escapeMarkdown(
          `${loadingFrames[0]} Processing your translation request...`,
        ),
      );

      const mode = await getUserMode(ctx.from.id);

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
            escapeMarkdown(
              `${
                loadingFrames[frameIndex]
              } Translating with ${currentMode} mode...`,
            ),
          );
        } catch (error) {
          console.error("Error updating loading message:", error);
        }
      }, 1000);

      const agent = mastra.getAgent(mode);
      const result = await agent.generate(ctx.message.text);

      clearInterval(updateInterval);

      try {
        // Don't escape AI-generated result as it should already have proper MarkdownV2 formatting
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMessage.message_id,
          result.text,
          { parse_mode: "MarkdownV2" },
        );
      } catch (error) {
        console.error("Markdown rendering error:", error);
        // If the markdown formatting fails, try sending as plain text
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMessage.message_id,
          result.text.replace(/[_*[\]()~`>#+=|{}.!-]/g, ""),
          { parse_mode: "MarkdownV2" },
        );
      }
    } catch (error) {
      console.error("Translation error:", error);
      ctx.reply(
        escapeMarkdown(
          "Sorry, I encountered an error while translating. Please try again or change translation mode with /menu",
        ),
      );
    }
  }
});

function escapeMarkdown(text: string): string {
  if (!text) {
    return "";
  }

  // Step 1: First escape backslashes themselves
  let result = text.replace(/\\/g, "\\\\");

  // Step 2: Escape all other special characters
  // Be explicit about the period to ensure it's properly escaped
  result = result
    .replace(/\./g, "\\.")
    .replace(/\!/g, "\\!")
    .replace(/\_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\~/g, "\\~")
    .replace(/\`/g, "\\`")
    .replace(/\>/g, "\\>")
    .replace(/\#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/\-/g, "\\-")
    .replace(/\=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

  return result;
}
bot.start();
