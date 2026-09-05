export function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addWeeksToLocalDate(source: string | Date, weeks: number) {
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid appointment date");
  date.setDate(date.getDate() + weeks * 7);
  return formatLocalDateInput(date);
}

export function rangesOverlap(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date) {
  return firstStart < secondEnd && secondStart < firstEnd;
}
