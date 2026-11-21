/** F13: pure risk facts shared by UI and local command service. All money is cents. */
import { day, type State, type Business } from "./types";
// Calendar date arithmetic avoids repeatedly constructing locale formatters.
const addDays = (n: number, base = day()) =>
  new Date(Date.parse(base + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
import { productionFacts } from "./production";
export type RiskLevel = "P0" | "P1" | "P2";
export const ranks: Record<string, number> = { P0: 3, P1: 2, P2: 1 };
export const riskDefaults = {
  version: 1,
  minSamples: 4,
  coverage: 0.8,
  staleDays: 2,
  windowDays: 7,
  rateMethod: "latest",
  gapP0: 0.7,
  gapP1: 0.3,
  gapP2: 0.1,
  delayP0: 3,
  delayP1: 1,
  delayP2: 0,
  buffer: 0.05,
  costP0: 1.1,
  costP1: 1,
  costP2: 0.85,
  cvP1: 0.6,
  cvP2: 0.3,
  costCvLow: 0.3,
  costCvHigh: 0.6,
  shapeTolerance: 0.05,
  tailChange: 0.1,
  costNearBudget: 0.95,
  weakSignals: 3,
  mediumSignals: 3,
  recoverP0: 3,
  recoverP1: 2,
  p0Nodes: 1,
  p1Nodes: 3,
  p2Nodes: 6,
  p2Level: "P1",
  cooldownHours: 24,
  maxPauseRatio: 0.2,
  defaultOwner: "",
  reviewer: "u3",
  previewHours: 24,
  history: [],
};
export const riskStates: Record<string, string> = {
  OBSERVING: "观测预警",
  PROCESSING: "处置中",
  REVIEW: "待处置确认",
  ARCHIVED: "已归档",
};
export const categories: Record<string, string> = {
  B1: "干系人",
  B2: "商务合同",
  B3: "外部环境与政策",
  B4: "内部组织与资源",
  B5: "隐性范围",
  B6: "机会",
  B7: "其他不确定性",
};
export function diff(a: string, b: string) {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
}
export function quantiles(xs: number[]) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b),
    mean = xs.reduce((a, b) => a + b, 0) / xs.length,
    q = (n: number) => {
      const p = (xs.length - 1) * n,
        i = Math.floor(p);
      return (
        sorted[i] +
        (sorted[Math.min(i + 1, xs.length - 1)] - sorted[i]) * (p - i)
      );
    },
    variance = xs.reduce((n, x) => n + (x - mean) ** 2, 0) / xs.length;
  return {
    count: xs.length,
    mean,
    median: q(0.5),
    p5: q(0.05),
    p95: q(0.95),
    variance,
    sd: Math.sqrt(variance),
    cv: mean > 0 ? Math.sqrt(variance) / mean : null,
    min: sorted[0],
    max: sorted.at(-1)!,
  };
}
export function riskConfig(s: State) {
  return { ...riskDefaults, ...s.riskConfig };
}
export function riskFacts(
  s: State,
  id: string,
  window = riskConfig(s).windowDays,
  basis = "production",
  today = day(),
) {
  const b = s.businesses.find((x) => x.id === id)!;
  const p = productionFacts(s, id),
    c = riskConfig(s);
  const raw = p.daily || [];
  const acceptanceEvents = (p as any).acceptanceDaily;
  const acceptanceAligned =
    Array.isArray(acceptanceEvents) &&
    acceptanceEvents.reduce((n, r) => n + (r.quantity ?? 0), 0) === p.accepted;
  const series =
    basis === "acceptance" ? (acceptanceAligned ? acceptanceEvents : []) : raw;
  const productionAligned =
    !p.issues?.length &&
    raw.reduce((n, r) => n + (r.quantity ?? 0), 0) === p.produced;
  const aligned =
    basis === "acceptance" ? acceptanceAligned : productionAligned;
  const current = basis === "acceptance" ? p.accepted : p.produced,
    target = b.target || 0,
    remaining = target > 0 ? Math.max(0, target - current) : null,
    daysLeft = b.deadline ? Math.max(0, diff(today, b.deadline)) : null;
  const rows = Array.from({ length: window }, (_, i) => {
    const date = addDays(i - window, today),
      r = series.find((x) => x.date === date);
    return { date, quantity: r?.quantity ?? null, cost: r?.cost ?? null };
  });
  const stats = quantiles(
    rows.filter((x) => x.quantity != null).map((x) => x.quantity!),
  );
  // Cost samples always divide project cost by effective production. The
  // acceptance comparison changes only remaining quantity, never unit cost.
  const costRows = Array.from({ length: window }, (_, i) =>
    raw.find((r) => r.date === addDays(i - window, today)),
  ).filter(Boolean);
  const costs = costRows.filter((x) => x!.quantity! > 0 && x!.cost != null) as {
    quantity: number;
    cost: number;
  }[];
  const unit = quantiles(costs.map((x) => x.cost! / x.quantity!));
  const latest = [...raw]
    .filter((x) => x.quantity != null && x.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const stale = !latest || diff(latest.date, today) > c.staleDays;
  const threshold = Math.max(c.minSamples, Math.ceil(window * c.coverage)),
    ready = aligned && !stale && (stats?.count || 0) >= threshold;
  const correctedToday = raw.find(
    (x) =>
      x.date === today &&
      (x as any).corrected != null &&
      (x as any).corrected !== false &&
      x.quantity != null,
  );
  const baseStats = quantiles(
    raw
      .filter(
        (x) =>
          x.date < today &&
          diff(x.date, today) <= c.windowDays &&
          x.quantity != null,
      )
      .map((x) => x.quantity!),
  );
  const rate =
    c.rateMethod === "latest"
      ? (correctedToday?.quantity ?? (!stale ? latest?.quantity : null))
      : baseStats?.[c.rateMethod as "mean" | "median"];
  const scenarios = Object.fromEntries(
    [
      ["optimistic", "p95", "乐观 · P5"],
      ["base", "median", "基准 · 中位数"],
      ["conservative", "p5", "保守 · P95"],
    ].map(([key, q, label]) => {
      const r = stats?.[q as "median"] ?? null,
        duration =
          remaining === 0
            ? 0
            : ready && r! > 0 && remaining != null
              ? Math.ceil(remaining / r!)
              : null;
      const date =
        duration != null
          ? remaining === 0
            ? (aligned ? completionDate(series, target) : null) || today
            : addDays(duration, today)
          : null;
      return [
        key,
        {
          key,
          label,
          rate: r,
          duration,
          date,
          delay: date && b.deadline ? diff(b.deadline, date) : null,
        },
      ];
    }),
  );
  const costReady =
      productionAligned && !stale && (unit?.count || 0) >= threshold,
    actual = p.cost;
  const costAligned =
    actual != null &&
    raw.every((r) => r.cost != null) &&
    raw.reduce((n, r) => n + (r.cost ?? 0), 0) === actual;
  const costScenarios = Object.fromEntries(
    [
      ["optimistic", "p5"],
      ["base", "median"],
      ["conservative", "p95"],
    ].map(([key, q]) => {
      const future =
        remaining === 0
          ? 0
          : costReady && remaining != null
            ? Math.ceil(remaining * unit![q as "median"])
            : null;
      return [
        key,
        {
          future,
          total: actual != null && future != null ? actual + future : null,
          unit: unit?.[q as "median"] ?? null,
        },
      ];
    }),
  );
  const historicalUnit = quantiles(
    raw
      .filter(
        (r) =>
          r.date < today &&
          r.date >= addDays(-c.windowDays, today) &&
          r.quantity! > 0 &&
          r.cost != null,
      )
      .map((r) => r.cost! / r.quantity!),
  );
  const forecastCost =
    remaining === 0
      ? actual
      : productionAligned &&
          !stale &&
          (historicalUnit?.count || 0) >= c.minSamples &&
          actual != null &&
          remaining != null
        ? actual + Math.ceil(remaining * historicalUnit!.median)
        : null;
  const forecastDays =
    remaining === 0
      ? 0
      : aligned && !stale && remaining != null && rate! > 0
        ? Math.ceil(remaining / rate!)
        : null;
  const date =
    forecastDays != null
      ? remaining === 0
        ? (aligned ? completionDate(series, target) : null) || today
        : addDays(forecastDays, today)
      : null;
  return {
    b,
    p,
    c,
    today,
    window,
    basis,
    rows,
    series,
    productionAligned,
    costRows,
    stats,
    unit,
    threshold,
    ready,
    costReady,
    aligned,
    stale,
    current,
    remaining,
    daysLeft,
    required:
      remaining === 0
        ? 0
        : remaining != null && daysLeft! > 0
          ? remaining / daysLeft!
          : null,
    rate: rate ?? null,
    forecastDate: date,
    signedDelay: date && b.deadline ? diff(b.deadline, date) : null,
    scenarios,
    costScenarios,
    historicalUnit,
    costAligned,
    reliable: aligned && !stale && (baseStats?.count || 0) >= c.minSamples,
    forecastCost,
    actual,
    budget: b.budget,
    costRatio: b.budget > 0 && actual != null ? actual / b.budget : null,
  };
}
function completionDate(rows: any[], target: number) {
  let sum = 0;
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((r) => (sum += r.quantity ?? 0) >= target)?.date;
}
export function highest(xs: (string | null | undefined)[]) {
  return xs.reduce<string | null>(
    (a, b) => ((ranks[b || ""] || 0) > (ranks[a || ""] || 0) ? b! : a),
    null,
  );
}
export function signals(s: State, id: string, today = day()) {
  const f = riskFacts(s, id, riskConfig(s).windowDays, "production", today),
    { b, p, c } = f,
    out: any[] = [];
  if (
    !b ||
    b.kind !== "project" ||
    b.completed ||
    ![
      "FORMAL_DELIVERY",
      "CUSTOMER_ACCEPTANCE",
      "SUPPLEMENT_DELIVERY",
      "INITIATE_CLOSE",
      "CLOSE",
    ].includes(b.stage)
  )
    return out;
  const add = (
    key: string,
    level: any,
    title: string,
    evidence: any,
    nodeId?: string,
  ) => {
    if (level)
      out.push({
        key: id + ":" + key,
        level,
        title,
        evidence,
        nodeId,
        ...(nodeId
          ? (() => {
              const n = p.nodes.find(
                (n) => n.id === nodeId && n.current !== false,
              );
              return n
                ? {
                    chainId: n.chainId,
                    versionId: n.versionId,
                    scopeKey: n.scopeKey,
                  }
                : {};
            })()
          : {}),
        ruleSnapshot: { ...c, history: undefined },
        ruleVersion: c.version,
      });
  };
  if (b.deadline && diff(b.deadline, today) > 0 && p.accepted < b.target)
    add("OVERDUE", "P0", "正式交付已逾期，客户接受量未达目标", {
      deadline: b.deadline,
      accepted: p.accepted,
      target: b.target,
    });
  const costLevel = (n: number | null) =>
    n == null
      ? null
      : n >= c.costP0
        ? "P0"
        : n >= c.costP1
          ? "P1"
          : n >= c.costP2
            ? "P2"
            : null;
  add("COST", costLevel(f.costRatio), "生产成本触及预算水位", {
    actual: p.cost,
    budget: b.budget,
    ratio: f.costRatio,
  });
  const forecast = f.remaining! > 0 ? f.forecastCost : null;
  add(
    "COST_FORECAST",
    costLevel(forecast != null && b.budget > 0 ? forecast / b.budget : null),
    "历史单位成本预测预算水位",
    { forecast, budget: b.budget, remaining: f.remaining },
  );
  if (
    (f.stats?.count || 0) >= c.minSamples &&
    !f.stale &&
    f.aligned &&
    f.remaining! > 0 &&
    f.signedDelay != null
  )
    add(
      "FORECAST",
      f.signedDelay >= c.delayP0
        ? "P0"
        : f.signedDelay >= c.delayP1
          ? "P1"
          : f.signedDelay > c.delayP2 ||
              (f.daysLeft! - Math.ceil(f.remaining! / f.rate!)) * 24 <=
                c.previewHours
            ? "P2"
            : null,
      "项目按有效日产速推演交付风险",
      { forecast: f.forecastDate, delay: f.signedDelay, rate: f.rate },
    );
  // Pull orchestration has no local daily plan or reporting obligation.
  // Its execution progress belongs to the downstream platform; project signals still apply.
  for (const n of (p.nodes || []).filter(
    (n) => n.current !== false && n.reporting !== "pull",
  )) {
    const daily = n.daily || [],
      complete = daily.filter((r: any) => r.date < today && r.quantity != null),
      latest = [...complete]
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .at(-1),
      observed = daily
        .filter((r: any) => r.quantity != null)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .at(-1),
      todayCorrection = daily.find(
        (r: any) =>
          r.date === today && r.corrected != null && r.quantity != null,
      ),
      start = n.start || b.startDate;
    if (
      (!observed && start && diff(start, today) >= c.staleDays) ||
      (observed && diff(observed.date, today) > c.staleDays)
    )
      add(
        "NODE_STALE:" + n.id,
        "P2",
        n.title + "日报缺报",
        { date: observed?.date || null, toleranceDays: c.staleDays },
        n.id,
      );
    const sample = complete.filter(
        (r: any) => diff(r.date, today) <= c.windowDays,
      ),
      st = quantiles(sample.map((r: any) => r.quantity)),
      left =
        n.target > 0 && n.output != null
          ? Math.max(0, n.target - n.output)
          : null,
      recent = todayCorrection || latest,
      recentLeft =
        recent && n.target > 0
          ? Math.max(
              0,
              n.target -
                daily
                  .filter((r: any) => r.date <= recent.date)
                  .reduce((sum: number, r: any) => sum + (r.quantity ?? 0), 0),
            )
          : null,
      recentDays = recent && b.deadline ? diff(recent.date, b.deadline) : null,
      baseline =
        recentLeft === 0
          ? 0
          : recentLeft != null && recentDays! > 0
            ? recentLeft / recentDays!
            : null,
      rate =
        c.rateMethod === "latest"
          ? recent?.quantity
          : st?.[c.rateMethod as "mean" | "median"],
      reliable =
        !!latest &&
        diff(latest.date, today) <= c.staleDays &&
        (st?.count || 0) >= c.minSamples;
    if (recent && baseline! > 0) {
      const gap = Math.max(0, 1 - recent.quantity / baseline!) - c.buffer;
      add(
        "NODE_CAPACITY:" + n.id,
        gap >= c.gapP0
          ? "P0"
          : gap >= c.gapP1
            ? "P1"
            : gap >= c.gapP2
              ? "P2"
              : null,
        n.title + "日产出低于日基线",
        {
          date: recent.date,
          actual: recent.quantity,
          baseline,
          gap,
          buffer: c.buffer,
        },
        n.id,
      );
    }
    if (reliable && left! > 0 && rate! > 0 && b.deadline) {
      const duration = Math.ceil(left! / rate!),
        date = addDays(duration, today),
        delay = diff(b.deadline, date),
        bufferHours = (f.daysLeft! - duration) * 24;
      add(
        "NODE_FORECAST:" + n.id,
        delay >= c.delayP0
          ? "P0"
          : delay >= c.delayP1
            ? "P1"
            : delay > c.delayP2 || bufferHours <= c.previewHours
              ? "P2"
              : null,
        n.title + "按近期产速推演交付风险",
        { rate, forecast: date, delay, bufferHours, count: st?.count },
        n.id,
      );
    }
    if (reliable && st?.cv != null)
      add(
        "NODE_STABILITY:" + n.id,
        st.cv > c.cvP1 ? "P1" : st.cv > c.cvP2 ? "P2" : null,
        n.title + "日产出波动较大",
        { ...st },
        n.id,
      );
  }
  for (const domain of ["capacity", "cost"]) {
    const found: any[] = [],
      readyWindows: number[] = [],
      windowSummary: any[] = [];
    for (const w of [7, 14, 30]) {
      const x = riskFacts(s, id, w, "production", today),
        st = domain === "capacity" ? x.stats : x.unit,
        previousRows = x.p.daily.filter(
          (r) =>
            r.date < addDays(-w, today) && r.date >= addDays(-w * 2, today),
        ),
        previous = quantiles(
          previousRows
            .filter((r) =>
              domain === "capacity"
                ? r.quantity != null
                : r.quantity! > 0 && r.cost != null,
            )
            .map((r) =>
              domain === "capacity" ? r.quantity! : r.cost! / r.quantity!,
            ),
        ),
        previousReady = (previous?.count || 0) >= x.threshold,
        ready = domain === "capacity" ? x.ready : x.costReady;
      windowSummary.push({
        days: w,
        ready,
        capacity: x.stats,
        unit: x.unit,
        threshold: x.threshold,
        previous,
        previousReady,
      });
      if (!ready || !st) continue;
      readyWindows.push(w);
      const addStat = (weight: string, code: string, reason: string) =>
          found.push({ window: w, weight, code, reason }),
        compare = st.mean * c.shapeTolerance;
      if (domain === "capacity") {
        if (!(x.remaining! > 0) || !(x.required! > 0)) continue;
        if (st.mean < x.required!)
          addStat(
            w >= 14 ? "strong" : "weak",
            w >= 14 ? "HARD_GAP" : "SHORT_GAP",
            "均值低于动态日基线",
          );
        if (st.mean >= x.required! && st.median < x.required!)
          addStat(
            "medium",
            "BURST_DEPENDENT",
            "均值达标但常态中位数不足，依赖突击高产",
          );
        if (
          st.mean >= x.required! &&
          st.median >= x.required! &&
          st.p5 < x.required!
        )
          addStat("medium", "TAIL_GAP", "常态达标但P5产能下限不足");
        if (
          previousReady &&
          previous!.p5 > 0 &&
          st.p5 < previous!.p5 * (1 - c.tailChange) &&
          st.p5 < x.required!
        )
          addStat("medium", "TAIL_FALL", "P5环比下降且低于日基线");
        if (st.cv != null && st.cv > c.cvP1)
          addStat("medium", "VOLATILITY", "产能CV超过高阈值");
        else if (st.cv != null && st.cv > c.cvP2)
          addStat("weak", "VOLATILITY", "产能CV超过低阈值");
      } else {
        if (
          !(x.remaining! > 0) ||
          !(x.budget > 0) ||
          x.costScenarios.base.total == null
        )
          continue;
        const base = x.costScenarios.base.total,
          conservative = x.costScenarios.conservative.total;
        if (base > x.budget)
          addStat(
            w >= 14 ? "strong" : "weak",
            w >= 14 ? "BASE_OVER" : "SHORT_OVER",
            "基准预计总成本超预算",
          );
        if (base <= x.budget && conservative > x.budget)
          addStat("medium", "TAIL_OVER", "基准未超预算，但保守情景超预算");
        if (
          previousReady &&
          previous!.p95 > 0 &&
          st.median < st.mean - compare &&
          st.p95 > previous!.p95 * (1 + c.tailChange)
        )
          addStat("medium", "TAIL_RISE", "单位成本P95环比上升且存在高成本尾部");
        if (
          st.median > st.mean + compare &&
          base >= x.budget * c.costNearBudget
        )
          addStat("medium", "HIGH_TYPICAL", "常态单位成本偏高且基准逼近预算");
        if (st.cv != null && st.cv > c.costCvHigh)
          addStat("medium", "VOLATILITY", "成本CV超过高阈值");
        else if (st.cv != null && st.cv > c.costCvLow)
          addStat("weak", "VOLATILITY", "成本CV超过低阈值");
      }
    }
    const windows = new Set(found.map((x) => x.window)),
      shortOnly =
        windows.size === 1 &&
        windows.has(7) &&
        readyWindows.includes(14) &&
        readyWindows.includes(30),
      resonance = windows.size === 3;
    found.forEach((x) => {
      if (shortOnly) x.weight = "weak";
      if (resonance)
        x.weight = { weak: "medium", medium: "strong", strong: "strong" }[
          x.weight
        ];
    });
    const count = (weight: string) =>
      found.filter((x) => x.weight === weight).length;
    out.push({
      key: id + ":STAT_" + domain.toUpperCase(),
      level:
        count("strong") || count("medium") >= c.mediumSignals
          ? "P0"
          : count("medium") || count("weak") >= c.weakSignals
            ? "P1"
            : count("weak")
              ? "P2"
              : null,
      title:
        domain === "capacity" ? "多窗口产能稳定性风险" : "多窗口单位成本风险",
      statistical: true,
      ready: readyWindows.length > 0,
      evidence: {
        found,
        readyWindows,
        resonance,
        shortOnly,
        windowSummary,
        basis: JSON.stringify([
          domain,
          b.target,
          domain === "capacity" ? b.deadline : b.budget,
          c.version,
          p.nodes.map((n) => [n.chainId, n.id, n.scopeKey || "", n.target]),
        ]),
      },
      ruleVersion: c.version,
    });
  }
  return out;
}
export function riskSummary(s: State, id: string) {
  const active = s.risks.filter(
      (r) => r.businessId === id && r.status !== "ARCHIVED",
    ),
    negative = active.filter(
      (r) => r.attribute !== "OPPORTUNITY" && !r.recovered,
    ),
    node = new Map<string, string>();
  negative
    .filter((r) => r.nodeId)
    .forEach((r) =>
      node.set(r.nodeId, highest([node.get(r.nodeId), r.level])!),
    );
  const c = riskConfig(s),
    levels = [...node.values()],
    count = (l: string) => levels.filter((x) => x === l).length;
  const nodeLevel =
    count("P0") >= c.p0Nodes || count("P1") >= c.p1Nodes
      ? "P0"
      : count("P2") >= c.p2Nodes
        ? c.p2Level
        : highest(levels);
  return {
    active,
    negative,
    level: highest([
      nodeLevel,
      ...negative.filter((r) => !r.nodeId).map((r) => r.level),
    ]),
    recovered: active.filter((r) => r.recovered).length,
    pending: s.decisions.filter(
      (x) => x.businessId === id && x.status === "PENDING",
    ).length,
    counts: {
      P0: negative.filter((r) => r.level === "P0").length,
      P1: negative.filter((r) => r.level === "P1").length,
      P2: negative.filter((r) => r.level === "P2").length,
    },
    opportunities: active.filter((r) => r.attribute === "OPPORTUNITY").length,
  };
}

/** Daily chart points use the full dated ledger before the selected window. */
export function riskTrendRows(
  f: ReturnType<typeof riskFacts>,
  kind: "capacity" | "cost" = "capacity",
  mode = "total",
) {
  const start = f.rows[0]?.date || f.today,
    series = kind === "capacity" ? f.series : f.p.daily;
  let cumulative = series
    .filter((r) => r.date < start)
    .reduce(
      (n, r) => n + (kind === "capacity" ? (r.quantity ?? 0) : (r.cost ?? 0)),
      0,
    );
  const historic = f.rows.map((r) => {
    const src = series.find((x) => x.date === r.date),
      value = kind === "capacity" ? src?.quantity : src?.cost;
    if (value != null) cumulative += value;
    const left = f.b.target > 0 ? Math.max(0, f.b.target - cumulative) : null,
      days = diff(r.date, f.b.deadline);
    return {
      date: r.date,
      actual:
        mode === "remaining"
          ? null
          : value == null
            ? null
            : cumulative / (kind === "cost" ? 100 : 1),
      quantity: r.quantity,
      baseline:
        kind === "capacity" && left != null && days > 0 ? left / days : null,
    };
  });
  const actual = kind === "capacity" ? f.current : f.actual;
  const dates = Object.values<any>(f.scenarios)
      .filter((x) => x.duration > 0)
      .map((x) => x.duration),
    horizon = Math.min(3650, Math.max(0, ...dates)),
    step = Math.max(1, Math.ceil(horizon / 180));
  const offsets = new Set<number>([
    0,
    horizon,
    ...dates.filter((x) => x <= 3650),
  ]);
  for (let n = step; n < horizon; n += step) offsets.add(n);
  const future = [...offsets]
    .sort((a, b) => a - b)
    .map((n) => {
      const row: any = { date: addDays(n, f.today) };
      if (!n)
        row.actual =
          mode === "remaining"
            ? null
            : actual == null
              ? null
              : actual / (kind === "cost" ? 100 : 1);
      for (const key of ["optimistic", "base", "conservative"]) {
        const scenario = f.scenarios[key];
        if (
          scenario.duration == null ||
          scenario.duration === 0 ||
          n > scenario.duration
        )
          continue;
        if (kind === "capacity")
          row[key] = Math.min(f.b.target, f.current + n * scenario.rate);
        else {
          const cost = f.costScenarios[key];
          if (cost.future == null || actual == null) continue;
          row[key] =
            ((mode === "remaining" ? 0 : actual) +
              cost.future * Math.min(1, n / scenario.duration)) /
            100;
        }
      }
      return row;
    });
  return [...historic, ...future];
}

/** Business details use internal identity; numeric PID remains a compatibility hint. */
export function riskBusinessPath(
  b: Pick<Business, "id" | "kind" | "pid">,
  tab = "risk",
  scope?: {
    nodeId?: string;
    chainId?: string;
    versionId?: string;
    scopeKey?: string;
  },
) {
  const params = new URLSearchParams({ detail: b.id, pid: String(b.pid), tab });
  for (const key of ["nodeId", "chainId", "versionId", "scopeKey"])
    if (scope?.[key]) params.set(key, scope[key]);
  return (
    (b.kind === "project" ? "/projects" : "/opportunities") +
    "?" +
    params.toString()
  );
}
export function riskSourcePath(s: State, r: any) {
  const b = s.businesses.find((b) => b.id === r.businessId)!;
  const signal = r.signal || {},
    nodeId = signal.nodeId || r.nodeId;
  const n = productionFacts(s, b.id).nodes.find(
    (n) => n.id === nodeId && (!signal.chainId || signal.chainId === n.chainId),
  );
  return riskBusinessPath(
    b,
    "orchestration",
    nodeId
      ? {
          nodeId,
          chainId: signal.chainId || n?.chainId,
          versionId: signal.versionId || n?.versionId,
          scopeKey: signal.scopeKey || n?.scopeKey,
        }
      : undefined,
  );
}
