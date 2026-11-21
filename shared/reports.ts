/** Report snapshots share the local facts and never copy external test-environment data. */
import { type State, stageNames } from "./types";
import { riskSummary } from "./risk";
import dayjs from "dayjs";
/** Presentation only: explicit followup risk wins without editing system-risk facts. */
export function displayProjectRisk(s: State, b: State["businesses"][number]) {
  const manual = b.common?.deliveryRisk || b.common?.riskLevel;
  const map: Record<string, string | null> = {
    无风险: null,
    NONE: null,
    高风险: "P0",
    high: "P0",
    P0: "P0",
    中风险: "P1",
    medium: "P1",
    P1: "P1",
    低风险: "P2",
    low: "P2",
    P2: "P2",
  };
  return manual && Object.hasOwn(map, manual)
    ? map[manual]
    : riskSummary(s, b.id).level;
}
const crmLabels: Record<string, string> = {
  L1: "L1潜在商机",
  L2: "L2活跃商机",
  L3: "L3需求验证",
  L4: "L4方案验证",
  L5: "L5商务谈判",
  WON: "赢单",
  LOST: "输单",
};
function normalizedCrmStatus(value: unknown) {
  const text = String(value || "").trim();
  return (
    crmLabels[
      text.match(/^L[1-5]/i)?.[0].toUpperCase() || text.toUpperCase()
    ] || text
  );
}
/** Manual CRM stage is independent from the local business workflow stage. */
export function reportCrmStage(b: any) {
  return normalizedCrmStatus(b.common?.crmStage || b.common?.salesStatus);
}
export function reportRows(s: State) {
  return s.businesses.map((b) => ({
    ...b,
    ownerName: s.users.find((u) => u.id === b.ownerId)?.name || "—",
    presalesName: s.users.find((u) => u.id === b.presalesId)?.name || "—",
    salesName: s.users.find((u) => u.id === b.salesId)?.name || "—",
    stageLabel:
      b.kind === "opportunity" && reportCrmStage(b)
        ? reportCrmStage(b)
        : stageNames[b.stage] || b.stage,
    riskLevel: displayProjectRisk(s, b),
    followups: s.followups
      .filter((f) => f.businessId === b.id && !f.deleted)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => ({
        id: f.id,
        text: f.text,
        createdAt: f.createdAt,
        actor: f.actor,
      })),
  }));
}
export function reportPeriod(period: string, today: string) {
  const d = new Date(today + "T12:00:00Z");
  if (period === "quarter") {
    const m = Math.floor(d.getUTCMonth() / 3) * 3;
    return [
      new Date(Date.UTC(d.getUTCFullYear(), m, 1)).toISOString().slice(0, 10),
      new Date(Date.UTC(d.getUTCFullYear(), m + 3, 1))
        .toISOString()
        .slice(0, 10),
    ];
  }
  const end = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000),
    start = new Date(end.getTime() - 7 * 86400000);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
export function filteredReportRows(rows: any[], kind: string, q: any) {
  return rows.filter(
    (b) =>
      b.kind === kind &&
      (!q.search ||
        (b.name + " " + b.pid + " " + b.crmId)
          .toLowerCase()
          .includes(q.search.toLowerCase())) &&
      (!q.person ||
        (kind === "project" ? b.ownerId : b.presalesId) === q.person) &&
      (!q.sales || b.salesId === q.sales) &&
      (!q.dataType || b.dataTypes.includes(q.dataType)) &&
      (!q.status?.length ||
        q.status.some(
          (status: string) =>
            normalizedCrmStatus(status) === reportCrmStage(b) ||
            normalizedCrmStatus(status) === normalizedCrmStatus(b.stage),
        )),
  );
}

/** One ordered column contract for both the visible table and downloaded files. */
export function reportColumnTitles(kind: string, merged = false): string[] {
  const followups = merged ? ["跟进记录"] : ["区间内跟进", "历史跟进"];
  return kind === "project"
    ? ["项目名称", "DDL", "数据类型", "项目经理", ...followups]
    : [
        "提报日期",
        "区域",
        "售前",
        "素材类型",
        "销售",
        "项目名称",
        "需求 brief",
        ...followups,
        "承诺/争取",
        "需求量级",
        "进展状态",
      ];
}

export function reportFollowups(
  b: any,
  start: string,
  end: string,
  which: "current" | "history" | "merged",
) {
  return (b.followups || []).filter((f: any) => {
    const date = f.createdAt.slice(0, 10);
    return which === "merged"
      ? date < end
      : which === "current"
        ? date >= start && date < end
        : date < start;
  });
}

export function reportFollowupTime(createdAt: string) {
  return dayjs(createdAt).format("MM/DD HH:mm");
}

/** Exports all followups in the selected table group; preview collapsing never drops records. */
export function reportExportTable(
  bs: any[],
  kind: string,
  options: { start: string; end: string; merged?: boolean },
) {
  const { start, end, merged = false } = options;
  const followupCell = (b: any, which: "current" | "history" | "merged") => {
    const fs = reportFollowups(b, start, end, which);
    return fs.length
      ? fs
          .map((f: any) => reportFollowupTime(f.createdAt) + "\n" + f.text)
          .join("\n\n")
      : "暂无记录";
  };
  return {
    headers: reportColumnTitles(kind, merged),
    rows: bs.map((b) => {
      const code = kind === "project" ? b.pid : b.crmId || b.pid;
      const name = b.name + (code == null || code === "" ? "" : "\n" + code);
      const fs = merged
        ? [followupCell(b, "merged")]
        : [followupCell(b, "current"), followupCell(b, "history")];
      return kind === "project"
        ? [
            name,
            b.deadline || "",
            (b.dataTypes || []).join("、"),
            b.ownerName || "",
            ...fs,
          ]
        : [
            (b.createdAt || "").slice(0, 10),
            b.common?.region || "—",
            b.presalesName || "",
            (b.dataTypes || []).join("、"),
            b.salesName || "",
            name,
            b.description || "",
            ...fs,
            b.common?.commitment || "—",
            b.target ?? "—",
            b.stageLabel || "",
          ];
    }),
  };
}
