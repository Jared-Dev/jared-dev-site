export type Role = "user" | "assistant";

export interface MessageRecord {
  role: Role;
  content: string;
  /** Unix ms */
  timestamp: number;
}

export interface SessionRecord {
  /** Number of FLAG strikes accumulated this session (0, 1, 2, or 3). */
  strikes: number;
  /** Unix ms when session was created. */
  createdAt: number;
  /** Unix ms when session was closed at tier 3. Absent if still open. */
  closedAt?: number;
}

export interface IdentityRecord {
  /** Lifetime count of tier-3 session closes for this identity. */
  offenseCount: number;
  /** Unix ms after which this identity may start a new session. 0/absent if no active cooldown. */
  cooldownUntil: number;
  /** 1 if permanently blocked (admin-cleared only). */
  permanentBlock: 0 | 1;
}

export type Verdict = "SAFE" | "REDIRECT" | "FLAG";

export type ClassifierType =
  | "none"
  | "off_topic"
  | "injection"
  | "persona_attack"
  | "gradual_steering"
  | "harmful";

export interface ClassifierResult {
  verdict: Verdict;
  type: ClassifierType;
  reason: string;
  /** Raw classifier output for debugging. */
  raw: string;
}

export interface LogEntry {
  timestamp: number;
  sessionId: string;
  identityHash: string;
  verdict: Verdict;
  type: ClassifierType;
  reason: string;
  /** User input, truncated to ~1000 chars. */
  input: string;
  /** Strike count at time of event (after this event's increment, if any). */
  strikeCount: number;
  /** Conversation turn number (1-indexed). */
  turn: number;
}
