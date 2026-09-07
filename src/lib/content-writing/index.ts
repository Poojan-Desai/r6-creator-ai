import { OpenAIContentSuggestionProvider } from "@/lib/content-writing/openai-provider";
import { TemplateContentSuggestionProvider } from "@/lib/content-writing/template-provider";
import type { ContentSuggestionProvider } from "@/lib/content-writing/types";

const templateProvider = new TemplateContentSuggestionProvider();
export function getContentSuggestionProvider(
  provider = "template",
): ContentSuggestionProvider {
  return provider === "openai"
    ? new OpenAIContentSuggestionProvider()
    : templateProvider;
}

export { OpenAIContentSuggestionProvider } from "@/lib/content-writing/openai-provider";
export type {
  CloudWritingResult,
  CloudWritingUsage,
} from "@/lib/content-writing/openai-provider";

export type {
  ContentSuggestion,
  ContentSuggestionContext,
  ContentSuggestionProvider,
  ContentTone,
  ShortFormContentContext,
  ShortFormEvidenceItem,
  ShortFormWritingPackage,
} from "@/lib/content-writing/types";
export {
  CONTENT_SUGGESTION_EVENT,
  CONTENT_TONES,
} from "@/lib/content-writing/types";
