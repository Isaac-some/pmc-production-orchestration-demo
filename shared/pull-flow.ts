/** Pull orchestration: references and decisions only; no material processing. */
import { processUnitCapacity } from "./production";
import { day } from "./types";
import type {
  ProductionNode,
  ProductionVersion,
  ProductionData,
  Report,
} from "./production";
export type FlowStage = { id: string; name: string };
export type FlowRule = {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
  value: string | number | boolean;
};
export type FlowResult = {
  id: string;
  externalId: string;
  quantity?: number;
  externalBatchId?: string;
  marker?: string;
  platform: string;
  platformRef: string;
  fields: Record<string, string | number | boolean>;
  unit: string;
  date: string;
  cost: number | null;
  sourceIds: string[];
  receiptId?: string;
  at: string;
};
export type PullReceipt = {
  id: string;
  requestId: string;
  signature: string;
  chainId: string;
  versionId: string;
  from: string;
  to: string;
  resultIds: string[];
  quantities?: Record<string, number>;
  results: FlowResult[];
  rules: FlowRule[];
  requiredFields: string[];
  at: string;
  actor: string;
};
export const defaultStages = (): FlowStage[] => [
  { id: "source", name: "获取资源" },
  { id: "process", name: "处理" },
  { id: "delivery", name: "交付" },
];
export const pipeKey = (chainId: string, from: string, to: string) =>
  `${chainId}:${from}:${to}`;
