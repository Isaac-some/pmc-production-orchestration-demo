import {
  type State,
  type Command,
  type Context,
  requireValue,
  record,
} from "../../shared/types";
import { reportRows } from "../../shared/reports";
export function handleReports(s: State, cmd: Command, c: Context): any {
  if (!cmd.type.startsWith("reports.")) return undefined;
  const p = cmd.payload || {},
    archives = s.settings.reportArchives || [];
  if (cmd.type === "reports.read")
    return p.id ? archives.find((a: any) => a.id === p.id) || null : archives;
  if (cmd.type !== "reports.archive") return undefined;
  requireValue(
    c.actor.role === "pm" || c.actor.role === "approver",
    "当前身份不能归档报告",
  );
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(p.start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.end) &&
      p.start < p.end &&
      [p.start, p.end].every((v) => {
        const d = new Date(v + "T12:00:00Z");
        return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }),
    "请选择有效报告区间",
  );
  requireValue(
    p.kind === "project" || p.kind === "opportunity",
    "报告类型无效",
  );
  const title = String(p.title || "").trim(),
    note = String(p.note || "").trim();
  requireValue(title.length <= 120 && note.length <= 4000, "标题或说明过长");
  const version =
    archives.filter((a: any) => a.start === p.start && a.end === p.end).length +
    1;
  const snapshot = {
    id: c.id(),
    start: p.start,
    end: p.end,
    title,
    note,
    kind: p.kind,
    version,
    at: c.now,
    actor: c.actor.name,
    rows: structuredClone(reportRows(s)),
    filters: {},
  };
  s.settings.reportArchives = [snapshot, ...archives];
  record(
    s,
    c,
    "归档报告",
    `${p.start} 至 ${p.end} V${version} · ${title || "业务跟进报告"}`,
  );
  return { id: snapshot.id };
}
