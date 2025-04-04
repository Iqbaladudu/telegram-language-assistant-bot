import { Bot, Context, GrammyError, HttpError, Keyboard } from "npm:grammy";
import { Message } from "npm:grammy/types";
// Pastikan WELCOME_MESSAGE di constant/index.ts sudah diformat HTML
import { WELCOME_MESSAGE } from "./constant/index.ts";
import { mastra } from "./src/mastra/index.ts";
import {
  hydrateReply,
  parseMode,
  ParseModeFlavor,
} from "npm:@grammyjs/parse-mode";

// Definisikan tipe context dengan parse mode
type MyContext = ParseModeFlavor<Context>;

// --- Types and Constants ---
type AgentType = "En_Id_Translate_Simple" | "En_Id_Translate_Comprehensive";

const DEFAULT_MODE: AgentType = "En_Id_Translate_Simple";
const COMPREHENSIVE_MODE: AgentType = "En_Id_Translate_Comprehensive";

const loadingFrames = ["⏳", "⌛"];
const ANIMATION_INTERVAL = 1200; // ms

// --- Bot Initialization ---
const botToken = Deno.env.get("BOT_TOKEN");
if (!botToken) {
  console.error("FATAL: BOT_TOKEN not found in environment variables!");
  Deno.exit(1);
}

const bot = new Bot<MyContext>(botToken);

// Middleware untuk parse mode (penting!)
bot.use(hydrateReply);
// Atur parse mode default ke HTML untuk API calls
bot.api.config.use(parseMode("HTML")); // <--- GANTI KE HTML

// --- Deno KV Setup ---
const kv = await Deno.openKv();

// --- KV Store Functions ---
async function saveUserMode(userId: number, mode: AgentType): Promise<void> {
  try {
    await kv.set(["userMode", userId.toString()], mode);
    console.log(`[KV] Saved mode ${mode} for user ${userId}`);
  } catch (error) {
    console.error(`[KV Error] Failed to save mode for user ${userId}:`, error);
    throw error; // Rethrow agar bisa ditangani di caller
  }
}

async function getUserMode(userId: number): Promise<AgentType> {
  try {
    const result = await kv.get<AgentType>(["userMode", userId.toString()]);
    return result.value ?? DEFAULT_MODE;
  } catch (error) {
    console.error(`[KV Error] Failed to get mode for user ${userId}:`, error);
    return DEFAULT_MODE; // Return default on error
  }
}

// --- Helper Functions ---
function createTranslationMenu() {
  return new Keyboard()
    .text("Simple Translation")
    .text("Comprehensive Translation")
    .row()
    .resized();
}

// Fungsi untuk escape karakter HTML spesial
function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Anda bisa tambahkan .replace(/"/g, "&quot;") jika perlu
}

/**
 * Creates and manages a loading message with animation.
 * Assumes initialText is already valid HTML.
 */
async function createLoadingMessage(
  ctx: MyContext,
  initialText: string, // Harus sudah valid HTML
): Promise<{
  message: Message.TextMessage | null;
  updateInterval: number | undefined;
  stop: (newText?: string) => Promise<void>; // newText harus sudah valid HTML
}> {
  let message: Message.TextMessage | null = null;
  let updateInterval: number | undefined;

  try {
    // Kirim pesan awal (menggunakan parse mode HTML default)
    message = await ctx.replyFmt(initialText); // Andalkan default HTML
  } catch (error) {
    console.error("Failed to send initial loading message:", error);
    return {
      message: null,
      updateInterval: undefined,
      stop: async () => {
        console.warn(
          "Attempted to stop a loading message that failed to initialize.",
        );
      },
    };
  }

  let frameIndex = 0;
  updateInterval = setInterval(async () => {
    if (!message?.message_id || !ctx.chat?.id) {
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = undefined;
      return;
    }

    frameIndex = (frameIndex + 1) % loadingFrames.length;
    try {
      // Edit pesan (menggunakan parse mode HTML default)
      await ctx.api.editMessageText(
        ctx.chat.id,
        message.message_id,
        `${loadingFrames[frameIndex]} ${initialText}`, // Teks loading harus sudah HTML
        // parse_mode: "HTML" tidak perlu, sudah default
      );
    } catch (error: any) {
      if (
        error instanceof GrammyError &&
        (error.description.includes("message to edit not found") ||
          error.description.includes("message is not modified"))
      ) {
        console.warn(
          `Stopping animation for message ${message?.message_id}:`,
          error.description,
        );
      } else {
        console.error(
          `Error updating loading animation for message ${message?.message_id}:`,
          error,
        );
      }
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = undefined;
    }
  }, ANIMATION_INTERVAL);

  const stop = async (newText?: string): Promise<void> => { // newText diasumsikan valid HTML
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = undefined;
    }
    if (!message?.message_id || !ctx.chat?.id) {
      console.warn(
        "Stop called but initial message reference or chat context is invalid.",
      );
      if (newText && ctx.chat?.id) {
        try {
          // Kirim sebagai pesan baru jika awal gagal
          await ctx.replyFmt(newText); // Andalkan default HTML
        } catch { /* abaikan error kirim baru */ }
      }
      return;
    }

    if (newText) {
      try {
        // Edit dengan teks final HTML
        await ctx.api.editMessageText(
          ctx.chat.id,
          message.message_id,
          newText, // Harus sudah HTML valid dari AI/proses
          // parse_mode: "HTML" tidak perlu, sudah default
        );
        // console.log(`[Telegram] Successfully edited message ${message.message_id} with HTML result.`);
      } catch (error) {
        console.error(
          `[Telegram Error] Failed to edit message ${message.message_id} with HTML:`,
          error,
        );
        console.log(
          `[Telegram] Problematic text sample (first 100 chars): ${
            newText.substring(0, 100)
          }`,
        );

        // Fallback ke plain text jika HTML gagal
        try {
          // Coba bersihkan tag HTML untuk fallback
          const plainText = newText.replace(/<[^>]*>/g, "");
          await ctx.api.editMessageText(
            ctx.chat.id,
            message.message_id,
            plainText, // Kirim sebagai plain text
            // Tanpa parse_mode, default ke plain text oleh Telegram API
          );
          console.log(
            `[Telegram] Sent plain text fallback for message ${message.message_id} successfully.`,
          );
        } catch (fallbackError) {
          console.error(
            `[Telegram Error] Plain text fallback ALSO failed for message ${message.message_id}:`,
            fallbackError,
          );
          try {
            // Kirim notifikasi error (gunakan escapeHtml)
            await ctx.replyFmt(
              escapeHtml(
                "⚠️ Failed to display the translation result due to formatting issues.",
              ),
            ); // Andalkan default HTML
          } catch (replyError) {
            console.error(
              "Failed even to send a final error notification:",
              replyError,
            );
          }
        }
      }
    } else {
      // Jika stop tanpa teks baru (misal error sebelum hasil)
      // Opsi: Hapus pesan loading jika diperlukan
      // try { await ctx.api.deleteMessage(ctx.chat.id, message.message_id); } catch { /* ignore */ }
    }
  };

  return { message, updateInterval, stop };
}

