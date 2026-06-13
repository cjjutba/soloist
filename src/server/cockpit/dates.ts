/** First day of `now`'s month at UTC midnight (the paid-this-month floor). */
export function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** `now` minus `weeks` whole weeks (the momentum-chart window floor). */
export function weeksAgoUTC(now: Date, weeks: number): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d;
}