export function assertDag(
  ids: string[],
  edges: { from: string; to: string }[],
  label = "生产链路",
) {
  if (new Set(ids).size !== ids.length) throw Error(`${label}标识重复`);
  const degree = new Map(ids.map((id) => [id, 0]));
  const pairs = new Set<string>();
  for (const e of edges) {
    if (!degree.has(e.from) || !degree.has(e.to) || e.from === e.to)
      throw Error(`${label}连线须连接不同的现有节点`);
    const key = `${e.from}:${e.to}`;
    if (pairs.has(key)) throw Error("不能重复连接");
    pairs.add(key);
    degree.set(e.to, degree.get(e.to)! + 1);
  }
  const queue = ids.filter((id) => degree.get(id) === 0),
    order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of edges.filter((e) => e.from === id)) {
      degree.set(e.to, degree.get(e.to)! - 1);
      if (!degree.get(e.to)) queue.push(e.to);
    }
  }
  if (order.length !== ids.length)
    throw Error(`${label}不能形成循环，所有连线必须向前`);
  return order;
}
export function outputFields(
  v: ProductionVersion,
  id: string,
  visited = new Set<string>(),
): NonNullable<ProductionNode["resultFields"]> {
  if (visited.has(id)) return [];
  visited.add(id);
  const n = v.nodes.find((n) => n.id === id);
  if (!n) return [];
  if (n.kind !== "router") return n.resultFields || [];
  const fields = v.edges
    .filter((e) => e.to === id)
    .flatMap((e) => outputFields(v, e.from, new Set(visited)));
  return fields.filter(
    (f, i) => fields.findIndex((g) => g.key === f.key) === i,
  );
}
export function validateFlowTopology(v: ProductionVersion) {
  const policy = v.riskPolicy;
  if (
    policy &&
    ((policy.qualityTarget != null &&
      (!Number.isFinite(policy.qualityTarget) ||
        policy.qualityTarget < 0 ||
        policy.qualityTarget > 1)) ||
      (policy.staleAfterDays != null &&
        (!Number.isSafeInteger(policy.staleAfterDays) ||
          policy.staleAfterDays <= 0)) ||
      (policy.qualityField != null &&
        (typeof policy.qualityField !== "string" ||
          !policy.qualityField.trim())))
  )
    throw Error(
      "风险依据无效：合格率须为0至1，停滞阈值须为正整数天，质量字段须非空",
    );
  const order = assertDag(
    v.nodes.map((n) => n.id),
    v.edges,
  );
  return order;
}
export function validatePullGraph(v: ProductionVersion, published = true) {
  const order = validateFlowTopology(v);
  const stages = v.stages || [];
  if (stages.some((s) => !s.id || !s.name.trim() || s.name.length > 50))
    throw Error("请设置有效业务阶段");
  for (const e of v.edges)
    if (
      e.planningAdmissionRate != null &&
      (!Number.isFinite(e.planningAdmissionRate) ||
        e.planningAdmissionRate < 0 ||
        e.planningAdmissionRate > 1)
    )
      throw Error("计划准入率须为0至1之间的数值");
  for (const group of v.annotationGroups || []) {
    if (
      !group.id ||
      !group.name.trim() ||
      group.nodeIds.some((id) => !v.nodes.some((n) => n.id === id)) ||
      !Number.isFinite(group.position?.x) ||
      !Number.isFinite(group.position?.y) ||
      !(group.width > 0) ||
      !(group.height > 0)
    )
      throw Error("辅助范围配置无效");
  }
  for (const unit of v.processUnits || []) {
    if (
      !unit.id ||
      !unit.name.trim() ||
      !unit.outputUnit?.trim() ||
      !unit.steps.length ||
      (unit.bufferPercent != null &&
        (!Number.isFinite(unit.bufferPercent) ||
          unit.bufferPercent < 0 ||
          unit.bufferPercent > 1000)) ||
      new Set(unit.steps.map((s) => s.nodeId)).size !== unit.steps.length ||
      unit.nodeIds.some((id) => !v.nodes.some((n) => n.id === id)) ||
      unit.steps.some(
        (step) =>
          !unit.nodeIds.includes(step.nodeId) ||
          !(step.outputPerInput > 0) ||
          !Number.isFinite(step.outputPerInput) ||
          (step.dailyCapacity != null &&
            (!Number.isFinite(step.dailyCapacity) || step.dailyCapacity < 0)),
      )
    )
      throw Error("生产环节步骤、产能或转化关系无效");
  }
  for (const n of v.nodes) {
    if (n.stageId && !stages.some((s) => s.id === n.stageId))
      throw Error("节点须归属现有业务阶段");
    if (!["platform", "router"].includes(n.kind || ""))
      throw Error("请选择平台节点或流转节点");
    if (!n.title.trim() || n.title.length > 50)
      throw Error("节点名称必填且不超过50字");
    if (!n.flowUnit?.trim()) throw Error("请设置平台结果单位");
    if (
      n.routingMode &&
      !["demand", "ratio", "condition"].includes(n.routingMode)
    )
      throw Error("分流方式无效");
    if (n.routingMode && n.routingMode !== "demand" && n.kind !== "router")
      throw Error("只有判断节点可配置分配策略");
    if (n.routingMode === "ratio") {
      const branches = v.edges.filter((e) => e.from === n.id).map((e) => e.to);
      if (published && (!n.ratioPolicy || branches.length < 2))
        throw Error("请明确比例序列的支路顺序及起始支路");
      if (
        n.ratioPolicy &&
        (new Set(n.ratioPolicy.order).size !== branches.length ||
          n.ratioPolicy.order.length !== branches.length ||
          !n.ratioPolicy.order.every((id) => branches.includes(id)) ||
          !branches.includes(n.ratioPolicy.startBranch))
      )
        throw Error("比例序列须包含全部支路且指定有效起始支路");
      if (
        branches.some(
          (id) =>
            !Number.isSafeInteger(n.branchWeights?.[id]) ||
            n.branchWeights![id] <= 0 ||
            n.branchWeights![id] > 10000,
        )
      )
        throw Error("支路权重须为1至10000的整数");
    }
    if (n.kind === "router" && n.inputUnit && n.inputUnit !== n.flowUnit)
      throw Error("流转节点不转换单位，输入与输出单位须相同");
    const fields = n.resultFields || [];
    if (
      new Set(fields.map((f) => f.key)).size !== fields.length ||
      fields.some(
        (f) => !f.key.trim() || !["number", "text", "boolean"].includes(f.type),
      )
    )
      throw Error("平台字段名称或类型无效");
    if (published && n.kind === "platform" && !n.platformRef?.trim())
      throw Error(`${n.title}：请关联下游平台项目`);
  }
  if (v.output) {
    if (!v.nodes.some((n) => n.id === v.output)) throw Error("交付入口不存在");
    if (v.nodes.find((n) => n.id === v.output)?.kind !== "router")
      throw Error("正式交付汇总入口须为流转节点，按准入规则领取结果");
    if (v.edges.some((e) => e.from === v.output))
      throw Error("交付汇总入口不能再连接下游");
  }
  for (const e of v.edges) {
    const fields = outputFields(v, e.from);
    if (e.initiallyOpen != null && typeof e.initiallyOpen !== "boolean")
      throw Error("管道开关无效");
    for (const rule of e.rules || []) {
      const field = fields.find((f) => f.key === rule.field);
      if (!field) throw Error("筛选条件须使用上游平台已提供的字段");
      const allowed =
        field.type === "number"
          ? ["eq", "ne", "gt", "gte", "lt", "lte"]
          : field.type === "text"
            ? ["eq", "ne", "contains"]
            : ["eq", "ne"];
      if (
        !allowed.includes(rule.operator) ||
        rule.value == null ||
        String(rule.value).trim() === "" ||
        (field.type === "number" && !Number.isFinite(Number(rule.value))) ||
        (field.type === "boolean" && typeof rule.value !== "boolean")
      )
        throw Error("条件运算符或值无效");
    }
  }
  return order;
}
export function matchesRule(row: FlowResult, rule: FlowRule) {
  const value = row.fields[rule.field];
  if (value == null || value === "") return false;
  const rhs = typeof value === "number" ? Number(rule.value) : rule.value;
  switch (rule.operator) {
    case "eq":
      return value === rhs;
    case "ne":
      return value !== rhs;
    case "contains":
      return typeof value === "string" && value.includes(String(rhs));
    case "gt":
      return typeof value === "number" && value > Number(rhs);
    case "gte":
      return typeof value === "number" && value >= Number(rhs);
    case "lt":
      return typeof value === "number" && value < Number(rhs);
    case "lte":
      return typeof value === "number" && value <= Number(rhs);
  }
}
/** Aggregated lots and old individual rows share one quantity contract. */
export const rowQuantity = (row: FlowResult): number => row.quantity ?? 1;
export const flowQuantity = (rows: FlowResult[]): number =>
  rows.reduce((sum, row) => sum + rowQuantity(row), 0);
