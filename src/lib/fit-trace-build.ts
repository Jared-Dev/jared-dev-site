/**
 * Builds the thinking trace from what the fit route actually did.
 * Pure: every branch is covered in fit-trace-build.test.ts.
 *
 * Copy rules: name the real services (Jev, Anthropic's Claude), describe
 * the role rather than judge Jared, and never mention security
 * screening. Jev's read is a rough first pass; the trace says what it
 * saw and hands the real verdict to Claude.
 */

import { TraceSource, type FitTrace, type TraceStep } from "@/lib/fit-trace";
import {
  IntakeKind,
  RoleFit,
  roleFit,
  Seniority,
  WorkModel,
  type IntakeAssessment,
} from "@/lib/intake";

const MAX_HOST_CHARS = 80;

export interface TraceContext {
  jevEnabled: boolean;
  /** Null when Jev is disabled or didn't answer. */
  intake: IntakeAssessment | null;
  /** Hostname of a fetched posting URL, if the input was a link. */
  sourceHost: string | null;
  /** True when the answer is replayed from the response cache. */
  cached: boolean;
}

const SENIORITY_PHRASE: Record<Exclude<Seniority, Seniority.Unstated>, string> = {
  [Seniority.EarlyCareer]: "a junior-to-mid level role",
  [Seniority.SeniorIc]: "a senior IC role",
  [Seniority.StaffIc]: "a staff or principal IC role",
  [Seniority.TeamLead]: "a team lead role",
  [Seniority.Manager]: "an engineering manager role",
  [Seniority.Director]: "a director-level role",
  [Seniority.Executive]: "an executive role",
};

const WORK_MODEL_PHRASE: Record<Exclude<WorkModel, WorkModel.Unstated>, string> = {
  [WorkModel.Remote]: "remote",
  [WorkModel.Hybrid]: "hybrid",
  [WorkModel.Onsite]: "on site",
};

function frontendPhrase(lean: number): string {
  if (lean >= 2.5) return "mostly frontend work";
  if (lean >= 1.5) return "frontend-leaning";
  if (lean > 1) return "full-stack";
  return "mostly backend or infrastructure";
}

function describePosting(intake: IntakeAssessment): string {
  const parts: string[] = [];
  parts.push(intake.seniority ? SENIORITY_PHRASE[intake.seniority] : "a role");
  if (intake.workModel) parts.push(WORK_MODEL_PHRASE[intake.workModel]);
  if (intake.frontendLean !== null) parts.push(frontendPhrase(intake.frontendLean));
  if (parts.length === 1 && !intake.seniority) {
    return "Asked Jev if this is about a job. It is, though the details are thin.";
  }
  return `Asked Jev if this is about a job. It is: ${parts.join(", ")}.`;
}

function jevStep(intake: IntakeAssessment): TraceStep {
  const text = (() => {
    switch (intake.kind) {
      case IntakeKind.JobPosting:
        return describePosting(intake);
      case IntakeKind.CandidateQuestion:
        return "Asked Jev what this is. A question about Jared, not a posting.";
      case IntakeKind.SmallTalk:
        return "Asked Jev what this is. Just a friendly hello.";
      case IntakeKind.Other:
      case IntakeKind.Unclear:
        return "Asked Jev what this is. Not clearly a posting, so treating it as a question.";
    }
  })();
  return { source: TraceSource.Jev, text };
}

function claudePending(intake: IntakeAssessment | null, sourceHost: string | null): TraceStep {
  const text = (() => {
    if (!intake) {
      return sourceHost
        ? "Asking Anthropic's Claude to weigh the posting against Jared's background…"
        : "Handing this to Anthropic's Claude…";
    }
    switch (intake.kind) {
      case IntakeKind.JobPosting: {
        const fit = roleFit(intake);
        if (fit === RoleFit.Wheelhouse) {
          return "Since this role is in Jared's wheelhouse, asking Anthropic's Claude how strong the match really is…";
        }
        if (fit === RoleFit.Stretch) {
          return intake.seniority === Seniority.EarlyCareer
            ? "The level reads below Jared's, so asking Anthropic's Claude for an honest take on the fit…"
            : "This one leans away from frontend, so asking Anthropic's Claude what carries over…";
        }
        return "Asking Anthropic's Claude to weigh the posting against Jared's background…";
      }
      case IntakeKind.CandidateQuestion:
        return "Asking Anthropic's Claude to answer from Jared's profile…";
      case IntakeKind.SmallTalk:
        return "Asking Anthropic's Claude for a reply…";
      case IntakeKind.Other:
      case IntakeKind.Unclear:
        return "Handing this to Anthropic's Claude…";
    }
  })();
  return { source: TraceSource.Claude, text };
}

export function buildFitTrace(ctx: TraceContext): FitTrace {
  const steps: TraceStep[] = [];

  if (ctx.sourceHost) {
    steps.push({
      source: TraceSource.Web,
      text: `Pulled the posting from ${ctx.sourceHost.slice(0, MAX_HOST_CHARS)}.`,
    });
  }

  if (ctx.intake) {
    steps.push(jevStep(ctx.intake));
  } else if (ctx.jevEnabled) {
    steps.push({
      source: TraceSource.Jev,
      text: "Jev didn't answer in time, so moving straight on.",
    });
  }

  if (ctx.cached) {
    steps.push({
      source: TraceSource.Cache,
      text: "Read this exact posting recently, so reusing that answer instead of asking Anthropic again.",
    });
    return { steps, pending: null };
  }

  return { steps, pending: claudePending(ctx.intake, ctx.sourceHost) };
}
