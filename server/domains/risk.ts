/** F13/F14: authoritative local risk ledger, rule versions and simulated notices. */
import {
  mutable,
  record,
  requireValue,
  day,
  addDays,
  type State,
  type Command,
  type Context,
} from "../../shared/types";
import {
  signals,
  riskFacts,
  riskConfig,
  riskSummary,
  riskDefaults,
  ranks,
  categories,
  diff,
} from "../../shared/risk";
export { riskSummary };
const history = (
  s: State,
  r: any,
  c: Context,
  action: string,
  detail: string,
) => {
  const row = record(s, c, action, detail, r.businessId);
  (r.history ||= []).unshift(row);
};
function notify(s: State, r: any, c: Context, force = false) {
  const ps = s.settings.riskPush?.[r.businessId];
  if (
    ["PAUSED", "PREPARING"].includes(ps?.mode) ||
    (r.snoozeUntil && r.snoozeUntil > c.now) ||
    r.status === "ARCHIVED"
  )
    return;
  const prior = s.notifications.filter(
    (n) => n.riskId === r.id && n.title.includes("风险"),
  );
  if (
    !force &&
    prior.some(
      (n) =>
        (n as any).level === r.level &&
        Date.parse(c.now) - Date.parse(n.at) <
          riskConfig(s).cooldownHours * 3600000,
    )
  )
    return;
  for (const userId of new Set([r.ownerId, ...(r.cc || [])]))
    s.notifications.unshift({
      id: c.id(),
      userId,
      title: r.level + " 风险：" + r.title,
      detail: "站内模拟通知 · 外部飞书未连接",
      at: c.now,
      read: false,
      businessId: r.businessId,
      riskId: r.id,
      simulated: true,
      ...{ level: r.level },
    });
}
export function evaluateRisks(s: State, c: Context) {
  s.riskConfig = { ...riskDefaults, ...s.riskConfig };
  s.settings.riskEpisodes ||= {};
  s.settings.riskPush ||= {};
  const today = day(new Date(c.now));
  for (const [id, ps] of Object.entries<any>(s.settings.riskPush)) {
    if (["PAUSED", "PREPARING"].includes(ps.mode) && ps.resumeDate <= today) {
      if (ps.mode === "PAUSED")
        ps.accumulatedPauseDays =
          (ps.accumulatedPauseDays || 0) +
          Math.max(0, diff(ps.since.slice(0, 10), today));
      ps.mode = "RUNNING";
      ps.alert = "期限已到，已恢复提醒；交付截止时间不变";
    }
    const newProduction = s.production[id]?.chains
      ?.filter((ch) => !ch.voided)
      .flatMap((ch) => ch.versions)
      .flatMap((v) => v.nodes)
      .flatMap((n) => n.reports || [])
      .some((r) => r.kind === "production" && r.output > 0 && r.at > ps.since);
    if (newProduction && ["PAUSED", "PREPARING"].includes(ps.mode)) {
      if (ps.mode === "PAUSED") {
        ps.accumulatedPauseDays =
          (ps.accumulatedPauseDays || 0) +
          Math.max(0, diff(ps.since.slice(0, 10), today));
        ps.mode = "RUNNING";
        ps.alert = "暂停期间出现新生产产出，已恢复风险提醒";
      } else ps.alert = "筹备期间出现新生产产出，请确认结束筹备或核对下游任务";
    }
  }
  for (const b of s.businesses) {
    if (b.completed) continue;
    const candidates = signals(s, b.id, today);
    s.settings.riskStatHistory ||= {};
    for (const signal of candidates.filter((x) => x.statistical)) {
      const list = (s.settings.riskStatHistory[signal.key] ||= []);
      const basis = signal.evidence.basis;
      const earlier = list
        .filter((x) => x.basis === basis && x.date < today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1);
      const same = list.find((x) => x.date === today && x.basis === basis);
      const prior =
        same && (ranks[same.level] || 0) > (ranks[earlier?.level] || 0)
          ? same
          : earlier;
      let safe = 0,
        held = false;
      if (prior && (ranks[prior.level] || 0) > (ranks[signal.level] || 0)) {
        const found = signal.evidence.found;
        const eligible =
          signal.ready &&
          (prior.level === "P0"
            ? found.length === 0
            : found.every((x) => x.weight === "weak") &&
              found.length < riskConfig(s).weakSignals);
        safe = eligible
          ? earlier && diff(earlier.date, today) === 1
            ? (earlier.safe || 0) + 1
            : 1
          : 0;
        const needed =
          prior.level === "P0"
            ? riskConfig(s).recoverP0
            : riskConfig(s).recoverP1;
        if (safe < needed) {
          signal.level = prior.level;
          held = true;
        }
      }
      signal.evidence.held = held;
      signal.evidence.safe = safe;
      const snapshot = { date: today, basis, level: signal.level, safe };
      const index = list.findIndex((x) => x.date === today);
      if (index < 0) list.push(snapshot);
      else list[index] = snapshot;
      if (list.length > 120) list.splice(0, list.length - 120);
    }
    const active = candidates.filter((x) => x.level),
      keys = new Set(active.map((x) => x.key));
    for (const signal of active) {
      let r = s.risks.find(
        (x) => x.signalKey === signal.key && x.status !== "ARCHIVED",
      );
      const episode = s.settings.riskEpisodes[signal.key];
      if (!r && episode?.awaitingRecovery) continue;
      if (!r) {
        r = {
          id: c.id(),
          businessId: b.id,
          source: "SYSTEM",
          attribute: "THREAT",
          category: "B7",
          ownerId: riskConfig(s).defaultOwner || b.ownerId,
          title: signal.title,
          description: signal.title,
          impact: "交付、产能或预算",
          response: "先核对业务数据与日产出，再确认生产安排",
          status: signal.level === "P2" ? "OBSERVING" : "PROCESSING",
          level: signal.level,
          systemLevel: signal.level,
          signalKey: signal.key,
          signal,
          firstSignal: structuredClone(signal),
          history: [],
          feedback: [],
          files: [],
          followIds: [],
          createdAt: c.now,
          updatedAt: c.now,
          nodeId: signal.nodeId,
        };
        s.risks.push(r);
        history(s, r, c, "系统识别风险", signal.title);
      } else {
        const old = r.level;
        r.systemLevel = signal.level;
        r.level = r.override?.level || signal.level;
        r.signal = signal;
        r.updatedAt = c.now;
        if (old !== r.level)
          history(s, r, c, "系统风险重算", old + " → " + r.level);
      }
      r.recovered = false;
      r.dataUnknown = !!signal.statistical && !signal.ready;
      notify(s, r, c);
    }
    for (const r of s.risks.filter(
      (x) =>
        x.businessId === b.id &&
        x.source === "SYSTEM" &&
        x.status !== "ARCHIVED",
    )) {
      if (keys.has(r.signalKey)) continue;
      const f = riskFacts(s, b.id, 7, "production", today);
      r.dataUnknown = !recoveryProof(s, r, today, candidates);
      r.recovered = !r.dataUnknown;
    }
    for (const [key, episode] of Object.entries<any>(s.settings.riskEpisodes)) {
      if (!key.startsWith(b.id + ":") || keys.has(key)) continue;
      const old = s.risks.find((r) => r.id === episode.riskId);
      if (old && recoveryProof(s, old, today, candidates))
        episode.awaitingRecovery = false;
    }
  }
}
/** Missing data, removed scopes and invalid predictions cannot prove recovery. */
function recoveryProof(
  s: State,
  r: any,
  today: string,
  candidates = signals(s, r.businessId, today),
) {
  const f = riskFacts(
      s,
      r.businessId,
      riskConfig(s).windowDays,
      "production",
      today,
    ),
    key = r.signalKey || "";
  if (r.nodeId) {
    const node = f.p.nodes.find(
      (n) => n.id === r.nodeId && n.current !== false,
    );
    if (!node) return false;
    const rows = node.daily.filter((x) => x.date < today && x.quantity != null),
      recent = [...rows].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (!recent || diff(recent.date, today) > f.c.staleDays) return false;
    if (
      key.includes("CAPACITY") &&
      !(node.target > 0 && node.output != null && f.daysLeft! > 0)
    )
      return false;
    if (
      (key.includes("FORECAST") || key.includes("STABILITY")) &&
      rows.filter((x) => diff(x.date, today) <= f.c.windowDays).length <
        f.c.minSamples
    )
      return false;
    return true;
  }
  if (key.includes(":STAT_"))
    return !!candidates.find((x) => x.key === key)?.ready;
  if (key.endsWith(":OVERDUE")) return f.b.target > 0 && !!f.b.deadline;
  if (key.includes(":COST") && !(f.b.budget > 0 && f.actual != null))
    return false;
  if (key.endsWith(":COST_FORECAST"))
    return f.remaining === 0 || f.forecastCost != null;
  if (key.endsWith(":FORECAST"))
    return (
      f.remaining === 0 || (f.aligned && !f.stale && f.forecastDate != null)
    );
  return f.aligned && !f.stale;
}
export function seedRisk(s: State) {
  s.riskConfig = { ...riskDefaults, ...s.riskConfig };
  s.risks ||= [];
  s.decisions ||= [];
  const b = s.businesses.find((b) => !b.completed && b.kind === "project");
  if (b && !s.risks.some((r) => r.source === "MANUAL"))
    s.risks.push({
      id: "risk-demo-manual",
      businessId: b.id,
      source: "MANUAL",
      attribute: "THREAT",
      category: "B1",
      level: "P2",
      status: "OBSERVING",
      title: "客户验收窗口待确认",
      description: "客户验收联系人本周尚未确认可用窗口",
      impact: "可能影响客户确认排期",
      response: "联系客户确认验收时间并记录凭证",
      ownerId: b.ownerId,
      reportLevel: "NORMAL",
      createdAt: s.createdAt,
      updatedAt: s.createdAt,
      history: [],
      feedback: [],
      files: [],
      followIds: [],
    });
}
export function handleRisk(s: State, cmd: Command, c: Context): any {
  if (!cmd.type.startsWith("risk.")) return undefined;
  const p = cmd.payload || {},
    type = cmd.type.slice(5),
    r = s.risks.find((r) => r.id === p.id);
  if (
    ![
      "read",
      "evaluate",
      "config",
      "create",
      "edit",
      "push",
      "push.ack",
      "decision.resolve",
      "feedback.review",
      "level",
      "assign",
      "feedback",
      "evidence",
    ].includes(type)
  )
    return undefined;
  if (type !== "read")
    requireValue(c.actor.role !== "viewer", "只读成员不能修改风险");
  if (type === "evaluate") {
    evaluateRisks(s, c);
    return true;
  }
  if (type === "config") {
    requireValue(c.actor.role === "approver", "全局规则由业务授权角色维护");
    requireValue(p.reason?.trim(), "请填写规则变更原因");
    const next = {
      ...riskConfig(s),
      ...Object.fromEntries(
        Object.keys(riskDefaults)
          .filter(
            (k) => !["history", "version"].includes(k) && k in (p.values || {}),
          )
          .map((k) => [k, p.values[k]]),
      ),
    };
    for (const k of [
      "gapP0",
      "gapP1",
      "gapP2",
      "costP0",
      "costP1",
      "costP2",
      "coverage",
      "minSamples",
      "staleDays",
      "p0Nodes",
      "p1Nodes",
      "p2Nodes",
    ])
      requireValue(
        Number.isFinite(next[k]) && next[k] >= 0,
        "规则须为非负数字",
      );
    requireValue(
      next.gapP0 > next.gapP1 && next.gapP1 > next.gapP2 && next.gapP0 <= 1,
      "缺口须满足 1≥P0>P1>P2≥0",
    );
    requireValue(
      next.costP0 > next.costP1 && next.costP1 > next.costP2,
      "成本水位须满足P0>P1>P2",
    );
    requireValue(
      next.minSamples >= 4 &&
        Number.isInteger(next.minSamples) &&
        next.coverage > 0 &&
        next.coverage <= 1,
      "至少4个有效日；覆盖比例须大于0且≤1",
    );
    for (const k of [
      "p0Nodes",
      "p1Nodes",
      "p2Nodes",
      "weakSignals",
      "mediumSignals",
      "recoverP0",
      "recoverP1",
      "windowDays",
    ])
      requireValue(Number.isInteger(next[k]) && next[k] >= 1, k + "须为正整数");
    requireValue(
      next.windowDays >= next.minSamples,
      "观察窗口不得小于样本门槛",
    );
    requireValue(
      next.delayP0 > next.delayP1 && next.delayP1 >= 0,
      "延期阈值顺序无效",
    );
    requireValue(
      next.cvP1 > next.cvP2 && next.costCvHigh > next.costCvLow,
      "CV高阈值须大于低阈值",
    );
    requireValue(
      next.maxPauseRatio >= 0 && next.maxPauseRatio <= 1,
      "暂停比例须在0至1",
    );
    requireValue(
      ["latest", "mean", "median"].includes(next.rateMethod) &&
        ["P0", "P1"].includes(next.p2Level),
      "统计方式或汇总等级无效",
    );
    for (const k of [
      "staleDays",
      "cooldownHours",
      "previewHours",
      "delayP0",
      "delayP1",
      "delayP2",
      "buffer",
      "shapeTolerance",
      "tailChange",
      "costNearBudget",
      "costCvLow",
      "costCvHigh",
      "cvP1",
      "cvP2",
    ])
      requireValue(Number.isFinite(next[k]) && next[k] >= 0, k + "须为非负数");
    requireValue(
      next.delayP1 > next.delayP2 &&
        next.buffer <= 1 &&
        next.shapeTolerance <= 1 &&
        next.tailChange <= 1 &&
        next.costNearBudget > 0 &&
        next.costNearBudget <= 1,
      "请核对缓冲、尾部变化、成本近预算及延期阈值",
    );
    const before = structuredClone(s.riskConfig);
    s.riskConfig = {
      ...next,
      version: (s.riskConfig.version || 1) + 1,
      history: [
        {
          at: c.now,
          actor: c.actor.name,
          reason: p.reason,
          before,
          after: { ...next, history: undefined },
        },
        ...(s.riskConfig.history || []),
      ],
    };
    record(s, c, "修改全局风险规则", p.reason);
    return true;
  }
  if (type === "create" || type === "edit") {
    const b = mutable(s, p.businessId || r?.businessId, c);
    if (type === "edit") {
      requireValue(
        r && r.source === "MANUAL" && r.status !== "ARCHIVED",
        "仅可编辑未归档人工风险",
      );
    }
    for (const k of ["title", "description", "impact", "response"])
      requireValue(
        p[k]?.trim(),
        "请填写风险名称、触发条件、影响范围及应对详情",
      );
    requireValue(categories[p.category] && ranks[p.level], "请选择分类及等级");
    requireValue(
      s.users.some((u) => u.id === p.ownerId),
      "请选择有效负责人",
    );
    requireValue(
      (p.files || []).length <= 5 &&
        (p.files || []).every((f) => f.size <= 10 * 1024 * 1024),
      "最多5个附件，每个≤10MB",
    );
    requireValue(
      (p.followIds || []).every((id) =>
        s.followups.some(
          (f) => f.id === id && f.businessId === b.id && !f.deleted,
        ),
      ),
      "关联跟进须来自当前业务",
    );
    const data = { ...p, businessId: b.id, source: "MANUAL", updatedAt: c.now };
    if (r) {
      Object.assign(r, data);
      r.status = r.level === "P2" ? "OBSERVING" : "PROCESSING";
      history(s, r, c, "编辑人工风险", p.title);
      return r.id;
    }
    const item = {
      ...data,
      id: c.id(),
      status: p.level === "P2" ? "OBSERVING" : "PROCESSING",
      createdAt: c.now,
      history: [],
      feedback: [],
    };
    s.risks.push(item);
    history(s, item, c, "新增人工风险", item.title);
    notify(s, item, c);
    return item.id;
  }
  if (type === "push.ack") {
    mutable(s, p.businessId, c);
    const ps = s.settings.riskPush?.[p.businessId];
    requireValue(ps, "没有待确认的推送状态");
    ps.alertAcknowledgedAt = c.now;
    ps.acknowledgedAlert = ps.alert;
    ps.alert = "";
    record(s, c, "确认风险推送状态", "已核对状态提醒", p.businessId);
    return true;
  }
  if (type === "push") {
    mutable(s, p.businessId, c);
    requireValue(p.reason?.trim(), "请填写状态调整原因");
    requireValue(
      ["RUNNING", "PAUSED", "PREPARING"].includes(p.mode),
      "状态无效",
    );
    requireValue(
      p.mode === "RUNNING" || p.resumeDate >= day(new Date(c.now)),
      "请填写不早于今天的恢复日期",
    );
    const b = s.businesses.find((b) => b.id === p.businessId)!;
    const today = day(new Date(c.now));
    if (p.mode === "PAUSED") {
      const max = Math.max(
        1,
        Math.floor(
          Math.max(1, diff(b.startDate || today, b.deadline || today)) *
            riskConfig(s).maxPauseRatio,
        ),
      );
      const prior = s.settings.riskPush?.[p.businessId],
        used =
          (prior?.accumulatedPauseDays || 0) +
          (prior?.mode === "PAUSED"
            ? Math.max(0, diff(prior.since.slice(0, 10), today))
            : 0);
      requireValue(
        used + diff(today, p.resumeDate) <= max,
        "累计暂停超出项目周期比例上限：" + max + "天，已使用" + used + "天",
      );
    }
    s.settings.riskPush ||= {};
    const previous = s.settings.riskPush[p.businessId];
    const accumulatedPauseDays =
      (previous?.accumulatedPauseDays || 0) +
      (previous?.mode === "PAUSED"
        ? Math.max(0, diff(previous.since.slice(0, 10), today))
        : 0);
    s.settings.riskPush[p.businessId] = {
      ...p,
      since: c.now,
      accumulatedPauseDays,
    };
    record(s, c, "修改风险推送状态", p.reason, p.businessId);
    return true;
  }
  if (type === "decision.resolve") {
    const d = s.decisions.find((x) => x.id === p.id);
    requireValue(c.actor.role === "approver", "需业务授权角色记录决策");
    requireValue(d && d.status === "PENDING", "待拍板事项已处理或不存在");
    mutable(s, d.businessId, c);
    requireValue(
      p.reason?.trim() &&
        ["APPROVED", "REJECTED", "RETURNED"].includes(p.result),
      "请填写决策结果与意见",
    );
    Object.assign(d, {
      status: p.result,
      opinion: p.reason,
      decidedBy: c.actor.name,
      decidedAt: c.now,
    });
    record(s, c, "记录管理决策", p.reason, d.businessId);
    return true;
  }
  requireValue(r, "风险不存在");
  if (type === "read") {
    s.notifications
      .filter((n) => n.riskId === r.id)
      .forEach((n) => (n.read = true));
    return true;
  }
  if (type === "feedback.review") {
    requireValue(c.actor.role === "approver", "需规则维护人核对");
    requireValue(p.reason?.trim(), "请填写核对意见");
    const f = r.feedback.find((f) => f.id === p.feedbackId);
    requireValue(f, "反馈不存在");
    Object.assign(f, {
      status: p.result === "CONFIRMED" ? "误报确认" : "反馈驳回",
      reviewReason: p.reason,
      reviewedAt: c.now,
      reviewer: c.actor.name,
    });
    history(s, r, c, "核对误报反馈", p.reason);
    return true;
  }
  mutable(s, r.businessId, c);
  requireValue(r.status !== "ARCHIVED", "风险已归档只读");
  requireValue(p.reason?.trim(), "请填写操作原因");
  if (type === "level") {
    requireValue(ranks[p.level], "等级无效");
    requireValue(!(p.close && p.escalate), "关闭与提报不能同时提交");
    requireValue(
      !p.close ||
        !s.decisions.some((d) => d.riskId === r.id && d.status === "PENDING"),
      "尚有待拍板事项，不能关闭",
    );
    let signal = signals(s, r.businessId, day(new Date(c.now))).find(
      (x) => x.key === r.signalKey && x.level,
    );
    const held = s.settings.riskStatHistory?.[r.signalKey]?.find(
      (x) => x.date === day(new Date(c.now)),
    );
    if (!signal && held?.level && r.signal?.statistical)
      signal = { ...r.signal, level: held.level };
    const f = riskFacts(
      s,
      r.businessId,
      riskConfig(s).windowDays,
      "production",
      day(new Date(c.now)),
    );
    const proof = recoveryProof(s, r, day(new Date(c.now)));
    const stamp = JSON.stringify([
      r.id,
      r.level,
      r.status,
      s.riskConfig.version,
      signal?.evidence,
      f.aligned,
      f.stale,
    ]);
    if (r.source === "SYSTEM" && (signal || !proof) && p.confirmStamp !== stamp)
      return {
        needsConfirmation: true,
        stamp,
        reason: signal
          ? "系统异常条件仍存在。本人二次确认后保留原因及依据。"
          : "数据不足以证明恢复，请确认并留痕。",
      };
    const before = r.level;
    r.level = p.useSystem && signal ? signal.level : p.level;
    if (r.source === "SYSTEM")
      r.override = p.useSystem
        ? null
        : { level: r.level, actor: c.actor.name, at: c.now, reason: p.reason };
    if (p.close) {
      r.status = "ARCHIVED";
      r.closedAt = c.now;
      r.closeSnapshot = {
        signal: structuredClone(r.signal),
        reason: p.reason,
        actor: c.actor.name,
        ruleVersion: s.riskConfig.version,
      };
      s.settings.riskEpisodes ||= {};
      if (r.source === "SYSTEM")
        s.settings.riskEpisodes[r.signalKey] = {
          awaitingRecovery: !!signal || !proof,
          riskId: r.id,
        };
    } else r.status = r.level === "P2" ? "OBSERVING" : "PROCESSING";
    if (p.escalate) {
      requireValue(
        p.decision?.title?.trim() &&
          p.decision?.proposal?.trim() &&
          p.decision?.due,
        "请补全待拍板事项、方案及期限",
      );
      s.decisions.push({
        ...p.decision,
        id: c.id(),
        riskId: r.id,
        businessId: r.businessId,
        status: "PENDING",
        ownerId: r.ownerId,
        createdBy: c.actor.name,
        createdAt: c.now,
      });
    }
    history(
      s,
      r,
      c,
      p.close ? "确认关闭风险" : "修改风险等级",
      before + " → " + r.level + "；" + p.reason,
    );
    if (p.notify !== false)
      s.notifications.unshift({
        id: c.id(),
        userId: r.ownerId,
        title: "风险等级调整记录",
        detail: p.reason,
        at: c.now,
        read: false,
        businessId: r.businessId,
        riskId: r.id,
        simulated: true,
      });
    return { needsConfirmation: false };
  }
  if (type === "assign") {
    requireValue(
      s.users.some((u) => u.id === p.ownerId),
      "负责人无效",
    );
    r.ownerId = p.ownerId;
    r.due = p.due;
    notify(s, r, c, true);
  } else if (type === "feedback") {
    if (p.snoozeUntil)
      requireValue(
        Date.parse(p.snoozeUntil) > Date.parse(c.now),
        "暂缓时间须晚于当前时间",
      );
    r.feedback.push({
      id: c.id(),
      reason: p.reason,
      kind: p.kind || "疑似误报",
      status: "待复核",
      actor: c.actor.name,
      at: c.now,
    });
    r.snoozeUntil = p.snoozeUntil || null;
  } else if (type === "evidence") {
    requireValue(
      (p.files || []).length <= 5 &&
        (p.files || []).every((f) => f.size <= 10 * 1024 * 1024),
      "最多5个附件，每个≤10MB",
    );
    requireValue(
      (p.followIds || []).every((id) =>
        s.followups.some(
          (f) => f.id === id && f.businessId === r.businessId && !f.deleted,
        ),
      ),
      "关联跟进须来自当前业务",
    );
    r.files = p.files || [];
    r.followIds = p.followIds || [];
  } else throw Error("未知风险操作");
  history(s, r, c, "风险" + type, p.reason);
  return true;
}