/** Shanghai calendar-day allowance for the first step of an explicit serial unit. */
export function processUnitPullAllowance(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  to: string,
  today = day(),
) {
  const units = (v.processUnits || []).filter(
    (u) => u.steps.length >= 2 && u.steps[0].nodeId === to,
  );
  if (!units.length)
    return {
      limit: null,
      remaining: null,
      unknown: false,
      reason: "不适用：不是串行环节首步",
    };
  if (units.length !== 1)
    return {
      limit: null,
      remaining: null,
      unknown: true,
      reason: "多个生产环节共享首步，尚未启用容量限制",
    };
  const unit = units[0],
    capacity = processUnitCapacity(unit).dailyOutput,
    conversion = unit.steps.reduce((s, step) => s * step.outputPerInput, 1);
  if (capacity == null || !Number.isFinite(conversion) || conversion <= 0)
    return {
      limit: null,
      remaining: null,
      unknown: true,
      unitId: unit.id,
      reason: "产能或转化依据不完整，尚未启用容量限制",
    };
  const limit = Math.floor(
    (capacity / conversion) * (1 + (unit.bufferPercent ?? 0) / 100),
  );
  if (!Number.isSafeInteger(limit) || limit < 0)
    return {
      limit: null,
      remaining: null,
      unknown: true,
      unitId: unit.id,
      reason: "容量换算超出可计量范围，尚未启用容量限制",
    };
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const receipts = (p.pullReceipts || []).filter(
    (r) => r.chainId === chainId && r.to === to,
  );
  if (receipts.some((r) => Number.isNaN(Date.parse(r.at))))
    return {
      limit: null,
      remaining: null,
      unknown: true,
      unitId: unit.id,
      reason: "历史领取日期无效，尚未启用容量限制",
    };
  const used = receipts
    .filter((r) => formatter.format(new Date(r.at)) === today)
    .reduce(
      (sum, r) =>
        sum +
        r.resultIds.reduce(
          (s, id) =>
            s +
            (r.quantities?.[id] ??
              r.results.find((row) => row.id === id)?.quantity ??
              1),
          0,
        ),
      0,
    );
  return {
    limit,
    remaining: Math.max(0, limit - used),
    unknown: false,
    unitId: unit.id,
    reason: `按同环节短板限制首步投入，缓冲 ${unit.bufferPercent ?? 0}%，上海当日已领取 ${used}`,
  };
}
export function disposedQuantity(
  p: ProductionData,
  chainId: string,
  nodeId: string,
  resultId?: string,
) {
  return (p.flowDispositions || [])
    .filter(
      (d) =>
        d.chainId === chainId &&
        d.nodeId === nodeId &&
        d.action === "discard" &&
        (!resultId || d.resultId === resultId),
    )
    .reduce((sum, d) => sum + d.quantity, 0);
}
/** Only unclaimed, unreserved stock can leave the flow through disposition. */
export function unallocatedQuantity(
  p: ProductionData,
  chainId: string,
  nodeId: string,
  row: FlowResult,
) {
  const assignments = (p.flowAssignments || []).filter(
    (a) =>
      a.chainId === chainId && a.nodeId === nodeId && a.resultId === row.id,
  );
  const reserved = [...new Set(assignments.map((a) => a.to))].reduce(
    (sum, to) =>
      sum +
      Math.max(
        0,
        assignments
          .filter((a) => a.to === to)
          .reduce((s, a) => s + (a.quantity ?? 1), 0) -
          Math.max(
            0,
            claimedQuantity(p, chainId, nodeId, row.id, to) -
              assignmentBaseline(p, chainId, nodeId, row.id, to),
          ),
      ),
    0,
  );
  return Math.max(
    0,
    rowQuantity(row) -
      claimedQuantity(p, chainId, nodeId, row.id) -
      reserved -
      disposedQuantity(p, chainId, nodeId, row.id),
  );
}
export function claimedQuantity(
  p: ProductionData,
  chainId: string,
  from: string,
  resultId?: string,
  to?: string,
): number {
  return (p.pullReceipts || [])
    .filter(
      (r) => r.chainId === chainId && r.from === from && (!to || r.to === to),
    )
    .reduce(
      (sum, r) =>
        sum +
        r.resultIds
          .filter((id) => !resultId || id === resultId)
          .reduce(
            (n, id) =>
              n +
              (r.quantities?.[id] ??
                rowQuantity(r.results.find((x) => x.id === id)!)),
            0,
          ),
      0,
    );
}
function assignmentBaseline(
  p: ProductionData,
  chainId: string,
  from: string,
  resultId: string,
  to: string,
) {
  return (
    (p.flowAssignments || []).find(
      (a) =>
        a.chainId === chainId &&
        a.nodeId === from &&
        a.resultId === resultId &&
        a.to === to,
    )?.claimedBefore ?? 0
  );
}
/** Claims made before a reservation existed must never be allocated again. */
function unreservedClaims(
  p: ProductionData,
  chainId: string,
  from: string,
  resultId: string,
) {
  const destinations = new Set(
    (p.pullReceipts || [])
      .filter(
        (r) =>
          r.chainId === chainId &&
          r.from === from &&
          r.resultIds.includes(resultId),
      )
      .map((r) => r.to),
  );
  return [...destinations].reduce((sum, to) => {
    const reserved = (p.flowAssignments || [])
      .filter(
        (a) =>
          a.chainId === chainId &&
          a.nodeId === from &&
          a.resultId === resultId &&
          a.to === to,
      )
      .reduce((sum, a) => sum + (a.quantity ?? 1), 0);
    const baseline = assignmentBaseline(p, chainId, from, resultId, to);
    return (
      sum +
      baseline +
      Math.max(
        0,
        claimedQuantity(p, chainId, from, resultId, to) - baseline - reserved,
      )
    );
  }, 0);
}
export function pipeRows(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  from: string,
  to: string,
) {
  const edge = v.edges.find((e) => e.from === from && e.to === to),
    source = v.nodes.find((n) => n.id === from),
    target = v.nodes.find((n) => n.id === to);
  const assignments = (p.flowAssignments || []).filter(
    (a) => a.chainId === chainId && a.nodeId === from,
  );
  const rows = (source?.flowResults || []).map((row) => {
    const own = assignments.filter((a) => a.resultId === row.id && a.to === to),
      others = assignments.filter((a) => a.resultId === row.id && a.to !== to);
    const allocated = own.reduce((sum, a) => sum + (a.quantity ?? 1), 0);
    const usesAssignment =
      !!source?.routingMode && source.routingMode !== "demand";
    const assignedTotal =
      allocated + others.reduce((sum, a) => sum + (a.quantity ?? 1), 0);
    const freeQuantity = Math.max(
      0,
      rowQuantity(row) -
        assignedTotal -
        disposedQuantity(p, chainId, from, row.id),
    );
    const quantity = usesAssignment ? allocated : allocated + freeQuantity;
    const reason =
      !quantity && (usesAssignment || others.length > 0)
        ? others.length
          ? "已分配至其他支路"
          : "尚未分配：缺字段、无匹配或多分支命中"
        : !edge || !target
          ? "连接不存在"
          : row.unit !== (target.inputUnit || target.flowUnit)
            ? "单位不一致"
            : (target.requiredFields || []).some(
                  (f) => row.fields[f] == null || row.fields[f] === "",
                )
              ? "缺少必要字段"
              : !own.length &&
                  !(edge.rules || []).every((rule) => matchesRule(row, rule))
                ? "不满足筛选条件"
                : "";
    const ownClaimed = Math.max(
      0,
      claimedQuantity(p, chainId, from, row.id, to) -
        assignmentBaseline(p, chainId, from, row.id, to),
    );
    const remainingQuantity =
      Math.max(0, allocated - ownClaimed) +
      (usesAssignment
        ? 0
        : Math.max(
            0,
            freeQuantity - unreservedClaims(p, chainId, from, row.id),
          ));
    return {
      row,
      quantity,
      remainingQuantity,
      taken: remainingQuantity === 0,
      reason,
    };
  });
  return {
    rows,
    eligible: rows.filter((x) => !x.reason),
    available: rows.filter((x) => !x.reason && !x.taken),
    availableQuantity: rows
      .filter((x) => !x.reason)
      .reduce((sum, x) => sum + x.remainingQuantity, 0),
    open:
      !!edge &&
      !source?.retiredAt &&
      !target?.retiredAt &&
      (p.pipeGates?.[pipeKey(chainId, from, to)] ?? edge.initiallyOpen ?? true),
  };
}
export function resultReports(n: ProductionNode, terminal: boolean): Report[] {
  const groups = new Map<string, FlowResult[]>();
  for (const r of n.flowResults || [])
    groups.set(r.date, [...(groups.get(r.date) || []), r]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      input: flowQuantity(rows),
      output: flowQuantity(rows),
      production: flowQuantity(rows),
      processing: 0,
      eliminated: 0,
      cost:
        n.kind === "router"
          ? 0
          : rows.every((r) => r.cost != null)
            ? rows.reduce((a, r) => a + r.cost!, 0)
            : 0,
      kind: "production",
      note: terminal ? "交付准入结果" : "平台已登记结果",
      at: rows[0].at,
      selected: [`flow-${n.id}`],
    }));
}

