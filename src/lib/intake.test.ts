import { describe, expect, it } from "vitest";
import { JevQuestionType, type JevAnswer } from "./jev";
import {
  IntakeKind,
  parseIntake,
  RoleFit,
  roleFit,
  Seniority,
  shouldEscalateScreen,
  WorkModel,
  type IntakeAssessment,
} from "./intake";

function choice(value: string, confidence: number): JevAnswer {
  return {
    type: JevQuestionType.Choice,
    choice: value,
    confidence,
    probabilities: { [value]: confidence },
  };
}

function score(value: number, confidence: number): JevAnswer {
  return { type: JevQuestionType.Score, score: value, confidence };
}

function noul(p: number): JevAnswer {
  return { type: JevQuestionType.Noul, noul: p };
}

const POSTING: Record<string, JevAnswer> = {
  kind: choice("job_posting", 0.95),
  seniority: choice("director", 0.8),
  work_model: choice("remote", 0.9),
  frontend_lean: score(2.7, 0.7),
  manipulation: noul(0.02),
};

function assessment(overrides: Partial<IntakeAssessment>): IntakeAssessment {
  return {
    kind: IntakeKind.JobPosting,
    seniority: null,
    workModel: null,
    frontendLean: null,
    manipulation: 0,
    ...overrides,
  };
}

describe("parseIntake", () => {
  it("reads a confident posting", () => {
    expect(parseIntake(POSTING)).toEqual({
      kind: IntakeKind.JobPosting,
      seniority: Seniority.Director,
      workModel: WorkModel.Remote,
      frontendLean: 2.7,
      manipulation: 0.02,
    });
  });

  it("falls back to Unclear when the kind is low confidence", () => {
    const result = parseIntake({ ...POSTING, kind: choice("job_posting", 0.4) });
    expect(result.kind).toBe(IntakeKind.Unclear);
    expect(result.seniority).toBeNull();
  });

  it("drops low-confidence and unstated fields instead of guessing", () => {
    const result = parseIntake({
      ...POSTING,
      seniority: choice("director", 0.3),
      work_model: choice("unstated", 0.99),
      frontend_lean: score(2.7, 0.1),
    });
    expect(result.seniority).toBeNull();
    expect(result.workModel).toBeNull();
    expect(result.frontendLean).toBeNull();
  });

  it("rejects values outside our enums and out-of-range numbers", () => {
    const result = parseIntake({
      kind: choice("job_posting", 0.9),
      seniority: choice("supreme_overlord", 0.99),
      frontend_lean: score(7, 0.9),
      manipulation: noul(4),
    });
    expect(result.seniority).toBeNull();
    expect(result.frontendLean).toBeNull();
    expect(result.manipulation).toBe(0);
  });

  it("ignores posting fields for non-posting messages", () => {
    const result = parseIntake({
      ...POSTING,
      kind: choice("candidate_question", 0.9),
    });
    expect(result).toEqual({
      kind: IntakeKind.CandidateQuestion,
      seniority: null,
      workModel: null,
      frontendLean: null,
      manipulation: 0.02,
    });
  });

  it("survives an empty answer set", () => {
    expect(parseIntake({})).toEqual(assessment({ kind: IntakeKind.Unclear }));
  });
});

describe("shouldEscalateScreen", () => {
  it("never escalates without a Jev read", () => {
    expect(shouldEscalateScreen(null)).toBe(false);
  });

  it("escalates only at high manipulation probability", () => {
    expect(shouldEscalateScreen(assessment({ manipulation: 0.79 }))).toBe(false);
    expect(shouldEscalateScreen(assessment({ manipulation: 0.8 }))).toBe(true);
  });
});

describe("roleFit", () => {
  it("is in the wheelhouse for frontend leadership", () => {
    expect(
      roleFit(assessment({ seniority: Seniority.Director, frontendLean: 2.6 })),
    ).toBe(RoleFit.Wheelhouse);
  });

  it("is a stretch for backend-heavy or early-career roles", () => {
    expect(roleFit(assessment({ frontendLean: 0.5 }))).toBe(RoleFit.Stretch);
    expect(
      roleFit(assessment({ seniority: Seniority.EarlyCareer, frontendLean: 3 })),
    ).toBe(RoleFit.Stretch);
  });

  it("stays unknown when Jev can't say, or for executive roles", () => {
    expect(roleFit(null)).toBe(RoleFit.Unknown);
    expect(roleFit(assessment({}))).toBe(RoleFit.Unknown);
    expect(
      roleFit(assessment({ seniority: Seniority.Executive, frontendLean: 3 })),
    ).toBe(RoleFit.Unknown);
    expect(
      roleFit(assessment({ kind: IntakeKind.CandidateQuestion, frontendLean: 3 })),
    ).toBe(RoleFit.Unknown);
  });
});
