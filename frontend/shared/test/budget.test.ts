import { describe, expect, it } from "vitest";
import { estimateTokens, fitOnDevice, trimArticle, trimToTokens } from "../src/ai/budget";
import { ON_DEVICE_LIMITS } from "../src/config/keys";
import { GATEKEEPER_V1 } from "../src/prompts";

const para = (n: number) => `Paragraph ${n}. ${"word ".repeat(200)}`.trim();
const longArticle = Array.from({ length: 60 }, (_, i) => para(i)).join("\n\n");

describe("budget", () => {
  it("keeps short text unchanged", () => {
    expect(trimToTokens("Short text.", 100)).toBe("Short text.");
  });

  it("cuts the article at a paragraph boundary within 6k tokens", () => {
    const t = trimArticle(longArticle);
    expect(estimateTokens(t)).toBeLessThanOrEqual(ON_DEVICE_LIMITS.articleTokens);
    expect(t.endsWith("word")).toBe(true); // ends with a whole paragraph
    expect(longArticle.startsWith(t)).toBe(true);
  });

  it("keeps any on-device prompt + output within 9,216 tokens", () => {
    const huge = "x ".repeat(40_000);
    const p = fitOnDevice(GATEKEEPER_V1.build({ title: "T", text: huge }), 400);
    expect(estimateTokens(p) + 400).toBeLessThanOrEqual(ON_DEVICE_LIMITS.totalTokens);
    expect(p).toContain("<article>");
    expect(p).toContain("</article>");
  });
});
