export const ReminderStages = {
    FIRST: 1,
    SECOND: 2,
    THIRD: 3,
    FINAL: 4,
} as const;

export type ReminderStage =
    (typeof ReminderStages)[keyof typeof ReminderStages];