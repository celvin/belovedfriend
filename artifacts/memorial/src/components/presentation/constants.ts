// Shared timing + palette tokens so every presentation scene feels cohesive.

export const POLL_MS = 25_000; // refetch cadence for new memories

export const SCENE_MS = {
  title: 6_500,
  photo: 7_000,
  journeyBase: 6_000,
  journeyPerEdge: 1_700,
} as const;

export const FLOURISH_MS = 2_800; // "new memory arrived" banner duration

export const PALETTE = {
  ink: "#0e0b07",
  inkSoft: "#1a130a",
  land: "#2a2118",
  star: "#f5ead2",
  defaultAccent: "#c98a3c",
} as const;
