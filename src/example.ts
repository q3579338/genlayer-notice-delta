import type { Notice } from "./model";
// Fictional, immutable example. Never persisted to the chain or wallet journal.
export const EXAMPLE: Notice[] = [{
  id: 1, title: "开放构建计划 · 参与规则", sourceUrl: "https://example.org/builders/announcement",
  questions: ["本期作品提交的截止时间是否发生变化？", "每个团队最多可提交几件作品？", "参与者是否需要公开完整的项目源码？"],
  owner: "离线示例", createdAt: "2026-10-20T09:00:00Z", revisions: [{
    revision: 1, observedAt: "2026-10-20T09:00:00Z", verdict: "BASELINE",
    sourceUrl: "https://example.org/builders/announcement", contentHash: "example-baseline-v1",
    evidence: "本期作品提交截止时间为 2026 年 10 月 30 日 18:00（UTC+8）。每个团队最多提交 2 件作品。所有参与作品须公开完整项目源码。",
    reason: "离线示例中的初始版本，用于演示逐字证据与关注事项。", findings: [],
  }, {
    revision: 2, observedAt: "2026-10-21T09:00:00Z", verdict: "CHANGED",
    sourceUrl: "https://example.org/builders/announcement", contentHash: "example-comparison-v2",
    evidence: "本期作品提交截止时间延长至 2026 年 11 月 6 日 18:00（UTC+8）。每个团队最多提交 2 件作品。所有参与作品须公开完整项目源码。",
    reason: "提交截止时间延后；另两条关注事项未发现变化。全部内容均为虚构离线示例。",
    findings: [
      { question: "本期作品提交的截止时间是否发生变化？", verdict: "CHANGED", before: "2026 年 10 月 30 日 18:00（UTC+8）", after: "2026 年 11 月 6 日 18:00（UTC+8）", reason: "截止时间由 10 月 30 日延至 11 月 6 日。" },
      { question: "每个团队最多可提交几件作品？", verdict: "UNCHANGED", before: "每个团队最多提交 2 件作品。", after: "每个团队最多提交 2 件作品。", reason: "对应条款相同。" },
      { question: "参与者是否需要公开完整的项目源码？", verdict: "UNCHANGED", before: "所有参与作品须公开完整项目源码。", after: "所有参与作品须公开完整项目源码。", reason: "源码公开要求相同。" },
    ],
  }],
}];
