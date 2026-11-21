import { day } from "../../../shared/types";
import {
  latest,
  chainNodes,
  processUnitCapacity,
  type ProductionVersion,
  type ProductionData,
  type ProcessUnit,
} from "../../../shared/production";
import {
  flowQuantity,
  claimedQuantity,
  rowQuantity,
  disposedQuantity,
  pipeKey,
} from "../../../shared/pull-flow";

export const quantity = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "待补充"
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const dateNumber = (date: string) => Date.parse(date + "T00:00:00Z");
const daysBetween = (from: string, to: string) =>
  Math.floor((dateNumber(to) - dateNumber(from)) / 86400000);

export function nodeMeasure(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  id: string,
) {
  const node = p.chains.some(
    (c) => c.id === chainId && c.versions.some((x) => x.id === v.id),
  )
    ? v.nodes.find((n) => n.id === id)
    : undefined;
  if (!node)
    return {
      output: null,
      input: null,
      claimed: null,
      remaining: null,
      cost: null,
      lastAt: undefined,
      known: false,
    };
  const rows = node.flowResults || [];
  const receipts = (p.pullReceipts || []).filter(
    (r) => r.chainId === chainId && r.to === id,
  );
  const output = flowQuantity(rows);
  const input = receipts.reduce(
    (sum, r) =>
      sum +
      r.resultIds.reduce(
        (n, key) =>
          n +
          (r.quantities?.[key] ??
            r.results.find((x) => x.id === key)?.quantity ??
            1),
        0,
      ),
    0,
  );
  // A former node/lot outside this selected scope cannot consume this node's stock.
  const claimed = rows.reduce(
    (sum, row) => sum + claimedQuantity(p, chainId, id, row.id),
    0,
  );
  return {
    output,
    input,
    claimed,
    remaining: Math.max(0, output - claimed - disposedQuantity(p, chainId, id)),
    cost:
      rows.length && rows.every((x) => x.cost != null)
        ? rows.reduce((sum, x) => sum + x.cost!, 0)
        : null,
    lastAt: [...rows.map((x) => x.at), ...receipts.map((r) => r.at)]
      .sort()
      .at(-1),
    known: rows.length > 0 || receipts.length > 0,
  };
}

/** Exact reverse calculation inside one explicitly serial production unit. */
export function processUnitDemand(unit: ProcessUnit, requiredOutput: number) {
  let required =
    Number.isFinite(requiredOutput) && requiredOutput >= 0
      ? requiredOutput
      : null;
  return [...unit.steps]
    .reverse()
    .map((step) => {
      const neededOutput = required;
      required =
        required != null &&
        step.outputPerInput > 0 &&
        Number.isFinite(required / step.outputPerInput)
          ? required / step.outputPerInput
          : null;
      return { nodeId: step.nodeId, neededOutput, neededInput: required };
    })
    .reverse();
}

