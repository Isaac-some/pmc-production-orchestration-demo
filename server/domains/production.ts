/** F08–F12 authoritative commands. Simulation never contacts production platforms. */
import {
  type State,
  type Command,
  type Context,
  type Business,
  mutable,
  requireValue as ok,
  record,
  day,
  addDays,
} from "../../shared/types";
import { businessBlockers } from "../../shared/process";
import { handlePullFlow } from "./pull-flow";
import {
  allocateArrivals,
  defaultStages,
  validatePullGraph,
} from "../../shared/pull-flow";
import {
  platforms,
  latest,
  productionData,
  productionFacts,
  deliveryOptions,
  acceptanceOptions,
  deliverySnapshot,
  acceptanceSnapshot,
  reconciliationSnapshot,
  conditionFields,
  conditionOperators,
  statisticalUpstream,
  scopeKey,
  nodeDays,
  type ProductionVersion,
  type ProductionNode,
  type Chain,
  type ProductionData,
} from "../../shared/production";
export { productionFacts };
const integer = (v: any, label: string, min = 0) => {
  const n = Number(v);
  ok(
    /^\d+$/.test(String(v)) && Number.isSafeInteger(n) && n >= min,
    `${label}须为${min ? "正" : "非负"}安全整数`,
  );
  return n;
};
const date = (v: string) => {
  ok(
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v)) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "日期无效",
  );
  return v;
};
const reason = (v: any, min = 1) => {
  ok(String(v || "").trim().length >= min, `请填写至少 ${min} 字的操作依据`);
  return String(v).trim();
};
function audit(
  s: State,
  p: ProductionData,
  c: Context,
  id: string,
  action: string,
  detail: string,
  snapshot?: any,
) {
  const r = record(s, c, action, detail, id, snapshot);
  p.audit.unshift(r);
  p.costConfirmed = false;
}
function chain(p: ProductionData, id: string) {
  const ch = p.chains.find((x) => x.id === id);
  ok(ch, "链路不存在");
  return ch;
}
function version(ch: Chain, id?: string) {
  const v = ch.versions.find((v) => v.id === id) || latest(ch);
  ok(v, "编排版本不存在");
  return v;
}
function editable(ch: Chain, id?: string) {
  ok(!ch.voided, "作废链路只读");
  const v = version(ch, id);
  ok(v.id === latest(ch).id, "历史修订只读");
  return v;
}
function node(v: ProductionVersion, id: string) {
  const n = v.nodes.find((n) => n.id === id);
  ok(n, "节点不存在");
  return n;
}
const clone = <T>(v: T): T => structuredClone(v);
function blankVersion(
  b: Business,
  c: Context,
  target = b.target,
): ProductionVersion {
  return {
    id: c.id(),
    revision: 1,
    name: "",
    createdAt: c.now,
    target,
    start: day(),
    deadline: b.deadline,
    prepEnd: "",
    strategy: "estimate",
    trialSize: 100,
    preset: 100,
    ramp: { enabled: false, end: "", daily: 100 },
    nodes: [],
    edges: [],
    inputs: [],
    output: "",
    allocations: {},
    confirmedAt: "",
    status: "DRAFT",
    startedAt: "",
    pausedAt: "",
    baseline: null,
    baselineHistory: [],
    budgetSnapshot: null,
  };
}
function blankNode(
  platform: string,
  c: Context,
  index: number,
): ProductionNode {
  return {
    id: c.id(),
    title: platforms[platform],
    platform,
    note: "",
    taskId: "",
    selected: [],
    dailyPlan: null,
    position: { x: 60 + index * 310, y: 80 },
    reports: [],
    reportHistory: [],
    corrections: {},
    batches: [],
    finalConfirmed: false,
    scopeVersion: 0,
  };
}
export function topology(v: ProductionVersion) {
  const ids = new Set(v.nodes.map((n) => n.id));
  ok(ids.size === v.nodes.length, "节点标识重复");
  ok(
    v.edges.every((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to),
    "连线必须连接不同的现有节点",
  );
  ok(
    new Set(v.edges.map((e) => e.from + ":" + e.to)).size === v.edges.length,
    "不能重复连接",
  );
  const indeg = new Map(v.nodes.map((n) => [n.id, 0])),
    next = new Map(v.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of v.edges) {
    indeg.set(e.to, indeg.get(e.to)! + 1);
    next.get(e.from)!.push(e.to);
  }
  const roots = [...indeg].filter(([, n]) => n === 0).map(([id]) => id),
    queue = [...roots],
    order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const to of next.get(id)!) {
      indeg.set(to, indeg.get(to)! - 1);
      if (!indeg.get(to)) queue.push(to);
    }
  }
  ok(order.length === ids.size, "生产链路不能形成循环");
  return {
    order,
    roots,
    next,
    linear:
      v.edges.length === v.nodes.length - 1 &&
      v.nodes.every(
        (n) =>
          v.edges.filter((e) => e.to === n.id).length <= 1 &&
          v.edges.filter((e) => e.from === n.id).length <= 1,
      ),
  };
}
function validateGraph(v: ProductionVersion, p: ProductionData) {
  const g = topology(v);
  if (v.mode === "pull") {
    validatePullGraph(v);
    return g;
  }
  integer(v.target, "版本目标", 1);
  ok(
    /^\d+(?:\.\d{1,4})?$/.test(String(v.preset)) &&
      Number.isFinite(v.preset) &&
      v.preset > 0 &&
      v.preset <= 100,
    "预估转化率须大于0且不超过100%",
  );
  if (v.strategy === "trial") integer(v.trialSize, "试跑样本量", 1);
  date(v.start);
  date(v.deadline);
  ok(v.deadline >= v.start, "截止日不能早于开始日");
  if (v.prepEnd) {
    date(v.prepEnd);
    ok(v.prepEnd <= v.deadline, "筹备结束日不能晚于截止日");
  }
  ok(
    v.nodes.length >= 2 && v.inputs.length > 0 && v.output,
    "至少添加两个节点并设置输入源及唯一最终输出",
  );
  ok(!v.inputs.includes(v.output), "输入源与最终输出不能相同");
  ok(
    v.nodes.some((n) => n.id === v.output && n.platform !== "COLLECTION") &&
      v.inputs.every((id) =>
        v.nodes.some((n) => n.id === id && n.platform !== "COLLECTION"),
      ),
    "输入源与最终输出必须是可统计节点",
  );
  if (v.ramp.enabled) {
    date(v.ramp.end);
    ok(
      v.ramp.end >= (v.prepEnd && v.prepEnd > v.start ? v.prepEnd : v.start) &&
        v.ramp.end <= v.deadline,
      "爬坡结束日须在正式生产周期内",
    );
    integer(v.ramp.daily, "爬坡日计划", 1);
  }
  const realRoots = v.nodes
    .filter(
      (n) =>
        n.platform !== "COLLECTION" && !statisticalUpstream(v, n.id).length,
    )
    .map((n) => n.id);
  ok(
    realRoots.every((id) => v.inputs.includes(id)) &&
      v.inputs.every((id) => realRoots.includes(id)),
    "所有可统计源头节点均须设为输入",
  );
  ok(!v.edges.some((e) => e.from === v.output), "最终输出不能有下游");
  const reached = new Set([v.output]);
  let count = -1;
  while (count !== reached.size) {
    count = reached.size;
    for (const e of v.edges) if (reached.has(e.to)) reached.add(e.from);
  }
  ok(
    v.nodes.every((n) => reached.has(n.id)),
    "所有节点必须能流向最终输出",
  );
  const occupied = new Set<string>();
  for (const n of v.nodes) {
    ok(platforms[n.platform], "节点平台无效");
    if (n.dailyPlan != null) integer(n.dailyPlan, "手工日计划", 1);
    ok(n.title.trim() && n.title.length <= 50, "节点名称必填且不超过50字");
    if (n.platform === "COLLECTION") continue;
    if (n.id !== v.output) reason(n.note);
    ok(n.taskId && n.selected.length, `${n.title}：请关联任务并选择产出范围`);
    const task = p.tasks.find(
      (t) => t.id === n.taskId && t.platform === n.platform,
    );
    ok(task, `${n.title}的任务不存在`);
    ok(
      n.selected.every((id) => task.details.some((d) => d.id === id)),
      "产出明细不存在",
    );
    for (const id of n.selected) {
      const k = n.platform + ":" + n.taskId + ":" + id;
      ok(!occupied.has(k), "本链路同一生产明细不能被两个节点使用");
      occupied.add(k);
    }
    const outs = v.edges.filter((e) => e.from === n.id);
    if (
      outs.length > 1 ||
      (outs.length && v.allocations[n.id]?.mode === "condition")
    ) {
      const a = v.allocations[n.id];
      ok(a?.confirmed, `${n.title}：请确认下游分流`);
      ok(["percent", "quantity", "condition"].includes(a.mode), "分流方式无效");
      if (a.mode !== "condition")
        outs.forEach((e) => integer(a.values[e.to], "分流值"));
      if (a.mode === "percent")
        ok(
          outs.reduce((sum, e) => sum + (a.values[e.to] || 0), 0) === 10000,
          "占比分配合计须为100%",
        );
      if (a.mode === "quantity") {
        const days = nodeDays(n);
        ok(
          days.some((d) => d.quantity != null),
          "尚无正式实际输出，不能按数量确认分流",
        );
        const total = days.reduce((sum, d) => sum + (d.quantity || 0), 0);
        ok(
          outs.reduce((sum, e) => sum + (a.values[e.to] || 0), 0) === total,
          "分流数量合计须等于正式实际输出",
        );
      }
      if (a.mode === "condition")
        for (const e of outs) {
          const raw = a.conditions[e.to],
            f = conditionFields[raw?.dataType]?.find(
              (f) => f.key === raw?.field,
            );
          ok(f, "请根据素材类型选择有效条件字段");
          ok(
            conditionOperators(f.type).includes(raw.operator),
            "运算符不适用于当前字段",
          );
          ok(
            raw.value != null &&
              String(raw.value).trim() !== "" &&
              (f.type !== "number" || Number.isFinite(Number(raw.value))),
            "请填写有效条件值",
          );
        }
    }
  }
  return g;
}
function syncFacts(ch: Chain, source: ProductionNode) {
  for (const v of ch.versions)
    for (const n of v.nodes)
      if (scopeKey(ch.id, n) === scopeKey(ch.id, source)) {
        n.reports = clone(source.reports);
        n.reportHistory = clone(source.reportHistory);
        n.corrections = clone(source.corrections);
        n.batches = clone(source.batches);
        n.finalConfirmed = source.finalConfirmed;
        n.scopeVersion = source.scopeVersion;
      }
  if (ch.draft)
    for (const n of ch.draft.nodes)
      if (scopeKey(ch.id, n) === scopeKey(ch.id, source))
        Object.assign(n, {
          reports: clone(source.reports),
          corrections: clone(source.corrections),
          batches: clone(source.batches),
          scopeVersion: source.scopeVersion,
        });
}
export function validateProductionTransition(
  s: State,
  b: Business,
  action: string,
  payload: any,
  c: Context,
) {
  if (b.kind !== "project") return;
  if (
    action === "START_FORMAL_DELIVERY" ||
    (b.stage === "ESTABLISHED" && action === "ADVANCE")
  )
    ok(b.budget > 0, "请先填写公共信息生产总预算");
  if (
    ["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY", "CUSTOMER_ACCEPTANCE"].includes(
      b.stage,
    ) &&
    [
      "ADVANCE",
      "SUBMIT_FORMAL_DELIVERY",
      "SUBMIT_SUPPLEMENT",
      "SUBMIT_CUSTOMER_ACCEPTANCE",
    ].includes(action)
  )
    ok(
      payload?.productionHandled === true,
      "请在生产管理中选择生产来源或客户验收批次提交",
    );
  if (
    ["INITIATE_CLOSE", "CLOSE"].includes(b.stage) &&
    ["ADVANCE", "SUBMIT_INITIATE_CLOSE", "SUBMIT_CLOSE"].includes(action)
  ) {
    const f = productionFacts(s, b.id);
    ok(f.accepted >= b.target, "客户累计接受量未达目标，不能结项");
    ok(productionData(s, b.id).costConfirmed, "请先在成本核算确认成本");
    ok(!f.issues.length, "存在生产来源重复，不能结项");
  }
}
/** Resolve only locally registered files; submitted names/sizes are untrusted. */
function deliveryEvidence(s: State, input: any) {
  ok(input.files == null || Array.isArray(input.files), "交付附件格式无效");
  const supplied = input.files || [];
  ok(supplied.length <= 10, "最多10个附件");
  const files = supplied.map((ref: any) => {
    const local = s.files.find((f) => f.id === ref?.id);
    ok(
      local &&
        Number.isSafeInteger(local.size) &&
        local.size > 0 &&
        local.size <= 50 * 1024 * 1024,
      "附件不存在或大小超限",
    );
    return clone(local);
  });
  ok(input.tos == null || typeof input.tos === "string", "TOS地址格式无效");
  const tos = String(input.tos || "").trim();
  ok(
    !tos ||
      (tos.length <= 2048 && /^tos:\/\/[^/?#\s]+\/[^/\s][^\s]*$/.test(tos)),
    "TOS地址须包含桶和路径",
  );
  ok(files.length || tos, "请添加正式交付附件或TOS地址");
  return { files, tos };
}
export function handleProduction(s: State, cmd: Command, c: Context): any {
  if (!cmd.type.startsWith("production.")) return undefined;
  if (cmd.type.startsWith("production.flow.")) return handlePullFlow(s, cmd, c);
  if (
    ![
      "createTask",
      "createChain",
      "budget",
      "confirmCost",
      "delivery",
      "acceptance",
      "reconcile",
      "void",
      "discard",
      "draft",
      "publish",
      "control",
      "baseline",
      "scope",
      "report",
      "correction",
      "batch",
    ].includes(cmd.type.slice(11))
  )
    return undefined;
  const action = cmd.type.slice(11);
  ok(
    action === "confirmCost"
      ? c.actor.role === "finance" || c.actor.role === "approver"
      : c.actor.role === "pm" || c.actor.role === "approver",
    "当前身份不能修改生产业务；成本核对身份仅可确认成本",
  );
  const x = cmd.payload,
    b = mutable(s, x.businessId, c),
    p = (s.production[b.id] = productionData(s, b.id));
  ok(b.kind === "project", "生产管理仅适用于项目");
  if (action === "createTask") {
    ok(
      platforms[x.platform] && !["COLLECTION", "FLOW"].includes(x.platform),
      "不支持该生产平台",
    );
    const count = integer(x.count || 3, "模拟明细数", 1);
    ok(count <= 100, "一次最多创建100条模拟明细");
    const raw = x.platformMeta || {};
    ok(
      !x.platformMeta ||
        (typeof x.platformMeta === "object" && !Array.isArray(x.platformMeta)),
      "平台项目信息格式无效",
    );
    const text = (value: any, max: number, label: string) => {
      const valueText = String(value ?? "").trim();
      ok(valueText.length <= max, label + "过长");
      return valueText;
    };
    const users = (value: any, label: string) => {
      ok(value == null || Array.isArray(value), label + "格式无效");
      const ids = [...new Set<string>(value || [])];
      ok(
        ids.every((id) => s.users.some((u) => u.id === id)),
        label + "人员不存在",
      );
      return ids;
    };
    const meta = {
      externalId: text(raw.externalId, 100, "下游项目ID"),
      description: text(raw.description, 500, "项目简介"),
      notificationLevel: raw.notificationLevel || "message",
      developers: users(raw.developers, "项目研发"),
      admins: users(raw.admins, "项目管理员"),
      bound: raw.bound === true,
      ownerId: c.actor.id,
    };
    ok(["message", "none"].includes(meta.notificationLevel), "通知方式无效");
    ok(
      !meta.bound ||
        (!["RESOURCE", "INTERNAL_SELECTION"].includes(x.platform) &&
          !!meta.externalId),
      "请选择有效的下游项目绑定信息",
    );
    const name = reason(x.name);
    ok(name.length <= 100, "任务名称最多100字");
    const id = c.id(),
      t = {
        id,
        platform: x.platform,
        name,
        meta,
        unit: x.unit || b.unit,
        createdAt: c.now,
        details: Array.from({ length: count }, (_, i) => ({
          id: `${id}-${i + 1}`,
          name: `模拟${i + 1}`,
          output: null,
          cost: null,
        })),
      };
    p.tasks.push(t);
    audit(s, p, c, b.id, "创建模拟平台任务", t.name);
    return t;
  }
  if (action === "createChain") {
    const name = reason(x.name);
    ok(
      name.length <= 50 &&
        !p.chains.some((ch) => ch.name.toLowerCase() === name.toLowerCase()),
      "链路名称重复或超过50字",
    );
    const id = c.id();
    let v = blankVersion(
      b,
      c,
      Math.max(1, b.target - productionFacts(s, b.id).accepted),
    );
    if (x.copyId) {
      const original = chain(p, x.copyId);
      v = clone(original.draft || latest(original));
      const ids = new Map(v.nodes.map((n) => [n.id, c.id()]));
      v.id = c.id();
      v.nodes = v.nodes.map((n) => ({
        ...n,
        id: ids.get(n.id)!,
        branchWeights: n.branchWeights
          ? Object.fromEntries(
              Object.entries(n.branchWeights).map(([id, weight]) => [
                ids.get(id)!,
                weight,
              ]),
            )
          : undefined,
        ratioPolicy: n.ratioPolicy
          ? {
              order: n.ratioPolicy.order.map((id) => ids.get(id)!),
              startBranch: ids.get(n.ratioPolicy.startBranch)!,
            }
          : undefined,
        reports: [],
        reportHistory: [],
        corrections: {},
        batches: [],
        finalConfirmed: false,
        scopeVersion: 0,
        flowResults: [],
      }));
      v.edges = v.edges.map((e) => ({
        ...e,
        from: ids.get(e.from)!,
        to: ids.get(e.to)!,
      }));
      v.annotationGroups = v.annotationGroups?.map((g) => ({
        ...g,
        id: c.id(),
        nodeIds: g.nodeIds.map((id) => ids.get(id)!),
      }));
      v.processUnits = v.processUnits?.map((u) => ({
        ...u,
        id: c.id(),
        nodeIds: u.nodeIds.map((id) => ids.get(id)!),
        steps: u.steps.map((step) => ({
          ...step,
          nodeId: ids.get(step.nodeId)!,
        })),
      }));
      v.inputs = v.inputs.map((id) => ids.get(id)!);
      v.output = ids.get(v.output) || "";
      v.allocations = Object.fromEntries(
        Object.entries(v.allocations).map(([from, a]) => [
          ids.get(from)!,
          {
            ...a,
            values: Object.fromEntries(
              Object.entries(a.values).map(([to, q]) => [ids.get(to)!, q]),
            ),
            conditions: Object.fromEntries(
              Object.entries(a.conditions).map(([to, q]) => [ids.get(to)!, q]),
            ),
          },
        ]),
      );
      v.confirmedAt = "";
      v.startedAt = "";
      v.baseline = null;
      v.baselineHistory = [];
      v.revision = 1;
      v.status = "DRAFT";
    }
    if (x.mode === "pull" && !x.copyId) {
      v.mode = "pull";
      v.stages = defaultStages();
    }
    p.chains.push({
      id,
      name,
      versions: [v],
      draft: null,
      voided: false,
      voidReason: "",
      budget: null,
      budgetHistory: [],
    });
    audit(s, p, c, b.id, x.copyId ? "复制生产链路" : "新建生产链路", name);
    return { chainId: id };
  }
  if (action === "budget") {
    ok(c.actor.role === "approver" || c.actor.role === "pm", "无预算修改权限");
    const amount = integer(x.amount, "预算（分）", 1);
    if (x.chainId) {
      const ch = chain(p, x.chainId);
      editable(ch);
      if (ch.budget != null && ch.budget !== amount) reason(x.reason, 5);
      ok(
        p.chains
          .filter((ch) => !ch.voided && ch.id !== x.chainId)
          .reduce((a, ch) => a + (ch.budget || 0), amount) <= b.budget,
        "链路预算分配不能超过项目总预算",
      );
      ch.budgetHistory.unshift({
        before: ch.budget,
        after: amount,
        at: c.now,
        actor: c.actor.name,
        reason: x.reason,
      });
      ch.budget = amount;
      latest(ch).budgetSnapshot = amount;
    } else {
      if (b.budget && b.budget !== amount) reason(x.reason, 5);
      ok(
        p.chains
          .filter((ch) => !ch.voided)
          .reduce((a, ch) => a + (ch.budget || 0), 0) <= amount,
        "总预算不能低于已分配预算",
      );
      p.budgetHistory.unshift({
        before: b.budget,
        after: amount,
        at: c.now,
        actor: c.actor.name,
        reason: x.reason,
      });
      b.budget = amount;
    }
    audit(s, p, c, b.id, "调整生产预算", x.reason || "首次填写");
    return {};
  }
  if (action === "confirmCost") {
    ok(
      c.actor.role === "finance" || c.actor.role === "approver",
      "仅成本核对或业务授权角色可确认成本",
    );
    ok(
      productionFacts(s, b.id).cost != null,
      "部分生产范围成本待回传，暂不能确认",
    );
    record(s, c, "确认生产成本", reason(x.reason), b.id);
    p.costConfirmed = true;
    return {};
  }
  if (action === "delivery") {
    ok(
      !businessBlockers(s, b).length,
      "当前阶段有 # 阻塞意见，请先完成对应任务",
    );
    ok(
      ["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY"].includes(b.stage),
      "当前流程不处于正式交付或补交付",
    );
    const snap = deliverySnapshot(s, b.id, x.scopes || [], x.ranges || {});
    ok(!snap.issues.length, snap.issues.join("；"));
    ok(
      x.fingerprint === snap.fingerprint,
      "生产来源或已交付数量已变化，请重新核对后提交",
    );
    ok(snap.rows.length, "所选来源没有尚未交付的有效日产出");
    for (const range of Object.values(x.ranges || {}) as any[]) {
      if (range.start) date(range.start);
      if (range.end) date(range.end);
    }
    const evidence = deliveryEvidence(s, x);
    const item = {
      id: c.id(),
      at: c.now,
      actor: c.actor.name,
      quantity: snap.quantity,
      unit: b.unit,
      rows: clone(snap.rows),
      fingerprint: snap.fingerprint,
      files: evidence.files,
      tos: evidence.tos,
      note: x.note || "",
      stage: b.stage,
    };
    p.deliveries.push(item);
    b.stage = "CUSTOMER_ACCEPTANCE";
    audit(
      s,
      p,
      c,
      b.id,
      "提交正式交付",
      `交付 ${item.quantity} ${b.unit}`,
      item,
    );
    return item;
  }
  if (action === "acceptance") {
    ok(
      !businessBlockers(s, b).length,
      "当前阶段有 # 阻塞意见，请先完成对应任务",
    );
    ok(b.stage === "CUSTOMER_ACCEPTANCE", "请先完成正式交付再登记客户验收");
    const snap = acceptanceSnapshot(s, b.id, x.keys || []);
    ok(snap.picked.length, "请选择客户验收批次");
    ok(!snap.issues.length, snap.issues.join("；"));
    ok(
      x.fingerprint === snap.fingerprint,
      "客户验收批次或交付余额已变化，请重新核对后提交",
    );
    const item = {
      id: c.id(),
      at: c.now,
      actor: c.actor.name,
      quantity: snap.quantity,
      rows: clone(snap.rows),
      fingerprint: snap.fingerprint,
    };
    p.acceptances.push(item);
    b.stage =
      snap.after === b.target ? "INITIATE_CLOSE" : "SUPPLEMENT_DELIVERY";
    audit(
      s,
      p,
      c,
      b.id,
      "登记客户验收",
      `本次 ${snap.quantity}，累计 ${snap.after}/${b.target} ${b.unit}`,
      item,
    );
    return item;
  }
  if (action === "reconcile") {
    reason(x.reason, 5);
    for (const range of Object.values(x.ranges || {}) as any[]) {
      if (range.start) date(range.start);
      if (range.end) date(range.end);
    }
    const snap = reconciliationSnapshot(
      s,
      b.id,
      x.deliveryId,
      x.scopes || [],
      x.ranges || {},
    );
    ok(snap.picked.length, "请选择原交付生产来源");
    ok(!snap.issues.length, snap.issues.join("；"));
    ok(
      x.fingerprint === snap.fingerprint,
      "历史记录或生产来源已变化，请重新核对后确认",
    );
    const previous = clone(snap.delivery);
    snap.delivery.rows = clone(snap.rows);
    snap.delivery.reconciliation = {
      reason: x.reason,
      actor: c.actor.name,
      at: c.now,
      previous,
    };
    let leftRows = clone(snap.acceptanceRows);
    for (const a of snap.originals) {
      let left = a.quantity;
      const allocated: any[] = [];
      for (const r of leftRows) {
        const q = Math.min(left, r.quantity);
        if (q) {
          allocated.push({ ...r, quantity: q });
          r.quantity -= q;
          left -= q;
        }
      }
      ok(left === 0, "历史验收分配不足");
      a.rows = allocated;
      a.reconciliation = { reason: x.reason, actor: c.actor.name, at: c.now };
    }
    audit(s, p, c, b.id, "核对历史交付来源", x.reason, {
      deliveryId: x.deliveryId,
      previous,
      after: clone(snap.delivery),
      acceptanceRows: snap.acceptanceRows,
    });
    return snap.delivery;
  }
  const ch = chain(p, x.chainId),
    v = editable(ch, x.versionId);
  if (action === "void") {
    ch.voidReason = reason(x.reason, 5);
    ch.voided = true;
    audit(s, p, c, b.id, "作废生产链路", ch.name + "；" + ch.voidReason);
    return {};
  }
  if (action === "discard") {
    ch.draft = null;
    return {};
  }
  if (action === "draft") {
    ok(
      v.mode !== "pull" && ch.draft?.mode !== "pull",
      "按需取数编排请使用专用草稿操作",
    );
    const draft = clone(x.value) as ProductionVersion;
    ok(draft.id === v.id, "草稿版本不匹配");
    topology(draft);
    ok(!draft.mode, "请通过转换操作创建按需取数编排");
    ok(!v.startedAt || draft.prepEnd === v.prepEnd, "启动后筹备日期锁定");
    for (const n of draft.nodes) {
      const existing = [...ch.versions]
        .reverse()
        .flatMap((v) => v.nodes)
        .find((old) => scopeKey(ch.id, old) === scopeKey(ch.id, n));
      if (existing)
        Object.assign(n, {
          reports: clone(existing.reports),
          reportHistory: clone(existing.reportHistory),
          corrections: clone(existing.corrections),
          batches: clone(existing.batches),
          finalConfirmed: existing.finalConfirmed,
          scopeVersion: existing.scopeVersion,
        });
      else
        Object.assign(n, {
          reports: [],
          reportHistory: [],
          corrections: {},
          batches: [],
          finalConfirmed: false,
          scopeVersion:
            [...ch.versions]
              .reverse()
              .flatMap((v) => v.nodes)
              .find((old) => old.id === n.id)?.scopeVersion || 0,
        });
    }
    ch.draft = draft;
    return {};
  }
  if (action === "publish") {
    const draft = clone(ch.draft || v);
    validateGraph(draft, p);
    if (v.confirmedAt) {
      draft.id = c.id();
      draft.revision = v.revision + 1;
      draft.startedAt = "";
      draft.pausedAt = "";
      draft.status = "CONFIRMED";
      draft.createdAt = c.now;
      ch.versions.push(draft);
    }
    draft.confirmedAt = c.now;
    draft.status = "CONFIRMED";
    draft.budgetSnapshot = ch.budget;
    if (!v.confirmedAt) Object.assign(v, draft);
    ch.draft = null;
    if (draft.mode === "pull")
      for (const n of latest(ch).nodes)
        allocateArrivals(p, ch.id, latest(ch), n.id, c.now);
    audit(
      s,
      p,
      c,
      b.id,
      "发布编排修订",
      `${ch.name} R${draft.revision}`,
      draft,
    );
    return { versionId: draft.id };
  }
  if (action === "control") {
    ok(!ch.draft && v.confirmedAt, "请先发布当前草稿");
    if (x.control === "pause") {
      ok(v.status === "RUNNING", "仅生产中链路可暂停");
      v.status = "PAUSED";
      v.pausedAt = c.now;
    } else {
      ok(v.deadline >= day(), "交付日期已过，请修改后发布新修订");
      ok(!v.prepEnd || v.prepEnd <= day(), "筹备尚未结束");
      ok(v.status !== "RUNNING", "已经生产中");
      v.status = "RUNNING";
      v.startedAt ||= c.now;
    }
    audit(s, p, c, b.id, "生产启停", `${ch.name} ${v.status}`);
    return {};
  }
  if (action === "baseline") {
    ok(
      v.mode !== "pull",
      "按需取数编排不自动倒推技术批次计划，请在下游平台维护",
    );
    ok(!ch.draft, "请先发布编排");
    const g = validateGraph(v, p);
    ok(g.linear, "并行/汇合图不支持自动基线倒推，请维护节点日计划");
    const start = v.prepEnd && v.prepEnd > v.start ? v.prepEnd : v.start,
      days =
        Math.floor((Date.parse(v.deadline) - Date.parse(start)) / 864e5) + 1;
    ok(days > 0, "正式生产周期无效");
    let demand = v.target;
    const rows: any[] = [];
    for (const id of [...g.order].reverse()) {
      const n = node(v, id);
      if (n.platform === "COLLECTION" || n.platform === "INTERNAL_SELECTION")
        continue;
      const source = n.reports.some((r) => r.kind === "production")
          ? "production"
          : "trial",
        rr = n.reports.filter((r) => r.kind === source),
        input = rr.reduce((a, r) => a + r.input, 0),
        out = rr.reduce((a, r) => a + r.output, 0);
      if (v.strategy === "trial") {
        integer(v.trialSize, "试跑样本量", 1);
        ok(input > 0 && out > 0, `${n.title}缺少有效试跑样本`);
      }
      const ratio = input ? out / input : v.preset / 100;
      ok(ratio > 0, "转化率必须大于0");
      const totalInput = Math.ceil(demand / ratio - 1e-8);
      ok(Number.isSafeInteger(totalInput), "倒推结果超出安全整数范围");
      rows.unshift({
        nodeId: id,
        title: n.title,
        totalInput,
        totalOutput: demand,
        ratio,
        dailyInput: n.dailyPlan || Math.ceil(totalInput / days),
        dailyOutput: Math.ceil(demand / days),
        ratioSource: input
          ? source === "trial"
            ? "试跑样本"
            : "正式上报"
          : "预设假设",
      });
      demand = totalInput;
    }
    if (v.baseline) v.baselineHistory.push(clone(v.baseline));
    v.baseline = {
      at: c.now,
      revision: v.baselineHistory.length + 1,
      start,
      formalStart: start,
      deadline: v.deadline,
      days,
      rows,
      ramp: clone(v.ramp),
    };
    audit(s, p, c, b.id, "发布生产基线", ch.name, clone(v.baseline));
    return v.baseline;
  }
  const working = ch.draft || v,
    n = node(working, x.nodeId);
  ok(
    working.mode !== "pull",
    "按需取数的结果与批次在下游平台维护，请使用对应入口",
  );
  if (action === "scope") {
    const task = p.tasks.find(
      (t) => t.id === x.taskId && t.platform === n.platform,
    );
    ok(task, "任务与节点平台不符");
    const ids = [...new Set<string>(x.selected || [])];
    ok(
      ids.length === x.selected?.length &&
        ids.length &&
        ids.every((id) => task.details.some((d) => d.id === id)),
      "请选择有效生产明细",
    );
    for (const old of [
      ...ch.versions.flatMap((v) => v.nodes),
      ...(ch.draft?.nodes || []),
    ])
      if (
        old.id !== n.id &&
        old.platform === n.platform &&
        old.taskId === task.id
      )
        ok(
          !old.selected.some((id) => ids.includes(id)),
          "本链路该明细已被其他节点选用",
        );
    if (x.expectedScopeVersion != null)
      ok(x.expectedScopeVersion === n.scopeVersion, "范围已被更新，请重新打开");
    if (working.output !== n.id) reason(x.note);
    if (
      n.taskId !== task.id ||
      n.selected.slice().sort().join("|") !== ids.slice().sort().join("|")
    ) {
      n.reportHistory.push(...n.reports);
      n.reports = [];
      n.corrections = {};
      ok(
        n.batches.every((batch) =>
          batch.selected.every((id) => ids.includes(id)),
        ),
        "移出的生产范围仍有验收批次，请先调整验收批次",
      );
    }
    n.taskId = task.id;
    n.selected = ids;
    n.note = x.note || "";
    if (x.finalConfirmed !== undefined) {
      ok(typeof x.finalConfirmed === "boolean", "验收确认状态无效");
      n.finalConfirmed = x.finalConfirmed;
    }
    n.scopeVersion++;
    if (!ch.draft) syncFacts(ch, n);
    audit(s, p, c, b.id, "保存节点产出范围", n.title);
    return {};
  }
  ok(!ch.draft, "请先发布编排再录入生产事实");
  if (action === "report") {
    ok(n.taskId && n.selected.length, "请先配置生产范围");
    const r = {
      date: date(x.date),
      input: integer(x.input, "输入"),
      output: integer(x.output, "合格输出"),
      production: integer(x.production, "生产总量"),
      processing: integer(x.processing || 0, "处理中"),
      eliminated: integer(x.eliminated || 0, "淘汰"),
      cost: integer(x.cost, "成本（分）"),
      kind: x.kind as "trial" | "production",
      note: reason(x.note),
      at: c.now,
      selected: [...n.selected],
    };
    ok(r.date <= day(), "不能回传未来日期");
    ok(["trial", "production"].includes(r.kind), "报告类型无效");
    ok(
      r.output <= r.production && r.processing + r.eliminated <= r.input,
      "合格输出不能超过生产量；处理中+淘汰不能超过输入",
    );
    const old = n.reports.filter((z) => z.kind === r.kind && z.date === r.date);
    n.reportHistory.push(...clone(old));
    n.reports = n.reports.filter((z) => z.kind !== r.kind || z.date !== r.date);
    n.reports.push(r);
    for (const key of [
      "input",
      "output",
      "production",
      "processing",
      "eliminated",
      "cost",
    ])
      ok(
        Number.isSafeInteger(n.reports.reduce((sum, r) => sum + r[key], 0)),
        "上报汇总超出安全范围",
      );
    syncFacts(ch, n);
    audit(s, p, c, b.id, "回放模拟平台日报", `${n.title} ${r.date}`, r);
    return {};
  }
  if (action === "correction") {
    ok(v.output === n.id, "仅末端节点可修正");
    const d = date(x.date);
    ok(d <= day(), "不能修正未来日期");
    ok(n.selected.length, "请先选择产出范围");
    const old = n.corrections[d];
    n.corrections[d] = {
      value: x.value == null ? null : integer(x.value, "修正产能"),
      reason: reason(x.reason),
      at: c.now,
      actor: c.actor.name,
      history: [...(old?.history || []), ...(old ? [old] : [])],
    };
    syncFacts(ch, n);
    audit(s, p, c, b.id, "修正有效日产能", `${n.title} ${d}`, n.corrections[d]);
    return {};
  }
  if (action === "batch") {
    ok(v.output === n.id, "仅末端节点维护客户验收批次");
    const old = n.batches.find((z) => z.id === x.id);
    if (x.remove) {
      ok(old && x.acknowledged, "请勾选知情确认");
      ok(
        !p.acceptances.some((a) =>
          (a.rows || []).some((r) => r.batchId === old.id),
        ),
        "已登记客户验收的批次不能删除",
      );
      n.batches = n.batches.filter((z) => z.id !== x.id);
    } else {
      const value = {
        id: old?.id || c.id(),
        name: reason(x.name),
        quantity: integer(x.quantity, "客户接受量"),
        feedback: reason(x.feedback),
        selected: x.selected === undefined ? [...n.selected] : x.selected,
        createdAt: old?.createdAt || c.now,
        at: c.now,
        actor: c.actor.name,
      };
      ok(
        Array.isArray(value.selected) &&
          value.selected.length > 0 &&
          new Set(value.selected).size === value.selected.length &&
          value.selected.every(
            (id: unknown) => typeof id === "string" && n.selected.includes(id),
          ),
        "本批验收关联明细必须为当前节点产出范围的非空子集，且不能重复",
      );
      value.selected = [...value.selected];
      ok(
        value.name.length <= 50 && value.selected.length,
        "批次名称最多50字，且须先选生产范围",
      );
      const used = p.acceptances
        .flatMap((a) => a.rows)
        .filter((r) => r.batchId === value.id)
        .reduce((a, r) => a + r.quantity, 0);
      ok(value.quantity >= used, "不能小于已登记验收数量");
      n.batches = old
        ? n.batches.map((z) => (z.id === old.id ? value : z))
        : [...n.batches, value];
    }
    n.finalConfirmed = false;
    syncFacts(ch, n);
    audit(
      s,
      p,
      c,
      b.id,
      x.remove ? "知情删除验收批次" : "保存验收批次",
      n.title,
    );
    return {};
  }
  throw Error("未知生产命令：" + action);
}
export function seedProduction(s: State) {
  for (const [index, b] of s.businesses
    .filter((b) => b.kind === "project")
    .entries()) {
    if (s.production[b.id]) continue;
    let sequence = 0;
    const c: Context = {
        actor: s.users[0],
        now: new Date().toISOString(),
        id: () => `prod-${b.id}-${++sequence}`,
      },
      p: ProductionData = {
        chains: [],
        tasks: [],
        deliveries: [],
        acceptances: [],
        audit: [],
        budgetHistory: [],
        costConfirmed: false,
      };
    s.production[b.id] = p;
    const v = blankVersion(b, c);
    v.target = b.target;
    v.confirmedAt = c.now;
    v.status = "RUNNING";
    v.startedAt = c.now;
    const ns = ["RESOURCE", "MACHINE_LABELING", "MANUAL_LABELING"].map(
      (key, i) => {
        const n = blankNode(key, c, i),
          tid = c.id();
        p.tasks.push({
          id: tid,
          platform: key,
          name: `${platforms[key]} · ${b.name}`,
          unit: b.unit,
          createdAt: c.now,
          details: [
            { id: tid + "-1", name: "演示明细 A", output: null, cost: null },
            { id: tid + "-2", name: "演示明细 B", output: null, cost: null },
          ],
        });
        n.taskId = tid;
        n.selected = [tid + "-1"];
        n.note = "全套虚拟演示数据";
        const terminal = ["INITIATE_CLOSE", "CLOSE", "CLOSED"].includes(
            b.stage,
          ),
          factor = terminal
            ? 1
            : index % 5 === 0
              ? 0.4
              : index % 5 === 1
                ? 0.7
                : 1,
          total = Math.floor(b.target * factor);
        for (let d = 7; d >= 1; d--) {
          const qty = Math.floor(total / 7) + (d <= total % 7 ? 1 : 0);
          n.reports.push({
            date: addDays(-d),
            input: Math.ceil(qty * 1.2),
            production: qty,
            output: qty,
            processing: 0,
            eliminated: 0,
            cost: Math.round(
              (((b.budget || 100000) * 0.35) / 21) *
                (index % 5 === 3 || index === 5 ? 4 : 1),
            ),
            kind: "production",
            note: "模拟平台日报",
            at: c.now,
            selected: [...n.selected],
          });
        }
        return n;
      },
    );
    v.nodes = ns;
    v.edges = ns.slice(1).map((n, i) => ({ from: ns[i].id, to: n.id }));
    v.inputs = [ns[0].id];
    v.output = ns[2].id;
    v.baseline = {
      at: c.now,
      revision: 1,
      start: addDays(-7),
      deadline: b.deadline,
      days: 14,
      rows: ns.map((n) => ({
        nodeId: n.id,
        title: n.title,
        dailyInput: Math.ceil(b.target / 14),
        dailyOutput: Math.ceil(b.target / 14),
        totalInput: b.target,
        totalOutput: b.target,
        ratio: 1,
      })),
    };
    const ch: Chain = {
      id: c.id(),
      name: "主生产链路",
      versions: [v],
      draft: null,
      voided: false,
      voidReason: "",
      budget: Math.round(b.budget * 0.8),
      budgetHistory: [],
    };
    p.chains.push(ch);
    if (index === 1) {
      const second = clone(ch),
        map = new Map(second.versions[0].nodes.map((n) => [n.id, c.id()]));
      second.id = c.id();
      second.name = "补充生产链路";
      ch.budget = Math.round(b.budget * 0.4);
      second.budget = Math.round(b.budget * 0.4);
      for (const [i, n] of second.versions[0].nodes.entries()) {
        const old = ns[i];
        n.id = map.get(n.id)!;
        n.selected = [n.taskId + "-2"];
        for (const [j, r] of n.reports.entries()) {
          const original = old.reports[j];
          for (const key of [
            "input",
            "output",
            "production",
            "cost",
          ] as const) {
            r[key] = Math.floor(original[key] / 2);
            original[key] -= r[key];
          }
          r.selected = [...n.selected];
        }
      }
      const sv = second.versions[0];
      sv.id = c.id();
      sv.edges = sv.edges.map((e) => ({
        from: map.get(e.from)!,
        to: map.get(e.to)!,
      }));
      sv.inputs = sv.inputs.map((id) => map.get(id)!);
      sv.output = map.get(sv.output)!;
      sv.baseline = null;
      p.chains.push(second);
    }
    if (index === 6) {
      const revision = clone(v);
      revision.id = c.id();
      revision.revision = 2;
      revision.createdAt = c.now;
      ch.versions.push(revision);
    }
    if (
      (index % 3 === 1 || index === 6) &&
      !["INITIATE_CLOSE", "CLOSE", "CLOSED"].includes(b.stage)
    ) {
      const n = ns[2];
      n.corrections[addDays(-1)] = {
        value: 0,
        reason: "真实为零的演示修正",
        at: c.now,
        actor: s.users[0].name,
        history: [],
      };
    }
    if (
      [
        "CUSTOMER_ACCEPTANCE",
        "SUPPLEMENT_DELIVERY",
        "INITIATE_CLOSE",
        "CLOSE",
        "CLOSED",
      ].includes(b.stage)
    ) {
      const opts = deliveryOptions(s, b.id),
        rows = opts.flatMap((o) =>
          o.days.map((d) => ({
            ...d,
            quantity: d.available,
            chainId: ch.id,
            versionId: v.id,
            versionName: "主生产链路 · R1",
            nodeId: o.node.id,
          })),
        );
      const qty = rows.reduce((a, r) => a + r.quantity, 0);
      p.deliveries.push({
        id: c.id(),
        at: c.now,
        actor: "演示项目经理",
        quantity: qty,
        unit: b.unit,
        rows,
        tos: "tos://demo/delivery",
        files: [],
      });
      const acceptQty = ["INITIATE_CLOSE", "CLOSE", "CLOSED"].includes(b.stage)
        ? b.target
        : Math.min(qty, Math.floor(b.target * 0.4));
      ns[2].batches = [
        {
          id: c.id(),
          name: "第一批客户反馈",
          quantity: acceptQty,
          feedback: "虚拟客户反馈；仅用于演示",
          selected: [...ns[2].selected],
          createdAt: c.now,
          at: c.now,
          actor: "演示项目经理",
        },
      ];
      if (b.stage !== "CUSTOMER_ACCEPTANCE") {
        const op = acceptanceOptions(s, b.id)[0];
        p.acceptances.push({
          id: c.id(),
          at: c.now,
          actor: "演示项目经理",
          quantity: acceptQty,
          rows: [
            {
              key: op.key,
              deliveryId: p.deliveries[0].id,
              chainId: ch.id,
              batchId: op.id,
              quantity: acceptQty,
              feedback: op.feedback,
            },
          ],
        });
      }
      if (b.stage === "SUPPLEMENT_DELIVERY") {
        p.deliveries[0].rows = [];
        p.acceptances[0].deliveryId = p.deliveries[0].id;
        p.acceptances[0].rows = [];
      }
      p.costConfirmed = ["CLOSE", "CLOSED"].includes(b.stage);
    }
  }
}
