import type { State, Task, Business } from "./types";
export const DATA_TYPES = [
  "图像",
  "图片",
  "视频",
  "音频",
  "文本",
  "3D",
  "具身智能",
  "题库",
  "交互",
  "代码",
  "其他",
];
export const PROJECT_STAGES = [
  "ESTABLISHED",
  "FORMAL_DELIVERY",
  "CUSTOMER_ACCEPTANCE",
  "SUPPLEMENT_DELIVERY",
  "INITIATE_CLOSE",
  "CLOSE",
  "CLOSED",
];
export const OPPORTUNITY_STAGES = [
  "DEMO_DELIVERY",
  "DEMO_FEEDBACK",
  "INITIATE_PROJECT",
];
export function currentBlockers(task: Task) {
  const comments = task.comments.filter(
    (x) => !x.deleted && x.blockers?.length,
  );
  const last = comments.at(-1);
  return last
    ? (last.blockers as string[])
        .filter((x) => !last.resolvedUsers?.includes(x))
        .map((userId) => ({
          taskId: task.id,
          commentId: last.id,
          userId,
          title: task.title,
        }))
    : [];
}
export function businessBlockers(s: State, b: Business) {
  return s.tasks
    .filter((t) => t.businessId === b.id && t.stage === b.stage)
    .flatMap(currentBlockers);
}
export function draftKey(actorId: string, businessId: string, action: string) {
  return [actorId, businessId, action].join(":");
}
export function mentionsIn(text: string, users: State["users"], symbol = "@") {
  return users
    .filter((u) =>
      new RegExp(
        "(^|[^\\w@])" +
          symbol +
          u.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "(?=$|[\\s，。；、!?！？:#@])",
      ).test(text),
    )
    .map((u) => u.id);
}
export const IMPORT_TEMPLATE_HEADERS = [
  "销售易商机ID",
  "商机状态",
  "项目名称",
  "项目立项编号",
  "需求文档",
  "生产方案",
  "项目管理文档",
  "正式交付存储地址",
  "正式交付量级",
  "单位",
  "正式交付截止时间",
  "项目经理",
  "售前",
  "销售",
];
/** Strict CSV parser: preserve quoted commas/newlines and reject malformed rows. */
export function parseImportCSV(input: string) {
  if (new TextEncoder().encode(input).length > 800000)
    throw Error("CSV不能超过800KB");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const source = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (ch !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === "\r" && source[i + 1] === "\n") i++;
      }
    } else {
      if (closed && ch.trim()) throw Error("CSV引号后有无效内容");
      if (ch === '"') throw Error("CSV字段中的引号须按双引号转义");
      cell += ch;
    }
  }
  if (quoted) throw Error("CSV引号未闭合");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 2001)
    throw Error("每次导入需要1—2000条数据");
  const headers = rows.shift()!;
  if (headers.some((x) => !x) || new Set(headers).size !== headers.length)
    throw Error("表头不能为空或重复");
  return {
    headers,
    rows: rows.map((values, i) => {
      if (values.length > headers.length)
        throw Error(`第${i + 2}行列数超出表头`);
      return Object.fromEntries(headers.map((h, n) => [h, values[n] || ""]));
    }),
  };
}
