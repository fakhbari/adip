export const RulesSourceType = {
    GitLab: "GitLab",
    GitHub: "GitHub",
    BitBucket: "BitBucket",
    PDF: "PDF",
} as const;

export type RulesSourceType = (typeof RulesSourceType)[keyof typeof RulesSourceType];