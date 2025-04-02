import { Mastra } from "@mastra/core";
import {
  En_Id_Translate_Comprehensive,
  En_Id_Translate_Simple,
} from "./agents/en_to_id.ts";

export const mastra = new Mastra({
  agents: { En_Id_Translate_Simple, En_Id_Translate_Comprehensive },
});
