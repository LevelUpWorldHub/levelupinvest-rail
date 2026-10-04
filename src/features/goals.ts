import { addMonthsToDate, monthsBetween } from "../dates.js";

export interface Goal {
  name: string;
  targetCents: number;
  currentCents: number;
  /** 'YYYY-MM-DD' */
  targetDate: string;
  /** Nominal annual return, e.g. 0.04. Defaults to 0. */
  annualReturn?: number;
}

export interface Projection {
  monthlyContributionCents: number;
  annualReturn: number;
  monthsToTarget: number;
  projectedAtTargetDateCents: number;
  shortfallCents: number;
  onTrack: boolean;
  /** Months until the goal is reached at this contribution; null if never within 100 years. */
  monthsUntilReached: number | null;
  projectedCompletionDate: string | null;
}

const MAX_MONTHS = 1200;

function growth(rate: number, months: number): number {
  return (1 + rate / 12) ** months;
}

/** Future value of `current` plus level monthly contributions at month end. */
export function futureValue(currentCents: number, monthlyCents: number, annualReturn: number, months: number): number {
  const r = annualReturn / 12;
  const g = growth(annualReturn, months);
  const fv = r === 0 ? currentCents + monthlyCents * months : currentCents * g + monthlyCents * ((g - 1) / r);
  return Math.round(fv);
}

export function projectGoal(goal: Goal, monthlyContributionCents: number, asOf: string): Projection {
  const rate = goal.annualReturn ?? 0;
  const months = monthsBetween(asOf, goal.targetDate);
  const atTarget = futureValue(goal.currentCents, monthlyContributionCents, rate, months);
  let reached: number | null = null;
  if (goal.currentCents >= goal.targetCents) reached = 0;
  else if (monthlyContributionCents > 0 || rate > 0) {
    let bal = goal.currentCents;
    for (let m = 1; m <= MAX_MONTHS; m++) {
      bal = bal * (1 + rate / 12) + monthlyContributionCents;
      if (bal >= goal.targetCents) {
        reached = m;
        break;
      }
    }
  }
  return {
    monthlyContributionCents,
    annualReturn: rate,
    monthsToTarget: months,
    projectedAtTargetDateCents: atTarget,
    shortfallCents: Math.max(0, goal.targetCents - atTarget),
    onTrack: atTarget >= goal.targetCents,
    monthsUntilReached: reached,
    projectedCompletionDate: reached === null ? null : addMonthsToDate(asOf, reached),
  };
}

/** Level monthly contribution needed to hit the target by the target date (0 if already on track). */
export function requiredMonthlyContribution(goal: Goal, asOf: string): number {
  const rate = goal.annualReturn ?? 0;
  const months = monthsBetween(asOf, goal.targetDate);
  if (goal.currentCents >= goal.targetCents) return 0;
  if (months <= 0) return goal.targetCents - goal.currentCents;
  const g = growth(rate, months);
  const r = rate / 12;
  const gap = goal.targetCents - goal.currentCents * g;
  if (gap <= 0) return 0;
  const annuity = r === 0 ? months : (g - 1) / r;
  return Math.ceil(gap / annuity);
}

export interface Scenario {
  label: string;
  monthlyContributionCents?: number;
  annualReturn?: number;
  targetDate?: string;
  extraLumpSumCents?: number;
}

export interface ScenarioResult {
  label: string;
  goal: Goal;
  requiredMonthlyContributionCents: number;
  projection: Projection;
}

/** What-if: each scenario overrides contribution, return, date and/or adds a lump sum. */
export function whatIf(goal: Goal, baseMonthlyCents: number, asOf: string, scenarios: Scenario[]): ScenarioResult[] {
  return [{ label: "baseline" } as Scenario, ...scenarios].map((s) => {
    const g: Goal = {
      ...goal,
      currentCents: goal.currentCents + (s.extraLumpSumCents ?? 0),
      targetDate: s.targetDate ?? goal.targetDate,
      annualReturn: s.annualReturn ?? goal.annualReturn ?? 0,
    };
    return {
      label: s.label,
      goal: g,
      requiredMonthlyContributionCents: requiredMonthlyContribution(g, asOf),
      projection: projectGoal(g, s.monthlyContributionCents ?? baseMonthlyCents, asOf),
    };
  });
}