export function deliveryForecast(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  target: number,
  deadline: string,
  today = day(),
) {
  const issues = new Set<string>();
  const requirements = new Map<
    string,
    {
      nodeId: string;
      neededOutput: number | null;
      available: number;
      reason?: string;
    }
  >();
  const planningDays = Math.max(0, daysBetween(today, deadline) + 1);
  const remaining = Math.max(
    0,
    target - (nodeMeasure(p, chainId, v, v.output).output ?? 0),
  );
  type Estimate = { capacity: number | null; resources: Set<string> };
  const visited = new Set<string>();
  function walk(id: string, needed: number | null): Estimate {
    const n = v.nodes.find((x) => x.id === id);
    if (!n || visited.has(id)) {
      issues.add("连接缺失或循环，不能反推");
      return { capacity: null, resources: new Set() };
    }
    visited.add(id);
    const available = nodeMeasure(p, chainId, v, id).remaining ?? 0;
    const previous = requirements.get(id);
    requirements.set(id, {
      nodeId: id,
      neededOutput: previous
        ? previous.neededOutput == null || needed == null
          ? null
          : previous.neededOutput + needed
        : needed,
      available,
    });
    const units = (v.processUnits || []).filter((u) =>
      u.steps.some((s) => s.nodeId === id),
    );
    const unit = units.length === 1 ? units[0] : undefined;
    const stepIndex = unit?.steps.findIndex((s) => s.nodeId === id) ?? -1;
    const step = stepIndex >= 0 ? unit!.steps[stepIndex] : undefined;
    const local = step
      ? step.dailyCapacity
      : n.kind === "router"
        ? null
        : n.dailyPlan;
    const conversion = step?.outputPerInput ?? 1;
    const upstreamId = id;
    if (units.length > 1)
      issues.add(`${n.title} 属于多个生产环节，产能口径有歧义`);
    if (n.kind !== "router" && local == null)
      issues.add(`${n.title} 缺少日处理产能`);
    if (step) requirements.get(id)!.reason = "按同环节步骤产能及转化关系反推";
    const previousStep =
      unit && stepIndex > 0 ? unit.steps[stepIndex - 1].nodeId : null;
    const explicitIncoming = v.edges.filter((e) => e.to === id);
    const incoming: ProductionVersion["edges"] = previousStep
      ? [
          explicitIncoming.find((e) => e.from === previousStep) || {
            from: previousStep,
            to: id,
          },
        ]
      : explicitIncoming;
    if (!incoming.length) {
      const requirement = requirements.get(upstreamId) || requirements.get(id)!;
      requirement.reason = `${requirement.reason ? requirement.reason + "；" : ""}现有库存 ${quantity(requirement.available)}，未来补给未承诺`;
      // Existing source stock is real; future source arrivals are never invented.
      if (local == null && n.kind === "router")
        issues.add(`${n.title} 没有未来供给依据`);
      visited.delete(id);
      return {
        capacity:
          local ??
          (planningDays > 0 && nodeMeasure(p, chainId, v, id).known
            ? available / planningDays
            : null),
        resources: new Set([upstreamId]),
      };
    }
    const estimates = incoming.map((e) => {
      const source = v.nodes.find((x) => x.id === e.from)!;
      let rate: number | null =
        e.planningAdmissionRate ??
        ((e.rules || []).length ||
        (v.nodes.find((x) => x.id === e.to)?.requiredFields || []).length
          ? null
          : 1);
      const targetNode = v.nodes.find((x) => x.id === e.to);
      if (
        source?.retiredAt ||
        targetNode?.retiredAt ||
        (p.pipeGates?.[pipeKey(chainId, e.from, e.to)] ??
          e.initiallyOpen ??
          true) === false
      ) {
        rate = 0;
        issues.add(
          `${source?.title || e.from} → ${targetNode?.title || e.to} 已关闭新流转`,
        );
      }
      if (
        source?.flowUnit !== (targetNode?.inputUnit || targetNode?.flowUnit)
      ) {
        rate = null;
        issues.add(`${source?.title || e.from} 的流转单位与下游不一致`);
      }
      const branches = v.edges.filter((x) => x.from === e.from);
      if (branches.length > 1) {
        if (source?.routingMode === "ratio" && source.ratioPolicy) {
          const total = branches.reduce(
            (s, b) => s + (source.branchWeights?.[b.to] || 0),
            0,
          );
          rate =
            rate == null || !total
              ? null
              : (rate * (source.branchWeights?.[e.to] || 0)) / total;
        } else {
          rate = null;
          issues.add(`${source?.title || e.from} 的分支需求缺少明确比例`);
        }
      }
      if (rate == null)
        issues.add(
          `${source?.title || e.from} → ${n.title} 缺少计划准入率，不能把筛选视为全部通过`,
        );
      if (rate === 0 && needed)
        issues.add(`${source?.title || e.from} 的计划准入率为0，不能满足需求`);
      const demand =
        incoming.length === 1 && rate != null && rate > 0 && needed != null
          ? Math.max(0, needed - (id === v.output ? 0 : available)) /
            conversion /
            rate
          : null;
      const upstream = walk(e.from, demand);
      return {
        capacity:
          rate == null || upstream.capacity == null
            ? null
            : upstream.capacity * rate * conversion,
        resources: upstream.resources,
      };
    });
    const resourceIds = estimates.flatMap((x) => [...x.resources]);
    const overlapping = new Set(resourceIds).size !== resourceIds.length;
    if (overlapping)
      issues.add(`${n.title} 的来路共享上游，不能将产能重复相加`);
    if (incoming.length > 1)
      issues.add(`${n.title} 有多个来路，逐支路投入需求待分配策略确认`);
    const supplied =
      overlapping || estimates.some((x) => x.capacity == null)
        ? null
        : estimates.reduce((s, x) => s + x.capacity!, 0);
    // A local bottleneck is still useful even when upstream supply is unknown, but is not a committed throughput.
    const future =
      supplied == null
        ? null
        : local == null && n.kind === "router"
          ? supplied
          : local == null
            ? null
            : Math.min(local, supplied);
    visited.delete(id);
    const stockRate =
      id !== v.output && planningDays > 0 ? available / planningDays : 0;
    return {
      capacity: future == null ? null : future + stockRate,
      resources: new Set(resourceIds),
    };
  }
  const estimate = walk(v.output, remaining);
  const days = daysBetween(today, deadline) + 1;
  if (!Number.isFinite(days)) issues.add("缺少有效截止日期");
  const dailyCapacity =
    estimate.capacity != null && Number.isFinite(estimate.capacity)
      ? estimate.capacity
      : null;
  const expected =
    dailyCapacity != null && Number.isFinite(days)
      ? Math.max(0, days) * dailyCapacity +
        (nodeMeasure(p, chainId, v, v.output).output ?? 0)
      : null;
  return {
    dailyCapacity,
    expected,
    gap: expected == null ? null : Math.max(0, target - expected),
    requirements: [...requirements.values()],
    issues: [...issues],
  };
}

