import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import {
  EN_ID_COMPREHENSIVE_TRANSLATOR_PROMPT,
  EN_ID_TELEGRAM_TRANSLATOR_PROMPT_SIMPLE,
} from "../../../constant/index.ts";

export const En_Id_Translate_Simple = new Agent({
  name: "En_Id_Translate_Simple",
  instructions: EN_ID_TELEGRAM_TRANSLATOR_PROMPT_SIMPLE,
  model: anthropic("claude-3-5-haiku-latest"),
});

export const En_Id_Translate_Comprehensive = new Agent({
  name: "En_Id_Translate_Comprehensive",
  instructions: EN_ID_COMPREHENSIVE_TRANSLATOR_PROMPT,
  model: anthropic("claude-3-5-haiku-latest"),
});
