// Shared by the restaurant-page feedback prompt, /api/feedback, and the report script.

export const FEEDBACK_REASONS = [
  { value: "more_menu_detail", label: "More menu detail" },
  { value: "unsure_if_safe",   label: "Unsure if safe" },
  { value: "info_wrong",       label: "Info looks wrong" },
  { value: "want_photos",      label: "Want photos" },
  { value: "other",            label: "Other" },
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number]["value"];