export type ForecastOptions = {
  staleAfterDays?: number;
  minimumSampleDays?: number;
  qualityField?: string;
  qualityTarget?: number;
};
export function flowForecast(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  today = day(),
  options: ForecastOptions = {},
) {
  options = { ...v.riskPolicy, ...options };
  const output = v.nodes.find((n) => n.id === v.output);
  const rows = output?.flowResults || [];
  const produced = output ? flowQuantity(rows) : null;
  const remaining = produced == null ? null : Math.max(0, v.target - produced);
  const daysLeft = Number.isFinite(dateNumber(v.deadline))
    ? daysBetween(today, v.deadline) + 1
    : null;
  const requiredDaily =
    remaining == null || daysLeft == null || daysLeft <= 0
      ? null
      : remaining / daysLeft;
  const recordedDates = [
    ...new Set(rows.filter((r) => r.date < today).map((r) => r.date)),
  ].sort();
  // Missing days are not zero-production reports. Rate only describes recorded dates.
  const observedDaily =
    recordedDates.length >= (options.minimumSampleDays ?? 3)
      ? flowQuantity(rows.filter((r) => r.date < today)) / recordedDates.length
      : null;
  const lastAt = [
    ...v.nodes.flatMap((n) => (n.flowResults || []).map((r) => r.at)),
    ...(p.pullReceipts || [])
      .filter((r) => r.chainId === chainId)
      .map((r) => r.at),
  ]
    .sort()
    .at(-1);
  const staleDays = lastAt ? daysBetween(lastAt.slice(0, 10), today) : null;
  const field = options.qualityField || "合格";
  const qualityNodes = new Set<string>();
  const scanQuality = (id: string, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = v.nodes.find((n) => n.id === id);
    if (n?.kind === "platform") {
      qualityNodes.add(id);
      return;
    }
    for (const e of v.edges.filter((e) => e.to === id))
      scanQuality(e.from, seen);
  };
  scanQuality(v.output);
  const qualitySourceRows = [...qualityNodes]
    .flatMap((id) => v.nodes.find((n) => n.id === id)?.flowResults || [])
    .filter((r) => r.unit === output?.flowUnit);
  const qualityRows = field
    ? qualitySourceRows.filter((r) => typeof r.fields[field] === "boolean")
    : [];
  const checked = flowQuantity(qualityRows);
  const passed = field
    ? flowQuantity(qualityRows.filter((r) => r.fields[field] === true))
    : 0;
  return {
    target: v.target,
    produced,
    remaining,
    daysLeft,
    requiredDaily,
    observedDaily,
    sampleDays: recordedDates.length,
    staleDays,
    lastAt,
    projectedGap: null as number | null, // Sparse output registration cannot establish a calendar-day forecast.
    quality: {
      checked: field ? checked : null,
      passed: field && checked ? passed : null,
      rate: checked ? passed / checked : null,
      target: options.qualityTarget ?? null,
    },
    staleAfterDays: options.staleAfterDays ?? 2,
  };
}

