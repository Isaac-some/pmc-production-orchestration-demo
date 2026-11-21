import { day, addDays } from "./types";
/** Current Shanghai calendar week starts Monday; this is not the previous report week. */
export function workspacePeriodStart(period: string, today = day()) {
  if (period === "全部") return "";
  if (period === "本周") {
    const weekday = new Date(today + "T12:00:00Z").getUTCDay();
    return addDays(-((weekday + 6) % 7), today);
  }
  return addDays(-29, today);
}
