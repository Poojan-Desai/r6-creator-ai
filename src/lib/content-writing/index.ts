import { TemplateContentSuggestionProvider } from "@/lib/content-writing/template-provider";
import type { ContentSuggestionProvider } from "@/lib/content-writing/types";

const templateProvider = new TemplateContentSuggestionProvider();
const providers: Record<string, ContentSuggestionProvider> = {
  template: templateProvider,
};

export function getContentSuggestionProvider(
  provider = "template",
): ContentSuggestionProvider {
  return providers[provider] ?? templateProvider;
}

export type {
  ContentSuggestion,
  ContentSuggestionContext,
  ContentSuggestionProvider,
  ContentTone,
} from "@/lib/content-writing/types";
export {
  CONTENT_SUGGESTION_EVENT,
  CONTENT_TONES,
} from "@/lib/content-writing/types";