export type ExperienceSignal = {
  key: string;
  title: string;
  detail: string;
  impact: string;
  nodeId?: string;
  issueKey?: string;
  ownerId?: string;
  kind: "risk" | "data" | "review";
  severity: "high" | "medium" | "info";
};
export function experienceSignals(
  p: ProductionData,
  chainId: string,
  v: ProductionVersion,
  today = day(),
  options: ForecastOptions = {},
): ExperienceSignal[] {
  options = { ...v.riskPolicy, ...options };
  const signals: ExperienceSignal[] = [];
  const add = (s: ExperienceSignal) => signals.push(s);
  if (!v.output)
    add({
      key: "delivery-entry",
      title: "交付入口尚未指定",
      detail: "请选择承接合格结果的池子作为交付候选入口。",
      impact: "当前无法归拢可交付产量",
      kind: "data",
      severity: "medium",
    });
  for (const n of v.nodes.filter((n) => n.kind === "platform"))
    if (!n.platformRef)
      add({
        key: `link:${n.id}`,
        title: `${n.title} 尚未关联平台`,
        detail: "先建立项目关联，输出才能按标记归回这个环节。",
        impact: "无法核对这一路的实际贡献",
        nodeId: n.id,
        kind: "data",
        severity: "info",
      });
  for (const u of v.processUnits || []) {
    const c = processUnitCapacity(u);
    if (c.unknown)
      add({
        key: `capacity:${u.id}`,
        title: `${u.name} 产能依据不完整`,
        detail: "补齐每个必要步骤的日处理量与转化关系。",
        impact: "暂不能判断这一环节能否支撑交付",
        nodeId: u.nodeIds.at(-1),
        kind: "data",
        severity: "medium",
      });
    else if (
      c.bottleneckNodeId &&
      Math.max(...c.steps.map((s) => s.effectiveDailyOutput || 0)) >
        (c.dailyOutput || 0) * 1.25
    )
      add({
        key: `bottleneck:${u.id}`,
        title: `${u.name} 受${v.nodes.find((n) => n.id === c.bottleneckNodeId)?.title || "内部短板"}限制`,
        detail: `换算至 ${u.outputUnit} 后，整个环节约 ${quantity(c.dailyOutput)} / 天。`,
        impact: "增加前段投入须考虑后段承接能力",
        nodeId: c.bottleneckNodeId,
        kind: "risk",
        severity: "medium",
      });
  }
  for (const n of v.nodes) {
    const m = nodeMeasure(p, chainId, v, n.id);
    if (
      n.id !== v.output &&
      m.remaining != null &&
      m.remaining > 0 &&
      !v.edges.some((e) => e.from === n.id)
    )
      add({
        key: `retained:${n.id}`,
        title: `${n.title} 有未接入后续的产出`,
        detail: `${quantity(m.remaining)} ${n.flowUnit} 仍在此处留存，尚未指定下一步。`,
        impact: "这部分尚未成为交付候选",
        nodeId: n.id,
        kind: "risk",
        severity: "medium",
      });
  }
  const f = flowForecast(p, chainId, v, today, options);
  if (
    f.remaining != null &&
    f.remaining > 0 &&
    f.daysLeft != null &&
    f.daysLeft <= 0
  )
    add({
      key: "deadline",
      title: "已到期且交付候选尚不足",
      detail: `截至 ${today}，距目标仍缺 ${quantity(f.remaining)}；截止 ${v.deadline}。`,
      impact: "需要调整交期或交付范围",
      kind: "risk",
      severity: "high",
    });
  else if (f.remaining != null && f.remaining > 0 && f.requiredDaily != null) {
    const forecast = deliveryForecast(
      p,
      chainId,
      v,
      v.target,
      v.deadline,
      today,
    );
    if (
      forecast.dailyCapacity != null &&
      f.requiredDaily > forecast.dailyCapacity
    )
      add({
        key: "deadline-progress",
        title: "计划产能不足以覆盖剩余目标",
        detail: `余下每天需 ${quantity(f.requiredDaily)}，已配置产能约 ${quantity(forecast.dailyCapacity)}；计算含今天。`,
        impact: "需要补产能、调整投入或交期",
        kind: "risk",
        severity: "high",
      });
    else if (forecast.dailyCapacity == null)
      add({
        key: "forecast-unknown",
        title: "交期预测依据不足",
        detail: forecast.issues.join("；") || "补齐产能与转化关系。",
        impact: `剩余每天需要 ${quantity(f.requiredDaily)}，目前不能确认能否完成`,
        kind: "data",
        severity: "medium",
      });
  }
  if (
    f.staleDays != null &&
    f.staleDays >= f.staleAfterDays &&
    (f.remaining ?? 0) > 0 &&
    v.status === "RUNNING"
  )
    add({
      key: "data-stale",
      title: "生产数据长时间未更新",
      detail: `最近记录 ${f.lastAt?.slice(0, 10)}，已 ${f.staleDays} 天；提醒阈值 ${f.staleAfterDays} 天。`,
      impact: "数据停滞，需核实是否漏登记或实际停产",
      kind: "risk",
      severity: "medium",
    });
  else if (!f.lastAt)
    add({
      key: "data-missing",
      title: "尚无生产记录",
      detail: "没有已登记产出或取数凭证。",
      impact: "暂不能判断生产是否停滞",
      kind: "data",
      severity: "info",
    });
  if (
    f.quality.rate != null &&
    f.quality.target != null &&
    f.quality.rate < f.quality.target
  )
    add({
      key: "quality",
      title: "已登记样本合格率低于标准",
      detail: `${quantity(f.quality.checked)} 份记录，合格率 ${quantity(f.quality.rate * 100)}%，标准 ${quantity(f.quality.target * 100)}%。`,
      impact: "应核查质量和准入策略",
      kind: "risk",
      severity: "high",
    });
  else if (!f.quality.checked || f.quality.target == null)
    add({
      key: "quality-unknown",
      title: "质量判断依据待补齐",
      detail: !f.quality.checked
        ? "没有可用质量记录。"
        : "尚未指定合格率标准。",
      impact: "不能将已登记数量直接解释为质量达标",
      kind: "data",
      severity: "info",
    });
  const reviews = new Map<
    string,
    NonNullable<ProductionData["flowReviews"]>[number]
  >();
  for (const r of p.flowReviews || [])
    if (r.chainId === chainId) reviews.set(r.issueKey, r);
  for (const r of reviews.values())
    if (r.status === "acted" && r.reviewDate <= today)
      signals.unshift({
        key: `review:${r.issueKey}`,
        title: `${v.nodes.find((n) => n.id === r.nodeId)?.title || "链路"} 处理后需要再次核对`,
        issueKey: r.issueKey,
        ownerId: r.ownerId,
        detail: r.note || r.action,
        impact: `负责人 ${r.ownerId} · 复查日期 ${r.reviewDate} · 需要动作后的新证据`,
        nodeId: r.nodeId,
        kind: "review",
        severity: "medium",
      });
  return signals;
}

