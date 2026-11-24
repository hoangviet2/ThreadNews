import { ON_DEVICE_LIMITS } from "../config/keys";

/** ~4 characters per token (same estimate the API uses for packing). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/**
 * Cut text to at most `maxTokens`, at a paragraph boundary when possible,
 * else a sentence boundary, else a hard cut.
 */
export function trimToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean;
  const head = clean.slice(0, maxChars);
  const para = head.lastIndexOf("\n\n");
  if (para > maxChars * 0.5) return head.slice(0, para).trim();
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"));
  if (sentence > maxChars * 0.5) return head.slice(0, sentence + 1).trim();
  return head.trim();
}

export const trimArticle = (text: string) => trimToTokens(text, ON_DEVICE_LIMITS.articleTokens);
export const trimContext = (context: string) => trimToTokens(context, ON_DEVICE_LIMITS.contextTokens);

/**
 * Final guard before every on-device call: prompt + reserved output must fit the Nano window.
 * Shrinks the longest tagged block (<article>/<context>) until it fits.
 */
export function fitOnDevice(prompt: string, maxOutputTokens: number = ON_DEVICE_LIMITS.maxOutputTokens): string {
  const budget = ON_DEVICE_LIMITS.totalTokens - maxOutputTokens;
  let p = prompt;
  for (let i = 0; i < 8 && estimateTokens(p) > budget; i++) {
    const m = /<(article|context)>([\s\S]*?)<\/\1>/.exec(p);
    if (!m || m[2] === undefined) break;
    const over = estimateTokens(p) - budget;
    const target = Math.max(0, estimateTokens(m[2]) - over - 16);
    p = p.replace(m[0], `<${m[1]}>${trimToTokens(m[2], target)}</${m[1]}>`);
  }
  if (estimateTokens(p) > budget) p = p.slice(0, budget * 4);
  return p;
}
