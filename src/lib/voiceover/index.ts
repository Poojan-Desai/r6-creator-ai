import { LocalVoiceoverScriptProvider } from "@/lib/voiceover/local-provider";

export * from "@/lib/voiceover/types";

const localProvider = new LocalVoiceoverScriptProvider();

export function getVoiceoverScriptProvider() {
  return localProvider;
}