export function projectFlowFacts(p: ProductionData) {
  let output = 0,
    cost = 0,
    costKnown = true,
    outputKnown = true,
    lastAt = "",
    platformCount = 0,
    rowsCount = 0;
  const chains = p.chains.filter(
    (c) => !c.voided && latest(c)?.mode === "pull",
  );
  if (!chains.length) {
    costKnown = false;
    outputKnown = false;
  }
  for (const ch of chains) {
    const scopes = chainNodes(ch).filter((x) => x.version.mode === "pull");
    if (!scopes.some((x) => x.terminal && x.node.flowResults?.length))
      outputKnown = false;
    const seenCost = new Set<string>(),
      seenOutput = new Set<string>();
    for (const { node, terminal } of scopes) {
      if (node.kind === "platform") {
        platformCount++;
        if (!node.flowResults?.length) costKnown = false;
        for (const r of node.flowResults || [])
          if (!seenCost.has(r.id)) {
            seenCost.add(r.id);
            rowsCount++;
            if (r.cost == null) costKnown = false;
            else cost += r.cost;
          }
      }
      if (terminal)
        for (const r of node.flowResults || [])
          if (!seenOutput.has(r.id)) {
            seenOutput.add(r.id);
            output += rowQuantity(r);
          }
      lastAt =
        [lastAt, ...(node.flowResults || []).map((r) => r.at)].sort().at(-1) ||
        "";
    }
  }
  return {
    output,
    cost,
    costKnown: costKnown && platformCount > 0 && rowsCount > 0,
    outputKnown,
    lastAt,
  };
}
