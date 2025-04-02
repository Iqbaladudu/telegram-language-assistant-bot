import { Agent } from "@mastra/core/agent";
import { mistral } from "@ai-sdk/mistral";
import {
  EN_ID_COMPREHENSIVE_TRANSLATOR_PROMPT,
  EN_ID_TELEGRAM_TRANSLATOR_PROMPT_SIMPLE,
} from "../../../constant/index.ts";

export const En_Id_Translate_Simple = new Agent({
  name: "En_Id_Translate_Simple",
  instructions: EN_ID_TELEGRAM_TRANSLATOR_PROMPT_SIMPLE,
  model: mistral("mistral-large-latest"),
});

export const En_Id_Translate_Comprehensive = new Agent({
  name: "En_Id_Translate_Comprehensive",
  instructions: EN_ID_COMPREHENSIVE_TRANSLATOR_PROMPT,
  model: mistral("mistral-large-latest"),
});