// --- Command Handlers ---
bot.command("start", (ctx) => {
  const keyboard = createTranslationMenu();
  // Kirim WELCOME_MESSAGE (pastikan sudah HTML di file konstanta)
  ctx.replyFmt(WELCOME_MESSAGE, { // Andalkan default HTML
    reply_markup: keyboard,
  });
});

bot.command("menu", (ctx) => {
  const keyboard = createTranslationMenu();
  // Teks sederhana, tidak perlu format
  ctx.replyFmt("Please select translation mode:", {
    reply_markup: keyboard,
  });
});

bot.command("help", (ctx) => {
  // Teks help ini HARUS diupdate menggunakan tag HTML <b>, <i>, <code>, <pre>, <a>
  const helpText = `<b>🌟 VerbumAI Help</b>

• Send any text directly for translation
• Use <code>/menu</code> to select translation mode
• Use <code>/start</code> to see the welcome message

Currently supporting English to Indonesian translation in two modes:
1. <i>Simple</i> - Quick translations with essential info
2. <i>Comprehensive</i> - Detailed linguistic analysis and examples

Just send your text after selecting a mode!

For bug reports or suggestions, please contact the administrator.`; // Contoh update ke HTML

  ctx.replyFmt(helpText); // Andalkan default HTML
});

// --- Hears Handlers (Menu Buttons) ---
bot.hears("Simple Translation", async (ctx) => {
  if (!ctx.from) return;
  try {
    await saveUserMode(ctx.from.id, DEFAULT_MODE);
    // Update feedback ke HTML
    ctx.replyFmt(
      "✅ Mode set to <b>Simple Translation</b>. You can now send me text to translate.",
      // Andalkan default HTML
    );
  } catch (error) {
    console.error("Failed to set simple mode:", error);
    // Gunakan escapeHtml untuk pesan error
    ctx.replyFmt(
      escapeHtml("⚠️ Failed to set mode. Please try again later."),
      // Andalkan default HTML
    );
  }
});

bot.hears("Comprehensive Translation", async (ctx) => {
  if (!ctx.from) return;
  try {
    await saveUserMode(ctx.from.id, COMPREHENSIVE_MODE);
    // Update feedback ke HTML
    ctx.replyFmt(
      "✅ Mode set to <b>Comprehensive Translation</b>. You can now send me text to translate.",
      // Andalkan default HTML
    );
  } catch (error) {
    console.error("Failed to set comprehensive mode:", error);
    // Gunakan escapeHtml untuk pesan error
    ctx.replyFmt(
      escapeHtml("⚠️ Failed to set mode. Please try again later."),
      // Andalkan default HTML
    );
  }
});

