export function hasReachedMonthlyAllowance(sent: number, sentThisRun: number, allowance: number): boolean {
  return sent + sentThisRun >= allowance;
}