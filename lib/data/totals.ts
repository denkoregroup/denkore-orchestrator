export function totalCost(steps: Array<{ cost_usd: number | null }>): number {
  return steps.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0);
}
