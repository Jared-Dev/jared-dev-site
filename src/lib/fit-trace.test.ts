import { describe, expect, it } from "vitest";
import { decodeFitTrace, encodeFitTrace, TraceSource, type FitTrace } from "./fit-trace";
import { buildFitTrace, type TraceContext } from "./fit-trace-build";
import { IntakeKind, Seniority, WorkModel, type IntakeAssessment } from "./intake";

const BASE: TraceContext = {
  jevEnabled: true,
  intake: null,
  sourceHost: null,
  cached: false,
};

function posting(overrides: Partial<IntakeAssessment> = {}): IntakeAssessment {
  return {
    kind: IntakeKind.JobPosting,
    seniority: Seniority.Director,
    workModel: WorkModel.Remote,
    frontendLean: 2.8,
    manipulation: 0,
    ...overrides,
  };
}

describe("encode/decodeFitTrace", () => {
  it("round-trips non-ASCII copy", () => {
    const trace: FitTrace = {
      steps: [{ source: TraceSource.Jev, text: "Asked Jev… it's a job" }],
      pending: { source: TraceSource.Claude, text: "Asking Anthropic's Claude…" },
    };
    expect(decodeFitTrace(encodeFitTrace(trace))).toEqual(trace);
  });

  it("rejects missing, garbage, and malformed traces", () => {
    expect(decodeFitTrace(null)).toBeNull();
    expect(decodeFitTrace("%%%not base64")).toBeNull();
    expect(decodeFitTrace(btoa(JSON.stringify({ steps: "nope", pending: null })))).toBeNull();
    expect(
      decodeFitTrace(
        btoa(JSON.stringify({ steps: [{ source: "evil", text: "x" }], pending: null })),
      ),
    ).toBeNull();
  });
});

describe("buildFitTrace", () => {
  it("names Jev's read and frames a wheelhouse role for Claude", () => {
    const trace = buildFitTrace({ ...BASE, intake: posting() });
    expect(trace.steps).toEqual([
      {
        source: TraceSource.Jev,
        text: "Asked Jev if this is about a job. It is: a director-level role, remote, mostly frontend work.",
      },
    ]);
    expect(trace.pending?.source).toBe(TraceSource.Claude);
    expect(trace.pending?.text).toMatch(/^Since this role is in Jared's wheelhouse, asking Anthropic's Claude/);
  });

  it("frames a backend-leaning role without judging Jared", () => {
    const trace = buildFitTrace({
      ...BASE,
      intake: posting({ seniority: Seniority.Manager, frontendLean: 0.4 }),
    });
    expect(trace.pending?.text).toMatch(/leans away from frontend/);
  });

  it("leads with the fetch step for a URL", () => {
    const trace = buildFitTrace({
      ...BASE,
      intake: posting(),
      sourceHost: "boards.greenhouse.io",
    });
    expect(trace.steps[0]).toEqual({
      source: TraceSource.Web,
      text: "Pulled the posting from boards.greenhouse.io.",
    });
  });

  it("admits when Jev didn't answer, and stays quiet when Jev is off", () => {
    const missed = buildFitTrace(BASE);
    expect(missed.steps).toEqual([
      { source: TraceSource.Jev, text: "Jev didn't answer in time, so moving straight on." },
    ]);
    expect(missed.pending?.text).toBe("Handing this to Anthropic's Claude…");

    const off = buildFitTrace({ ...BASE, jevEnabled: false });
    expect(off.steps).toEqual([]);
  });

  it("ends without a pending step on a cache hit", () => {
    const trace = buildFitTrace({ ...BASE, intake: posting(), cached: true });
    expect(trace.pending).toBeNull();
    expect(trace.steps.at(-1)?.source).toBe(TraceSource.Cache);
  });

  it("describes questions and small talk", () => {
    const question = buildFitTrace({
      ...BASE,
      intake: posting({ kind: IntakeKind.CandidateQuestion }),
    });
    expect(question.steps[0]?.text).toBe(
      "Asked Jev what this is. A question about Jared, not a posting.",
    );
    expect(question.pending?.text).toBe("Asking Anthropic's Claude to answer from Jared's profile…");
  });

  it("never mentions the security screen", () => {
    const traces = [
      buildFitTrace({ ...BASE, intake: posting({ manipulation: 0.99 }) }),
      buildFitTrace({ ...BASE, intake: posting({ kind: IntakeKind.Other }) }),
    ];
    for (const trace of traces) {
      const copy = JSON.stringify(trace).toLowerCase();
      expect(copy).not.toMatch(/screen|haiku|injection|attack|safety/);
    }
  });

  it("every step fits the decoder's limits", () => {
    const trace = buildFitTrace({
      ...BASE,
      intake: posting(),
      sourceHost: "a".repeat(400) + ".example.com",
    });
    expect(decodeFitTrace(encodeFitTrace(trace))).toEqual(trace);
  });
});
