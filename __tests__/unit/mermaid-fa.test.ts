import { describe, it, expect } from "vitest";
import { ensureLrmInLabels } from "../../src/lib/i18n/mermaid-fa";

describe("ensureLrmInLabels", () => {
  it("wraps Persian text in [] with &lrm; markers", () => {
    const out = ensureLrmInLabels("A[سرویس احراز هویت] --> B[پرداخت]");
    expect(out).toContain("[‎سرویس احراز هویت‎]");
    expect(out).toContain("[‎پرداخت‎]");
  });

  it("does not double-wrap existing &lrm;", () => {
    const input = "A[‎سرویس‎]";
    expect(ensureLrmInLabels(input)).toBe(input);
  });

  it("leaves pure-ASCII labels untouched", () => {
    const input = "A[Service] --> B[Payment]";
    expect(ensureLrmInLabels(input)).toBe(input);
  });

  it("handles parenthesised labels", () => {
    const out = ensureLrmInLabels("A((پایگاه داده)) --> B(کاربر)");
    expect(out).toContain("((‎پایگاه داده‎))");
    expect(out).toContain("(‎کاربر‎)");
  });
});