/** Allocate arrivals at a judgement node; never claim or execute a downstream task. */
export function allocateArrivals(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  nodeId: string,
  at: string,
) {
  const n = v.nodes.find((n) => n.id === nodeId);
  if (!n || n.kind !== "router" || !n.routingMode || n.routingMode === "demand")
    return;
  const branches = v.edges.filter((e) => e.from === nodeId),
    assignments = (p.flowAssignments ||= []);
  for (const row of n.flowResults || []) {
    const assigned = assignments
      .filter(
        (a) =>
          a.chainId === chainId && a.nodeId === nodeId && a.resultId === row.id,
      )
      .reduce((sum, a) => sum + (a.quantity ?? 1), 0);
    const quantity =
      rowQuantity(row) -
      assigned -
      unreservedClaims(p, chainId, nodeId, row.id) -
      disposedQuantity(p, chainId, nodeId, row.id);
    if (quantity <= 0) continue;
    if (n.routingMode === "ratio") {
      if (!n.ratioPolicy) continue;
      const order = n.ratioPolicy.order;
      const sequence = order.flatMap((id) =>
        Array.from({ length: n.branchWeights?.[id] || 1 }, () => id),
      );
      const key = `${chainId}:${nodeId}`,
        cursors = (p.flowCursors ||= {});
      let cursor = cursors[key] ?? sequence.indexOf(n.ratioPolicy.startBranch);
      const counts = new Map(
        order.map((id) => [
          id,
          Math.floor(quantity / sequence.length) * (n.branchWeights?.[id] || 1),
        ]),
      );
      for (let i = 0; i < quantity % sequence.length; i++) {
        const dest =
          sequence[((cursor % sequence.length) + i) % sequence.length];
        counts.set(dest, (counts.get(dest) || 0) + 1);
      }
      cursors[key] = Number.isSafeInteger(cursor + quantity)
        ? cursor + quantity
        : ((cursor % sequence.length) + (quantity % sequence.length)) %
          sequence.length;
      for (const [to, quantity] of counts)
        if (quantity)
          assignments.push({
            chainId,
            nodeId,
            resultId: row.id,
            to,
            quantity,
            claimedBefore:
              assignments.find(
                (a) =>
                  a.chainId === chainId &&
                  a.nodeId === nodeId &&
                  a.resultId === row.id &&
                  a.to === to,
              )?.claimedBefore ??
              claimedQuantity(p, chainId, nodeId, row.id, to),
            versionId: v.id,
            at,
            mode: "ratio",
          });
    } else {
      const matches = branches.filter((e) => {
        const target = v.nodes.find((n) => n.id === e.to)!;
        return (
          row.unit === (target.inputUnit || target.flowUnit) &&
          (target.requiredFields || []).every(
            (f) => row.fields[f] != null && row.fields[f] !== "",
          ) &&
          (e.rules || []).every((rule) => matchesRule(row, rule))
        );
      });
      if (matches.length === 1)
        assignments.push({
          chainId,
          nodeId,
          resultId: row.id,
          to: matches[0].to,
          quantity,
          claimedBefore:
            assignments.find(
              (a) =>
                a.chainId === chainId &&
                a.nodeId === nodeId &&
                a.resultId === row.id &&
                a.to === matches[0].to,
            )?.claimedBefore ??
            claimedQuantity(p, chainId, nodeId, row.id, matches[0].to),
          versionId: v.id,
          at,
          mode: "condition",
        });
    }
  }
}