// --- Main Message Handler (for Translation) ---
bot.on("message:text", async (ctx) => {
  if (
    ctx.message.text.startsWith("/") ||
    ["Simple Translation", "Comprehensive Translation"].includes(
      ctx.message.text,
    )
  ) {
    return;
  }

  if (!ctx.from || !ctx.chat) {
    console.warn("Received message without user or chat context:", ctx.message);
    return;
  }

  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const inputText = ctx.message.text;
  let loadingMessageHandler:
    | Awaited<ReturnType<typeof createLoadingMessage>>
    | null = null;

  try {
    // 1. Dapatkan mode user
    const mode = await getUserMode(userId);
    const modeName = mode === DEFAULT_MODE
      ? "Simple Translation"
      : "Comprehensive Translation";

    // 2. Buat pesan loading (teks HARUS sudah valid HTML)
    const loadingText = `Translating with <b>${modeName}</b> mode...`; // Format HTML
    loadingMessageHandler = await createLoadingMessage(ctx, loadingText);

    if (!loadingMessageHandler?.message?.message_id) {
      console.error(
        `[Error] Failed to initialize loading message for user ${userId}. Aborting translation.`,
      );
      return;
    }

    // 3. Lakukan translasi
    console.log(
      `[Agent] User ${userId} (chat ${chatId}) translating with mode ${mode}: "${
        inputText.substring(0, 30)
      }..."`,
    );
    const agent = mastra.getAgent(mode);
    if (!agent) {
      throw new Error(`[Config Error] Agent for mode ${mode} not found!`);
    }

    const result = await agent.generate(inputText);
    console.log(
      `[Agent] Translation completed for user ${userId} (chat ${chatId})`,
    );
    // console.log("[Agent Raw Output]:", JSON.stringify(result.text));

    // --- ASUMSI: result.text sudah dalam format HTML yang valid dari AI ---
    // Tidak perlu post-processing escape Markdown lagi.
    // Jika ingin lebih aman, bisa tambahkan sanitasi HTML di sini,
    // tapi idealnya AI yang diinstruksikan menghasilkan HTML aman.
    const finalResultText = result.text;
    // ---------------------------------------------------------------------

    // 4. Hentikan loading & tampilkan hasil (HTML)
    await loadingMessageHandler.stop(finalResultText);
  } catch (error) {
    console.error(
      `[Error] Translation process failed for user ${userId} (chat ${chatId}):`,
      error,
    );

    // 5. Error Handling: Hentikan loading & informasikan user
    if (loadingMessageHandler) {
      // Coba hentikan animasi (fungsi stop akan menangani jika pesan tidak ada lagi)
      // Tidak perlu stop() tanpa teks, karena kita akan kirim pesan error baru
      // Jika ingin hapus pesan loading saat error:
      // try {
      //   if (loadingMessageHandler.message) {
      //      await ctx.api.deleteMessage(chatId, loadingMessageHandler.message.message_id);
      //   }
      //   if(loadingMessageHandler.updateInterval) clearInterval(loadingMessageHandler.updateInterval)
      // } catch { /* ignore delete error */ }
    }

    // Kirim pesan error terpisah (gunakan escapeHtml)
    const errorMessage = escapeHtml(
      "❌ Sorry, I encountered an error while processing your request. Please try again later.",
    );
    try {
      await ctx.replyFmt(errorMessage); // Andalkan default HTML
    } catch (replyError) {
      console.error(
        `Failed to send error message to user ${userId} (chat ${chatId}):`,
        replyError,
      );
    }
  }
});

// --- Global Error Handler ---
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    `Unhandled error while handling update ${ctx.update.update_id}:`,
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("GrammyError:", e.description);
    console.error("Stack:", e.stack);
  } else if (e instanceof HttpError) { // Tangani HttpError juga
    console.error("HTTP Error:", e.error, e.stack);
  } else if (e instanceof Error) {
    console.error("Error:", e.stack || e.message);
  } else {
    console.error("Unknown error object:", e);
  }

  // Pertimbangkan untuk memberi tahu pengguna tentang error tak terduga
  // if (ctx?.from?.id) {
  //   try {
  //      await ctx.reply("An unexpected error occurred. Please try again later.");
  //   } catch (e) {
  //      console.error("Failed to send generic error message", e)
  //   }
  // }
});

// --- Bot Startup ---
console.log("Starting Language Assistant Bot...");
bot.start({
  onStart: (botInfo) => {
    console.log(
      `Bot @${botInfo.username} [ID: ${botInfo.id}] started successfully! (Using HTML parse mode)`,
    );
  },
}).catch((err) => {
  console.error("FATAL: Failed to start bot:", err);
  Deno.exit(1);
});

// --- Graceful Shutdown ---
async function shutdown() {
  console.log("\nSIGINT/SIGTERM received. Stopping bot gracefully...");
  try {
    await bot.stop();
    console.log("Bot stopped successfully.");
  } catch (e) {
    console.error("Error stopping the bot:", e);
  } finally {
    // Tutup KV Store jika perlu pembersihan khusus (opsional, Deno biasanya handle)
    // try { kv.close(); } catch { /* ignore */ }
    console.log("Exiting Deno process.");
    Deno.exit(0);
  }
}

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

console.log("Bot is running...");
