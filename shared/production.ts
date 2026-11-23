/** F08–F12: production facts, scope identity and source ledgers. Cents internally. */
import type { State } from "./types";
import { resultReports } from "./pull-flow";
import type { FlowResult, FlowStage, FlowRule, PullReceipt } from "./pull-flow";
export const platforms: Record<string, string> = {
  RESOURCE: "资源入库",
  INTERNAL_SELECTION: "内部圈选",
  COLLECTION: "采集入库",
  MACHINE_LABELING: "机器标注",
  AGENT_LABELING: "Agent 标注",
  MANUAL_LABELING: "人工标注",
  CROWDSOURCING: "众包采集",
  FLOW: "流转判断",
};
export const grainNames: Record<string, string> = {
  RESOURCE: "任务 ID",
  INTERNAL_SELECTION: "CID",
  MACHINE_LABELING: "批次 ID",
  AGENT_LABELING: "Task Name",
  MANUAL_LABELING: "队列 ID",
  CROWDSOURCING: "任务包 ID",
};
export type Report = {
  date: string;
  input: number;
  output: number;
  production: number;
  processing: number;
  eliminated: number;
  cost: number;
  kind: "trial" | "production";
  note: string;
  at: string;
  selected: string[];
};
export type AcceptanceBatch = {
  id: string;
  name: string;
  quantity: number;
  feedback: string;
  selected: string[];
  createdAt: string;
  at: string;
  actor: string;
};
export type ProductionNode = {
  kind?: "platform" | "router";
  retiredAt?: string;
  retirementReason?: string;
  stageId?: string;
  routingMode?: "demand" | "ratio" | "condition";
  branchWeights?: Record<string, number>;
  ratioPolicy?: { order: string[]; startBranch: string };
  platformRef?: string;
  flowUnit?: string;
  inputUnit?: string;
  requiredFields?: string[];
  resultFields?: { key: string; type: "number" | "text" | "boolean" }[];
  flowResults?: FlowResult[];
  id: string;
  title: string;
  platform: string;
  note: string;
  taskId: string;
  selected: string[];
  dailyPlan: number | null;
  position: { x: number; y: number };
  reports: Report[];
  reportHistory: Report[];
  corrections: Record<
    string,
    {
      value: number | null;
      reason: string;
      at: string;
      actor: string;
      history: any[];
    }
  >;
  batches: AcceptanceBatch[];
  finalConfirmed: boolean;
  scopeVersion: number;
};
export type Allocation = {
  mode: "percent" | "quantity" | "condition";
  values: Record<string, number>;
  conditions: Record<string, any>;
  confirmed: boolean;
};
export type ProductionVersion = {
  riskPolicy?: {
    qualityField?: string;
    qualityTarget?: number;
    staleAfterDays?: number;
  };
  annotationGroups?: {
    id: string;
    name: string;
    note?: string;
    nodeIds: string[];
    position: { x: number; y: number };
    width: number;
    height: number;
  }[];
  processUnits?: ProcessUnit[];
  mode?: "pull";
  stages?: FlowStage[];
  id: string;
  revision: number;
  name: string;
  createdAt: string;
  target: number;
  start: string;
  deadline: string;
  prepEnd: string;
  strategy: "trial" | "estimate";
  trialSize: number;
  preset: number;
  ramp: { enabled: boolean; end: string; daily: number };
  nodes: ProductionNode[];
  edges: {
    from: string;
    to: string;
    rules?: FlowRule[];
    initiallyOpen?: boolean;
    /** Explicit planning assumption, separate from real eligibility rules. */
    planningAdmissionRate?: number;
  }[];
  inputs: string[];
  output: string;
  allocations: Record<string, Allocation>;
  confirmedAt: string;
  status: "DRAFT" | "CONFIRMED" | "RUNNING" | "PAUSED";
  startedAt: string;
  pausedAt: string;
  baseline: any;
  baselineHistory: any[];
  budgetSnapshot: number | null;
};
export type Chain = {
  id: string;
  name: string;
  versions: ProductionVersion[];
  draft: ProductionVersion | null;
  voided: boolean;
  voidReason: string;
  budget: number | null;
  budgetHistory: any[];
};
export type PlatformMeta = {
  externalId: string;
  description: string;
  notificationLevel: "message" | "none";
  developers: string[];
  admins: string[];
  bound: boolean;
  ownerId: string;
};
export type PlatformTask = {
  meta?: PlatformMeta;
  id: string;
  platform: string;
  name: string;
  createdAt: string;
  unit: string;
  details: {
    id: string;
    name: string;
    output: number | null;
    cost: number | null;
  }[];
};
export type ProductionData = {
  flowDeposits?: {
    id: string;
    requestId: string;
    signature: string;
    chainId: string;
    versionId: string;
    nodeId: string;
    resultId: string;
    quantity: number;
    libraryRef: string;
    note: string;
    result: FlowResult;
    at: string;
    actor: string;
  }[];
  flowDispositions?: {
    id: string;
    requestId: string;
    signature: string;
    chainId: string;
    versionId: string;
    nodeId: string;
    resultId: string;
    quantity: number;
    action: "discard" | "recover";
    reason: string;
    at: string;
    actor: string;
  }[];
  flowAssignments?: {
    chainId: string;
    nodeId: string;
    resultId: string;
    to: string;
    quantity?: number;
    claimedBefore?: number;
    versionId: string;
    at: string;
    mode: "ratio" | "condition";
  }[];
  flowCursors?: Record<string, number>;
  externalOutputs?: {
    requestId: string;
    signature: string;
    resultId: string;
    chainId: string;
    nodeId: string;
    quantity: number;
    at: string;
  }[];
  flowReviews?: {
    id: string;
    chainId: string;
    versionId: string;
    issueKey: string;
    nodeId?: string;
    ownerId: string;
    action: string;
    note: string;
    reviewDate: string;
    status: "open" | "acted" | "verified";
    at: string;
    actor: string;
    evidence: { quantity: number; asOf?: string };
  }[];
  pullReceipts?: PullReceipt[];
  pipeGates?: Record<string, boolean>;
  chains: Chain[];
  tasks: PlatformTask[];
  deliveries: any[];
  acceptances: any[];
  audit: any[];
  budgetHistory: any[];
  costConfirmed: boolean;
};
export type ProcessUnit = {
  id: string;
  name: string;
  nodeIds: string[];
  steps: {
    nodeId: string;
    dailyCapacity: number | null;
    outputPerInput: number;
  }[];
  outputUnit: string;
  bufferPercent?: number;
};
/** Each step capacity is in its own output unit, converted through later steps. */
export function processUnitCapacity(unit: ProcessUnit) {
  let multiplier = 1;
  const steps = [...unit.steps]
    .reverse()
    .map((step) => {
      const effectiveDailyOutput =
        step.dailyCapacity == null ||
        !Number.isFinite(step.dailyCapacity * multiplier)
          ? null
          : step.dailyCapacity * multiplier;
      multiplier *= step.outputPerInput;
      return { nodeId: step.nodeId, effectiveDailyOutput };
    })
    .reverse();
  const unknown =
    !steps.length || steps.some((s) => s.effectiveDailyOutput == null);
  const known = steps
    .filter((s) => s.effectiveDailyOutput != null)
    .sort((a, b) => a.effectiveDailyOutput! - b.effectiveDailyOutput!);
  return {
    dailyOutput: unknown ? null : known[0].effectiveDailyOutput!,
    bottleneckNodeId: unknown ? null : known[0].nodeId,
    steps,
    unknown,
  };
}
export const money = (x: number | null | undefined) =>
  x == null
    ? "待回传"
    : `¥${(x / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
/** Complete legacy snapshots in place: command callers share this mutable ledger. */
export function productionData(s: State, id: string): ProductionData {
  const p = s.production[id] || {
    chains: [], tasks: [], deliveries: [], acceptances: [], audit: [],
    budgetHistory: [], costConfirmed: false,
  };
  p.chains ??= [];
  p.tasks ??= [];
  p.deliveries ??= [];
  p.acceptances ??= [];
  p.audit ??= [];
  p.budgetHistory ??= [];
  p.costConfirmed ??= false;
  return p;
}

export function latest(ch: Chain) {
  return ch.versions[ch.versions.length - 1];
}
export function scopeKey(chainId: string, n: ProductionNode) {
  return [
    chainId,
    n.id,
    n.platform,
    n.taskId,
    [...n.selected].sort().join("|"),
  ].join(":");
}
export function executionKeys(n: ProductionNode) {
  return n.selected.map((id) => `${n.platform}:${n.taskId}:${id}`);
}
export function nodeDays(n: ProductionNode) {
  const map = new Map<string, Report>();
  for (const r of n.reports.filter(
    (r) =>
      r.kind === "production" &&
      r.selected.slice().sort().join("|") ===
        n.selected.slice().sort().join("|"),
  ))
    map.set(r.date, r);
  const dates = [
    ...new Set([...map.keys(), ...Object.keys(n.corrections || {})]),
  ].sort();
  return dates.map((date) => {
    const r = map.get(date),
      cor = n.corrections?.[date];
    return {
      date,
      platform: r?.output ?? null,
      corrected: cor?.value ?? null,
      quantity: cor?.value ?? r?.output ?? null,
      cost:
        n.kind === "platform" &&
        n.flowResults?.some((row) => row.date === date && row.cost == null)
          ? null
          : (r?.cost ?? null),
      reason: cor?.reason || "",
    };
  });
}
/** Latest unique node scopes across revisions, retaining former terminal facts. */
export function chainNodes(ch: Chain) {
  const seen = new Set<string>(),
    rows: {
      node: ProductionNode;
      version: ProductionVersion;
      terminal: boolean;
    }[] = [];
  for (const v of [...ch.versions].reverse())
    for (const n of v.nodes) {
      const k = scopeKey(ch.id, n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (v.mode === "pull" || n.selected.length)
        rows.push({
          node:
            v.mode === "pull"
              ? {
                  ...n,
                  taskId: `flow-${n.id}`,
                  selected: [`flow-${n.id}`],
                  reports: resultReports(n, v.output === n.id),
                  corrections: {},
                }
              : n,
          version: v,
          terminal: v.output === n.id,
        });
    }
  return rows;
}
export function nodeOutput(n: ProductionNode) {
  const d = nodeDays(n);
  return d.some((x) => x.quantity != null)
    ? d.reduce((a, r) => a + (r.quantity ?? 0), 0)
    : null;
}
export function productionFacts(s: State, businessId: string) {
  const b = s.businesses.find((x) => x.id === businessId),
    p = productionData(s, businessId),
    active = p.chains.filter((ch) => !ch.voided),
    issues: string[] = [],
    seen = new Set<string>(),
    nodes: any[] = [];
  let produced = 0,
    cost: number | null = 0;
  for (const row of active.flatMap((ch) =>
    chainNodes(ch).map((row) => ({ ...row, chain: ch })),
  )) {
    const { node: n, chain: ch, terminal } = row;
    if (
      row.version.mode !== "pull" &&
      (n.platform === "COLLECTION" || n.platform === "INTERNAL_SELECTION")
    )
      continue;
    const keys = executionKeys(n),
      overlap = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (overlap) {
      issues.push(`${ch.name} / ${n.title} 的生产范围与其他节点或链路重复`);
      continue;
    }
    const days = nodeDays(n),
      task = p.tasks.find((t) => t.id === n.taskId),
      details = n.selected.map((id) => task?.details.find((d) => d.id === id));
    const reported = days.filter((d) => d.cost != null),
      knownCost =
        row.version.mode === "pull"
          ? n.kind === "router" || !n.flowResults?.length
            ? 0
            : n.flowResults.some((r) => r.cost == null)
              ? null
              : n.flowResults.reduce((sum, r) => sum + r.cost!, 0)
          : reported.length
            ? reported.reduce((sum, d) => sum + d.cost!, 0)
            : details.length && details.every((d) => d?.cost != null)
              ? details.reduce((sum, d) => sum + d!.cost!, 0)
              : null;
    const output =
      nodeOutput(n) ??
      (details.length && details.every((d) => d?.output != null)
        ? details.reduce((sum, d) => sum + d!.output!, 0)
        : null);
    if (knownCost == null) cost = null;
    else if (cost != null) cost += knownCost;
    if (terminal && output != null) produced += output;
    nodes.push({
      current: row.version.id === latest(ch).id,
      reporting: row.version.mode === "pull" ? "pull" : "daily",
      scopeKey: scopeKey(ch.id, n),
      versionId: row.version.id,
      id: n.id,
      title: n.title,
      platform: n.platform,
      chainId: ch.id,
      chainName: ch.name,
      target: row.version.target,
      terminal,
      start: [row.version.start, days[0]?.date].filter(Boolean).sort()[0],
      deadline: row.version.deadline,
      input: n.reports
        .filter((r) => r.kind === "production")
        .reduce((a, r) => a + r.input, 0),
      output,
      cost: knownCost,
      daily: days,
    });
  }
  const dates = [
    ...new Set<string>(nodes.flatMap((n) => n.daily.map((d) => d.date))),
  ].sort();
  const daily = dates.map((date) => {
    const expected = nodes.filter(
        (n) => date >= n.start && (!n.deadline || date <= n.deadline),
      ),
      terminals = expected.filter((n) => n.terminal),
      costRows = expected.map((n) => n.daily.find((d) => d.date === date)),
      outputRows = terminals.map((n) => n.daily.find((d) => d.date === date));
    return {
      date,
      quantity:
        !outputRows.length || outputRows.some((d) => d?.quantity == null)
          ? null
          : outputRows.reduce((a, d) => a + d.quantity, 0),
      cost:
        !costRows.length || costRows.some((d) => d?.cost == null)
          ? null
          : costRows.reduce((a, d) => a + d.cost, 0),
      corrected: outputRows.some((d) => d?.corrected != null),
    };
  });
  const accepted = p.acceptances.reduce((a, r) => a + r.quantity, 0),
    batchesAccepted = active
      .flatMap((ch) =>
        chainNodes(ch)
          .filter((x) => x.terminal)
          .flatMap((x) => x.node.batches),
      )
      .reduce((a, r) => a + r.quantity, 0),
    acceptanceMap = new Map<string, number>();
  for (const a of p.acceptances) {
    for (const r of a.rows || []) {
      const batch = active
          .flatMap((ch) => chainNodes(ch).flatMap((x) => x.node.batches))
          .find((x) => x.id === r.batchId),
        date = String(batch?.createdAt || a.at).slice(0, 10);
      acceptanceMap.set(date, (acceptanceMap.get(date) || 0) + r.quantity);
    }
    if (!a.rows?.length) {
      const date = String(a.at).slice(0, 10);
      acceptanceMap.set(date, (acceptanceMap.get(date) || 0) + a.quantity);
    }
  }
  return {
    produced,
    accepted,
    cost,
    daily,
    nodes,
    issues: [...new Set(issues)],
    acceptanceDaily: [...acceptanceMap]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, quantity]) => ({ date, quantity })),
    target: b?.target || 0,
    deadline: b?.deadline,
    budget: b?.budget || 0,
    allocated: active.reduce((a, ch) => a + (ch.budget || 0), 0),
    delivered: p.deliveries.reduce((a, r) => a + r.quantity, 0),
    batchesAccepted,
  };
}
export function deliveryOptions(s: State, id: string) {
  const p = productionData(s, id),
    b = s.businesses.find((x) => x.id === id);
  return p.chains
    .filter((ch) => !ch.voided)
    .flatMap((ch) =>
      chainNodes(ch)
        .filter((x) => x.terminal && x.version.confirmedAt)
        .map(({ node: n, version: v }) => {
          const key = scopeKey(ch.id, n);
          return {
            chainId: ch.id,
            chainName: ch.name,
            versionId: v.id,
            versionName: `${ch.name} · R${v.revision}`,
            node: n,
            scope: key,
            unit: b?.unit || "条",
            days: nodeDays(n).map((d) => {
              const used = p.deliveries
                .flatMap((x) => x.rows || [])
                .filter((r) => r.key === `${key}:${d.date}`)
                .reduce((a, r) => a + r.quantity, 0);
              return {
                ...d,
                key: `${key}:${d.date}`,
                used,
                available: Math.max(0, (d.quantity || 0) - used),
              };
            }),
          };
        }),
    );
}
export function acceptanceOptions(s: State, id: string) {
  return deliveryOptions(s, id).flatMap((o) =>
    o.node.batches.map((batch) => {
      const key = o.scope + ":" + batch.id,
        used = productionData(s, id)
          .acceptances.flatMap((x) => x.rows || [])
          .filter((r) => r.key === key)
          .reduce((a, r) => a + r.quantity, 0);
      return {
        ...batch,
        key,
        used,
        available: batch.quantity - used,
        chainId: o.chainId,
        versionId: o.versionId,
        versionName: o.versionName,
        nodeId: o.node.id,
      };
    }),
  );
}

/** Stable serialized source token, checked again by the authoritative command. */
export const fingerprint = (value: any) => {
  let hash = 2166136261;
  for (const char of JSON.stringify(value))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
};
export function deliverySnapshot(
  s: State,
  id: string,
  scopes: string[],
  ranges: Record<string, any> = {},
) {
  const p = productionData(s, id),
    b = s.businesses.find((x) => x.id === id),
    options = deliveryOptions(s, id),
    picked = options.filter((o) => scopes.includes(o.scope)),
    issues = [
      ...productionFacts(s, id).issues,
      ...p.deliveries
        .filter((d) => d.quantity > 0 && !d.rows?.length)
        .map((d) => `历史交付 ${d.id} 尚未绑定生产来源，请先核对以免重复交付`),
    ],
    rows: any[] = [];
  if (picked.length !== new Set(scopes).size)
    issues.push("所选生产来源已失效，请重新选择");
  for (const o of picked) {
    const range = ranges[o.scope] || {},
      days = o.days.filter(
        (d) =>
          (!range.start || d.date >= range.start) &&
          (!range.end || d.date <= range.end),
      );
    if (range.start && range.end && range.start > range.end)
      issues.push("生产日期范围倒置");
    if (
      (o.node.flowUnit || p.tasks.find((t) => t.id === o.node.taskId)?.unit) !==
      b?.unit
    )
      issues.push(`${o.versionName}任务单位与项目单位不一致`);
    if (!days.length || days.some((d) => d.quantity == null))
      issues.push(`${o.versionName}缺少有效日产出，请补充回传或PM修正`);
    for (const d of days) {
      if (d.used > (d.quantity ?? 0))
        issues.push(`${o.versionName} ${d.date}历史交付超过当前修正产量`);
      if (d.available > 0)
        rows.push({
          ...d,
          chainId: o.chainId,
          versionId: o.versionId,
          versionName: o.versionName,
          nodeId: o.node.id,
          quantity: d.available,
        });
    }
  }
  return {
    options,
    picked,
    rows,
    issues: [...new Set(issues)],
    quantity: rows.reduce((a, r) => a + r.quantity, 0),
    fingerprint: fingerprint({
      scopes: [...scopes].sort(),
      ranges,
      picked,
      rows,
      deliveries: p.deliveries,
    }),
  };
}
export function acceptanceSnapshot(s: State, id: string, keys: string[]) {
  const p = productionData(s, id),
    b = s.businesses.find((x) => x.id === id),
    options = acceptanceOptions(s, id),
    picked = options.filter((r) => keys.includes(r.key)),
    rows: any[] = [],
    issues: string[] = p.deliveries
      .filter((d) => d.quantity > 0 && !d.rows?.length)
      .map((d) => `历史交付 ${d.id} 尚未绑定生产来源，请先核对`);
  if (picked.length !== new Set(keys).size)
    issues.push("客户验收批次来源已变化");
  for (const r of picked) {
    if (r.available < 0) {
      issues.push("验收批次数量小于已登记数量");
      continue;
    }
    if (
      !r.available &&
      (r.quantity !== 0 ||
        p.acceptances.some((a) => (a.rows || []).some((z) => z.key === r.key)))
    ) {
      issues.push("该验收批次已全部登记");
      continue;
    }
    let left = r.available;
    for (const d of p.deliveries) {
      const cap = (d.rows || [])
          .filter((z) => z.chainId === r.chainId)
          .reduce((a, z) => a + z.quantity, 0),
        used = p.acceptances
          .flatMap((a) => a.rows || [])
          .concat(rows)
          .filter((z) => z.deliveryId === d.id && z.chainId === r.chainId)
          .reduce((a, z) => a + z.quantity, 0),
        q = Math.min(left, Math.max(0, cap - used));
      if (q > 0 || (r.quantity === 0 && cap > used)) {
        rows.push({
          key: r.key,
          deliveryId: d.id,
          chainId: r.chainId,
          versionId: r.versionId,
          batchId: r.id,
          name: r.name,
          feedback: r.feedback,
          quantity: q,
        });
        left -= q;
        if (!left) break;
      }
    }
    if (left || !rows.some((z) => z.key === r.key))
      issues.push(`${r.name}验收未匹配本链路正式交付余额`);
  }
  const quantity = rows.reduce((a, r) => a + r.quantity, 0),
    after = p.acceptances.reduce((a, r) => a + r.quantity, 0) + quantity;
  if (after > (b?.target || 0)) issues.push("客户累计接受量不能超过项目目标");
  return {
    picked,
    rows,
    quantity,
    after,
    issues: [...new Set(issues)],
    fingerprint: fingerprint({
      keys: [...keys].sort(),
      picked,
      rows,
      deliveries: p.deliveries,
      acceptances: p.acceptances,
    }),
  };
}
export const unboundDeliveries = (s: State, id: string) =>
  productionData(s, id).deliveries.filter((d) => !d.rows?.length);
export function reconciliationSnapshot(
  s: State,
  id: string,
  deliveryId: string,
  scopes: string[],
  ranges: Record<string, any> = {},
) {
  const p = productionData(s, id),
    delivery = unboundDeliveries(s, id).find((d) => d.id === deliveryId),
    temp = structuredClone(s),
    snap = (() => {
      temp.production[id].deliveries = temp.production[id].deliveries.filter(
        (d) => d.rows?.length,
      );
      return deliverySnapshot(temp, id, scopes, ranges);
    })(),
    issues = [...snap.issues],
    rows: any[] = [];
  let left = delivery?.quantity || 0;
  for (const r of [...snap.rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const quantity = Math.min(left, r.quantity);
    if (quantity > 0) {
      rows.push({ ...r, quantity });
      left -= quantity;
    }
  }
  if (!delivery) issues.push("请选择尚未关联来源的历史交付");
  if (left) issues.push(`生产范围不足历史交付量，尚缺 ${left}`);
  const originals = p.acceptances.filter(
      (a) =>
        a.deliveryId === deliveryId ||
        (a.rows || []).some((r) => r.deliveryId === deliveryId && !r.batchId),
    ),
    accepted = originals.reduce((a, r) => a + r.quantity, 0),
    acceptanceRows: any[] = [];
  let acceptedLeft = accepted;
  for (const chainId of [...new Set(rows.map((r) => r.chainId))]) {
    let capacity = rows
      .filter((r) => r.chainId === chainId)
      .reduce((a, r) => a + r.quantity, 0);
    for (const r of acceptanceOptions(s, id)
      .filter((r) => r.chainId === chainId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const quantity = Math.min(
        acceptedLeft,
        capacity,
        Math.max(0, r.available),
      );
      if (quantity) {
        acceptanceRows.push({
          key: r.key,
          deliveryId,
          chainId,
          versionId: r.versionId,
          batchId: r.id,
          name: r.name,
          feedback: r.feedback,
          quantity,
        });
        capacity -= quantity;
        acceptedLeft -= quantity;
      }
    }
  }
  if (acceptedLeft)
    issues.push(`历史已接受量尚有 ${acceptedLeft} 缺少末端客户验收批次`);
  return {
    ...snap,
    delivery,
    rows,
    accepted,
    originals,
    acceptanceRows,
    issues: [...new Set(issues)],
    fingerprint: fingerprint({
      source: snap.fingerprint,
      delivery,
      originals,
      rows,
      acceptanceRows,
    }),
  };
}
export const conditionFields: Record<
  string,
  { key: string; label: string; type: "number" | "text" }[]
> = {
  image: [
    ["aesthetic", "美学度", "number"],
    ["people", "人数", "number"],
    ["faces", "人脸数", "number"],
    ["exposure", "曝光补偿", "number"],
    ["source", "项目来源", "text"],
    ["category1", "一级分类", "text"],
    ["category2", "二级分类", "text"],
    ["communityStatus", "社区状态", "text"],
  ],
  video: [
    ["duration", "时长（秒）", "number"],
    ["people", "人数", "number"],
    ["aesthetic", "美学度", "number"],
    ["source", "项目来源", "text"],
    ["category1", "一级分类", "text"],
  ],
  audio: [
    ["duration", "时长（秒）", "number"],
    ["language", "语言", "text"],
    ["speakers", "说话人数", "number"],
    ["source", "项目来源", "text"],
  ],
  text: [
    ["length", "字数", "number"],
    ["language", "语言", "text"],
    ["category1", "一级分类", "text"],
    ["source", "项目来源", "text"],
  ],
} as any;
for (const key of Object.keys(conditionFields))
  conditionFields[key] = (conditionFields[key] as any).map(
    ([key, label, type]) => ({ key, label, type }),
  );
export const conditionOperators = (type: string) =>
  type === "number"
    ? ["eq", "ne", "gt", "gte", "lt", "lte"]
    : ["eq", "ne", "contains"];
export const operatorNames: Record<string, string> = {
  eq: "等于",
  ne: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  contains: "包含",
};
export function dynamicPlan(
  v: ProductionVersion,
  n: ProductionNode,
  today: string,
) {
  const baseline = v.baseline,
    row = baseline?.rows.find((r) => r.nodeId === n.id);
  if (!row) return null;
  const start = baseline.formalStart || baseline.start,
    days = Math.max(
      0,
      Math.floor(
        (Date.parse(baseline.deadline) -
          Date.parse(today > start ? today : start)) /
          864e5,
      ) + 1,
    ),
    produced = n.reports
      .filter(
        (r) => r.kind === "production" && r.date >= start && r.date < today,
      )
      .reduce((a, r) => a + r.production, 0),
    remaining = Math.max(0, row.totalInput - produced),
    ramping =
      baseline.ramp?.enabled && today >= start && today <= baseline.ramp.end;
  return {
    produced,
    remaining,
    days,
    ramping,
    daily: days
      ? ramping
        ? Math.min(remaining, baseline.ramp.daily)
        : Math.ceil(remaining / days)
      : null,
  };
}
/** Display-only collection boxes do not change statistical input roles. */
export function statisticalUpstream(v: ProductionVersion, nodeId: string) {
  const found = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    for (const e of v.edges.filter((e) => e.to === id)) {
      if (visited.has(e.from)) continue;
      visited.add(e.from);
      const n = v.nodes.find((n) => n.id === e.from);
      if (n?.platform === "COLLECTION") visit(n.id);
      else if (n) found.add(n.id);
    }
  };
  visit(nodeId);
  return [...found];
}
