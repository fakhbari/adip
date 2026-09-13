export const RulesSourceType = {
    GitLab: "GitLab",
    GitHub: "GitHub",
    BitBucket: "BitBucket",
    PDF: "PDF",
} as const;

export type RulesSourceType = (typeof RulesSourceType)[keyof typeof RulesSourceType];

export interface RepositoryConnection {
    id: string;
    name: string;
    type: "bitbucket" | "gitlab" | "github";
    url: string;
    isActive: boolean;
    lastSync: Date | null;
}

export interface ScheduleConfig {
    id: string;
    name: string;
    type: string;
    cronExpression: string;
    isActive: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
}

export interface Settings {
    aiProvider: string;
    apiKey: string;
    notifications: {
        email: boolean;
        slack: boolean;
        teams: boolean;
    };
}
