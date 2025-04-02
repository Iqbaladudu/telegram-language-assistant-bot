import { Mastra } from "@mastra/core";
import {
  En_Id_Translate_Comprehensive,
  En_Id_Translate_Simple,
} from "./agents/en_to_id.ts";
import { LangfuseExporter } from "langfuse-vercel";

export const mastra = new Mastra({
  agents: { En_Id_Translate_Simple, En_Id_Translate_Comprehensive },
  telemetry: {
    serviceName: "ai",
    enabled: true,
    export: {
      type: "custom",
      exporter: new LangfuseExporter({
        publicKey: Deno.env.get("LANGFUSE_PUBLIC_KEY"),
        secretKey: Deno.env.get("LANGFUSE_SECRET_KEY"),
        baseUrl: Deno.env.get("LANGFUSE_HOST"),
      }),
    },
  },
});
