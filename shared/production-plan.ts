/** Aggregate POC ledger. Counts are metadata; no per-item data is materialised. */
export type PlanNode = {
  id: string;
  kind: "source" | "sourcePool" | "stage" | "buffer" | "delivery";
  label: string;
  x: number;
  y: number;
  mode?: "selection" | "collection" | "purchase";
  platform?: "machine" | "human" | "agent" | "compress";
  executorId?: string;
  batchIds?: string[];
  paused?: boolean;
  bucket?: string;
  bindings?: { executorId: string; batchIds: string[]; at: string }[];
  dailyCapacity?: number;
  outputMode?: "fixed" | "append";
  feedback?: { status: string; completed: number; failed: number; at: string };
};
export type PlanLot = {
  id: string;
  nodeId: string;
  quantity: number;
  remaining: number;
  cid?: string;
  headers?: string[];
  parents: string[];
  state: "available" | "running" | "failed" | "delivered" | "offline";
  executorId?: string;
  batchIds?: string[];
  at: string;
  reason?: string;
  rule?: { prompt: string; columns: string; version: number };
};
export type ProductionPlan = {
  schema: 2;
  revision: number;
  serial: number;
  nodes: PlanNode[];
  edges: { id: string; source: string; target: string }[];
  lots: PlanLot[];
  events: { at: string; detail: string }[];
  seen: string[];
  requests: Record<
    string,
    { nodeId: string; used: boolean; kind?: "selection" | "executor" }
  >;
  goal: number;
  days: number;
  daily: number[];
  cidMeta?: Record<
    string,
    { mode: "fixed" | "append"; version: number; headers: string[] }
  >;
  offline: {
    id: string;
    nodeId: string;
    quantity: number;
    parents: string[];
    cid: string;
    snapshot?: { id: string; quantity: number; remaining: number }[];
    version?: number;
    headers?: string[];
    status: "processing" | "returned" | "cancelled";
    at: string;
  }[];
  retention: { ids: string[]; reason: string; at: string }[];
  rules: Record<string, { prompt: string; columns: string; version: number }>;
};
export type PlanAction = {
  type: string;
  nodeId?: string;
  target?: string;
  quantity?: number;
  mode?: PlanNode["mode"];
  label?: string;
  platform?: PlanNode["platform"];
  source?: string;
  executorId?: string;
  batchIds?: string[];
  requestId?: string;
  eventId?: string;
  cid?: string;
  lotId?: string;
  outputMode?: "fixed" | "append";
  expectedVersion?: number;
  headers?: string[];
  pendingKind?: "selection" | "executor";
  fail?: boolean;
  prompt?: string;
  columns?: string;
  goal?: number;
  days?: number;
  capacity?: number;
  status?: string;
  completed?: number;
  failed?: number;
  x?: number;
  y?: number;
};
const need = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
export function createPlan(): ProductionPlan {
  return {
    schema: 2,
    revision: 0,
    serial: 0,
    nodes: [
      {
        id: "selection",
        kind: "source",
        mode: "selection",
        label: "库内圈选",
        x: 0,
        y: 0,
      },
      {
        id: "collection",
        kind: "source",
        mode: "collection",
        label: "持续采集",
        bucket: "tos://demo-motion/collection/",
        x: 0,
        y: 300,
      },
      {
        id: "purchase",
        kind: "source",
        mode: "purchase",
        label: "采买导入",
        bucket: "tos://demo-motion/purchase/",
        x: 0,
        y: 600,
      },
      { id: "reserve", kind: "sourcePool", label: "资源储备池", x: 380, y: 0 },
      {
        id: "machine",
        kind: "stage",
        platform: "machine",
        label: "机器预标注",
        dailyCapacity: 500000,
        x: 760,
        y: 0,
      },
      { id: "buffer", kind: "buffer", label: "预标注缓冲池", x: 1140, y: 0 },
      {
        id: "human",
        kind: "stage",
        platform: "human",
        label: "人工验收",
        dailyCapacity: 200000,
        x: 1520,
        y: 0,
      },
      { id: "checked", kind: "buffer", label: "验收缓冲池", x: 1900, y: 0 },
      { id: "delivery", kind: "delivery", label: "交付池", x: 2280, y: 0 },
    ],
    edges: [
      ["selection", "reserve"],
      ["collection", "reserve"],
      ["purchase", "reserve"],
      ["reserve", "machine"],
      ["machine", "buffer"],
      ["buffer", "human"],
      ["human", "checked"],
      ["checked", "delivery"],
    ].map(([source, target], i) => ({ id: "edge-" + i, source, target })),
    lots: [],
    events: [],
    seen: [],
    requests: {},
    goal: 10000000,
    days: 30,
    daily: [],
    offline: [],
    retention: [],
    rules: {},
  };
}
/** Bindings control future dispatch; historical batch facts remain after unbinding. */
export function planBatches(p: ProductionPlan) {
  return p.nodes
    .filter((n) => n.kind === "stage")
    .flatMap((n) => {
      const bindings =
        n.bindings ||
        (n.executorId
          ? [{ executorId: n.executorId, batchIds: n.batchIds || [], at: "" }]
          : []);
      const identities = new Map<
        string,
        { executorId: string; batchId: string; bound: boolean }
      >();
      for (const b of bindings)
        for (const batchId of b.batchIds)
          identities.set(JSON.stringify([b.executorId, batchId]), {
            executorId: b.executorId,
            batchId,
            bound: true,
          });
      for (const l of p.lots.filter((l) => l.nodeId === n.id && l.executorId))
        for (const batchId of l.batchIds || []) {
          const key = JSON.stringify([l.executorId, batchId]);
          if (!identities.has(key))
            identities.set(key, {
              executorId: l.executorId!,
              batchId,
              bound: false,
            });
        }
      return [...identities.values()].map((b) => {
        const records = p.lots.filter(
          (l) =>
            l.nodeId === n.id &&
            l.executorId === b.executorId &&
            l.batchIds?.includes(b.batchId),
        );
        return {
          key: JSON.stringify([n.id, b.executorId, b.batchId]),
          nodeId: n.id,
          node: n.label,
          ...b,
          input: records.reduce((s, l) => s + l.quantity, 0),
          running: records
            .filter((l) => l.state === "running")
            .reduce((s, l) => s + l.quantity, 0),
          failed: records
            .filter((l) => l.state === "failed")
            .reduce((s, l) => s + l.quantity, 0),
          completed: records
            .filter((l) => l.state === "available" && l.remaining === 0)
            .reduce((s, l) => s + l.quantity, 0),
        };
      });
    });
}
export const stock = (p: ProductionPlan, id: string) =>
  p.lots
    .filter((l) => l.nodeId === id && l.state === "available")
    .reduce((s, l) => s + l.remaining, 0);
export function planCids(p: ProductionPlan, nodeId: string) {
  const groups = new Map<
    string,
    {
      id: string;
      nodeId: string;
      total: number;
      available: number;
      processing: number;
      consumed: number;
      version: number;
      mode: "fixed" | "append";
      headers: string[];
    }
  >();
  for (const l of p.lots.filter((l) => l.nodeId === nodeId && l.cid)) {
    const meta = p.cidMeta?.[l.cid!];
    let g = groups.get(l.cid!);
    if (!g) {
      g = {
        id: l.cid!,
        nodeId,
        total: 0,
        available: 0,
        processing: 0,
        consumed: 0,
        version: meta?.version || 1,
        mode: meta?.mode || "fixed",
        headers: meta?.headers ||
          l.headers || ["rowkey", "tos_path", "caption"],
      };
      groups.set(l.cid!, g);
    }
    g.total += l.quantity;
    g.available += l.state === "available" ? l.remaining : 0;
    g.processing += l.state === "offline" ? l.remaining : 0;
    g.consumed += l.quantity - l.remaining;
  }
  return [...groups.values()];
}
export function planSignals(p: ProductionPlan) {
  const now = Date.now();
  return p.nodes.flatMap((n) => {
    const out: { nodeId: string; title: string; detail: string }[] = [];
    const running = p.lots.filter(
      (l) => l.nodeId === n.id && l.state === "running",
    );
    if (running.some((l) => now - Date.parse(l.at) > 48 * 3600000))
      out.push({
        nodeId: n.id,
        title: "超过48小时未回传",
        detail: "核对平台运行状态；成功或失败回传后解除，暂停不抹掉风险。",
      });
    const capacity = p.edges
      .filter((e) => e.source === n.id)
      .reduce(
        (s, e) =>
          s + (p.nodes.find((n) => n.id === e.target)?.dailyCapacity || 0),
        0,
      );
    if (
      ["sourcePool", "buffer"].includes(n.kind) &&
      capacity > 0 &&
      p.lots.some((l) => l.nodeId === n.id) &&
      stock(p, n.id) < capacity
    )
      out.push({
        nodeId: n.id,
        title: "可用库存不足下游1日产能",
        detail:
          "按已配置日处理能力预警；补充来源或调整下游分配。演示阈值待业务确认。",
      });
    return out;
  });
}
export function planRisks(p: ProductionPlan) {
  const rate = p.daily.length
    ? p.daily.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, p.daily.length)
    : 0;
  const delivered = p.lots
    .filter((l) => l.state === "delivered")
    .reduce((s, l) => s + l.quantity, 0);
  const daysLeft = Math.max(0, p.days - p.daily.length);
  const deficit = Math.max(0, p.goal - delivered);
  return {
    rate,
    delivered,
    daysLeft,
    deficit,
    eta: rate ? Math.ceil(deficit / rate) : null,
    shortfall: Math.max(0, deficit - rate * daysLeft),
    failed: p.lots
      .filter((l) => l.state === "failed")
      .reduce((s, l) => s + l.remaining, 0),
  };
}
export function applyPlan(
  before: ProductionPlan,
  a: PlanAction,
): ProductionPlan {
  const p = structuredClone(before);
  p.offline ||= [];
  p.cidMeta ||= {};
  p.retention ||= [];
  const n = p.nodes.find((n) => n.id === a.nodeId);
  const now = new Date().toISOString();
  const next = (prefix: string) => prefix + "-" + ++p.serial;
  const log = (s: string) => p.events.push({ at: now, detail: s });
  const amount = () => {
    need(
      Number.isSafeInteger(a.quantity) && a.quantity! > 0,
      "请输入正整数数量",
    );
    return a.quantity!;
  };
  const put = (
    nodeId: string,
    quantity: number,
    parents: string[] = [],
    state: PlanLot["state"] = "available",
    cid?: string,
  ) => {
    const lot: PlanLot = {
      id: next("LOT"),
      nodeId,
      quantity,
      remaining: quantity,
      parents,
      state,
      cid: cid || next("DEMO-CID"),
      at: now,
      headers: a.headers ||
        p.lots.find((l) => parents.includes(l.id))?.headers || [
          "rowkey",
          "tos_path",
          "caption",
        ],
    };
    const old = p.cidMeta![lot.cid!];
    p.cidMeta![lot.cid!] = old || {
      mode: "fixed",
      version: 1,
      headers: lot.headers!,
    };
    lot.rule =
      p.rules[nodeId] || p.lots.find((l) => parents.includes(l.id))?.rule;
    p.lots.push(lot);
    return lot;
  };
  const consume = (
    nodeId: string,
    q: number,
    states: PlanLot["state"][] = ["available"],
    cidId?: string,
  ) => {
    const lots = p.lots.filter(
      (l) =>
        l.nodeId === nodeId &&
        states.includes(l.state) &&
        l.remaining > 0 &&
        (!cidId || l.cid === cidId),
    );
    need(
      lots.reduce((s, l) => s + l.remaining, 0) >= q,
      "可用数量不足，不能重复放行",
    );
    const parents: string[] = [];
    for (const l of lots) {
      const take = Math.min(q, l.remaining);
      if (take) {
        l.remaining -= take;
        q -= take;
        parents.push(l.id);
      }
    }
    return parents;
  };
  if (a.type === "add") {
    const id = next("node");
    const kind = a.source as PlanNode["kind"];
    need(
      ["source", "sourcePool", "stage", "buffer", "delivery"].includes(kind),
      "节点类型无效",
    );
    need(a.label?.trim(), "请填写节点名称");
    p.nodes.push({
      id,
      kind,
      label: a.label!,
      mode: a.mode,
      platform: a.platform,
      x: 380,
      y: 300 + p.nodes.length * 45,
      dailyCapacity: 200000,
    });
    if (kind === "stage") {
      const b = next("buffer");
      p.nodes.push({
        id: b,
        kind: "buffer",
        label: a.label + "缓冲池",
        x: 760,
        y: 300 + p.nodes.length * 45,
      });
      p.edges.push({ id: next("edge"), source: id, target: b });
    }
    log("新增 " + a.label);
  } else if (a.type === "connect") {
    need(a.source !== a.target, "不能连接自身");
    const from = p.nodes.find((n) => n.id === a.source),
      to = p.nodes.find((n) => n.id === a.target);
    need(from && to, "节点不存在");
    need(
      from!.kind !== "delivery" && to!.kind !== "source",
      "交付是终点，来源是起点",
    );
    need(
      from!.kind !== "stage" || to!.kind === "buffer",
      "工序输出需要缓冲池确认",
    );
    need(
      !p.edges.some((e) => e.source === a.source && e.target === a.target),
      "关系已存在",
    );
    const reaches = (id: string, seen = new Set<string>()): boolean => {
      if (id === a.source) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return p.edges
        .filter((e) => e.source === id)
        .some((e) => reaches(e.target, seen));
    };
    need(!reaches(a.target!), "禁止成环；异常请建新工序");
    p.edges.push({ id: next("edge"), source: a.source!, target: a.target! });
    log("新增交接关系");
  } else if (a.type === "disconnect") {
    p.edges = p.edges.filter((e) => e.id !== a.source);
    log("移除后续交接，历史批次保留");
  } else if (a.type === "plan") {
    need(
      Number.isSafeInteger(a.goal) &&
        a.goal! > 0 &&
        Number.isSafeInteger(a.days) &&
        a.days! >= 1 &&
        a.days! <= 365,
      "目标和工期无效",
    );
    p.goal = a.goal!;
    p.days = a.days!;
    log("更新生产目标与工期");
  } else if (a.type === "day") {
    const q = a.quantity ?? 0;
    need(Number.isSafeInteger(q) && q >= 0, "日产量无效");
    need(p.daily.length < p.days, "已达计划工期");
    p.daily.push(q);
    log("登记第 " + p.daily.length + " 天有效交付产能 " + q.toLocaleString());
  } else {
    need(n, "节点不存在");
    if (a.type === "move") {
      n!.x = a.x!;
      n!.y = a.y!;
    } else if (a.type === "pause") {
      n!.paused = !n!.paused;
      log(n!.label + (n!.paused ? "暂停" : "恢复"));
    } else if (a.type === "request") {
      need(a.requestId, "请求无效");
      p.requests[a.requestId!] = {
        nodeId: n!.id,
        used: false,
        kind: a.pendingKind || "executor",
      };
      log(
        (a.pendingKind === "selection" ? "发起圈选 " : "发起执行器创建 ") +
          n!.label,
      );
    } else if (a.type === "bind") {
      need(n!.kind === "stage", "仅工序可绑定");
      need(
        a.executorId?.trim() && a.batchIds?.length,
        "需要执行器和至少一个批次",
      );
      need(
        !p.nodes.some(
          (x) =>
            x.id !== n!.id &&
            x.platform === n!.platform &&
            (x.executorId === a.executorId ||
              (x.bindings || []).some((b) => b.executorId === a.executorId)),
        ),
        "执行器已绑定其他工序",
      );
      const prior = (n!.bindings || []).find(
        (b) => b.executorId === a.executorId,
      );
      need(
        !prior || a.batchIds!.some((id) => !prior.batchIds.includes(id)),
        "所选批次已绑定，请直接调度",
      );
      if (a.requestId) {
        const request = p.requests[a.requestId];
        need(
          request && request.nodeId === n!.id && !request.used,
          "回传过期、重复或节点不匹配",
        );
        request.used = true;
      }
      const bindings =
        n!.bindings ||
        (n!.executorId
          ? [
              {
                executorId: n!.executorId,
                batchIds: n!.batchIds || [],
                at: now,
              },
            ]
          : []);
      const current = bindings.find((b) => b.executorId === a.executorId);
      const batchIds = [
        ...new Set([...(current?.batchIds || []), ...a.batchIds!]),
      ];
      n!.bindings = current
        ? bindings.map((b) =>
            b.executorId === a.executorId ? { ...b, batchIds } : b,
          )
        : [...bindings, { executorId: a.executorId!, batchIds, at: now }];
      n!.executorId = a.executorId;
      n!.batchIds = batchIds;
      if (a.status)
        n!.feedback = {
          status: a.status,
          completed: Math.max(0, Number(a.completed) || 0),
          failed: Math.max(0, Number(a.failed) || 0),
          at: now,
        };
      log(
        "绑定执行器 " + a.executorId + "（" + a.batchIds!.length + "个批次）",
      );
    } else if (a.type === "unbind") {
      const executor = a.executorId || n!.executorId;
      const removed = a.batchIds;
      need(
        !p.lots.some(
          (l) =>
            l.nodeId === n!.id &&
            l.executorId === executor &&
            l.state === "running" &&
            (!removed || l.batchIds?.some((id) => removed.includes(id))),
        ),
        "所选批次运行中，不能解绑；其他绑定不受影响",
      );
      n!.bindings = (n!.bindings || []).flatMap((b) => {
        if (b.executorId !== executor) return [b];
        const rest = removed
          ? b.batchIds.filter((id) => !removed.includes(id))
          : [];
        return rest.length ? [{ ...b, batchIds: rest }] : [];
      });
      const latest = n!.bindings.at(-1);
      n!.executorId = latest?.executorId;
      n!.batchIds = latest?.batchIds;
      log(
        "解除绑定 " +
          executor +
          (removed ? " / " + removed.join(",") : "") +
          "；历史生产与血缘保留",
      );
    } else if (a.type === "configureOutput") {
      need(n!.kind === "stage", "仅生产环节可配置产出");
      need(
        !p.lots.some((l) => l.nodeId === n!.id && l.executorId),
        "已有生产记录，请新增工序变更生产模式",
      );
      need(["fixed", "append"].includes(a.outputMode || ""), "请选择生产模式");
      n!.outputMode = a.outputMode;
      log("产出模式：" + a.outputMode);
    } else if (a.type === "ingest") {
      need(n!.kind === "source" && !n!.paused, "来源不可接入");
      need(a.eventId && !p.seen.includes(a.eventId), "此批数据已接入");
      if (n!.mode === "selection") {
        need(a.cid?.startsWith("DEMO-CID-"), "圈选CID无效");
        if (a.requestId) {
          const req = p.requests[a.requestId];
          need(
            req &&
              req.kind === "selection" &&
              req.nodeId === n!.id &&
              !req.used,
            "圈选回传已使用或节点不匹配",
          );
          req.used = true;
        }
      }
      if (n!.mode === "purchase")
        need(
          !p.lots.some((l) => l.nodeId === n!.id),
          "采买是一次性导入，新增采购请建新来源",
        );
      const q = amount();
      const cidId =
        a.cid ||
        (n!.mode === "collection" ? "DEMO-CID-" + n!.id : next("DEMO-CID"));
      put(n!.id, q, [], "available", cidId);
      p.cidMeta![cidId].mode = n!.mode === "collection" ? "append" : "fixed";
      p.seen.push(a.eventId!);
      log(n!.label + "接入 " + q.toLocaleString() + " 条（批次元数据）");
    } else if (a.type === "offline") {
      need(["sourcePool", "buffer"].includes(n!.kind), "只能在池内处理CID");
      need(a.cid, "请只选择一个CID");
      const cid = planCids(p, n!.id).find((c) => c.id === a.cid);
      need(cid && cid.available > 0, "CID没有可处理的数据");
      need(
        !p.offline.some((j) => j.cid === a.cid && j.status === "processing"),
        "该CID已在离线处理",
      );
      need(
        cid!.consumed === 0,
        "CID已有数据进入下游生产，不能覆盖；请在平台生成新CID后接入",
      );
      const records = p.lots.filter(
        (l) =>
          l.nodeId === n!.id &&
          l.cid === a.cid &&
          l.state === "available" &&
          l.remaining > 0,
      );
      const snapshot = records.map((l) => ({
        id: l.id,
        quantity: l.quantity,
        remaining: l.remaining,
      }));
      for (const l of records) l.state = "offline";
      p.offline.push({
        id: next("OFFLINE"),
        nodeId: n!.id,
        quantity: cid!.available,
        parents: records.map((l) => l.id),
        cid: a.cid!,
        version: cid!.version,
        headers: cid!.headers,
        snapshot,
        status: "processing",
        at: now,
      });
      log(
        "登记单一CID离线处理 " +
          a.cid +
          "，当前 " +
          cid!.available.toLocaleString() +
          " 条",
      );
    } else if (a.type === "offlineReturn" || a.type === "offlineCancel") {
      const job = p.offline.find((j) => j.id === a.lotId && j.nodeId === n!.id);
      need(job?.status === "processing", "离线任务已结束或不存在");
      if (!job!.snapshot && a.type === "offlineCancel") {
        put(n!.id, job!.quantity, job!.parents, "available", job!.cid);
        job!.status = "cancelled";
        log("已取消旧版离线任务，仅解除占用，不覆盖CID");
        p.revision++;
        return p;
      }
      need(job!.snapshot, "旧版离线任务请先取消，再选择实际CID处理");
      const meta = p.cidMeta![job!.cid] || {
        mode: "fixed" as const,
        version: 1,
        headers: job!.headers || ["rowkey", "tos_path", "caption"],
      };
      need(meta.version === (job!.version || 1), "CID版本冲突，请重新下载核对");
      for (const item of job!.snapshot!) {
        const l = p.lots.find((l) => l.id === item.id);
        need(
          l &&
            l.state === "offline" &&
            l.quantity === item.quantity &&
            l.remaining === item.remaining,
          "离线范围已经变化，禁止覆盖",
        );
      }
      if (a.type === "offlineCancel") {
        for (const item of job!.snapshot!) {
          p.lots.find((l) => l.id === item.id)!.state = "available";
        }
        job!.status = "cancelled";
        log("取消离线处理 " + job!.cid);
      } else {
        need(a.cid === job!.cid, "上传CID与所选CID不一致");
        need(a.expectedVersion === (job!.version || 1), "上传清单版本不匹配");
        need(
          Number.isSafeInteger(a.quantity) && a.quantity! >= 0,
          "上传后的总量无效",
        );
        const headers = a.headers || meta.headers;
        need(
          Array.isArray(headers) &&
            headers.includes("rowkey") &&
            headers.includes("tos_path") &&
            headers.every((h) => typeof h === "string" && h.trim()) &&
            new Set(headers).size === headers.length,
          "回传必须保留原始定位表头，字段名不能为空或重复",
        );
        for (const item of job!.snapshot!) {
          const l = p.lots.find((l) => l.id === item.id)!;
          l.state = "available";
          l.quantity = 0;
          l.remaining = 0;
        }
        put(n!.id, a.quantity!, job!.parents, "available", job!.cid);
        p.cidMeta![job!.cid] = {
          ...meta,
          version: meta.version + 1,
          headers: a.headers || meta.headers,
        };
        job!.status = "returned";
        log(
          "覆盖原CID " +
            job!.cid +
            "，回传 " +
            a.quantity!.toLocaleString() +
            " 条；池现存 " +
            stock(p, n!.id).toLocaleString() +
            " 条，期间新增保留",
        );
      }
    } else if (a.type === "retain") {
      need(n!.kind === "delivery", "仅交付池可留存");
      const all = p.lots.filter(
        (l) => l.nodeId === n!.id && l.state === "delivered",
      );
      const ids = (a.source || "").split(",").filter(Boolean);
      need(
        ids.every((id) => all.some((l) => l.id === id)),
        "留存范围无效",
      );
      need(
        ids.length === all.length || a.label?.trim(),
        "未留存部分请填写共享原因",
      );
      p.retention.push({ ids, reason: a.label || "", at: now });
      log(
        "提交独立留存任务，选择 " + ids.length + " 个交付批次，不改变结项审批",
      );
    } else if (a.type === "transfer") {
      need(!n!.paused, "已暂停放行");
      const to = p.nodes.find((n) => n.id === a.target);
      need(
        to && p.edges.some((e) => e.source === n!.id && e.target === to.id),
        "请先连接目标",
      );
      need(!to!.paused, "下游已暂停");
      if (to!.kind === "stage") {
        const binding = a.executorId
          ? (to!.bindings || []).find((b) => b.executorId === a.executorId)
          : { executorId: to!.executorId, batchIds: to!.batchIds };
        need(
          binding?.executorId && binding.batchIds?.length,
          "请先去标注创建或绑定执行器",
        );
        if (a.batchIds)
          need(
            a.batchIds.length === 1 &&
              binding!.batchIds!.includes(a.batchIds[0]),
            "请选择该执行器下的一个实际生产批次",
          );
      }
      const candidates = planCids(p, n!.id).filter((c) => c.available > 0);
      const selectedCid =
        a.cid || (candidates.length === 1 ? candidates[0].id : undefined);
      need(selectedCid, "请选择单一输入CID，不能合并多个CID");
      const input = candidates.find((c) => c.id === selectedCid);
      need(input, "CID不可用");
      const q = to!.kind === "stage" ? amount() : input!.available;
      if (to!.kind !== "stage" && a.quantity !== undefined)
        need(a.quantity === q, "池间交接按整个CID，只有生产环节按数量执行");
      const parents = consume(n!.id, q, ["available"], selectedCid);
      const l = put(
        to!.id,
        q,
        parents,
        to!.kind === "stage"
          ? "running"
          : to!.kind === "delivery"
            ? "delivered"
            : "available",
        selectedCid,
      );
      l.rule = p.rules[n!.id] || l.rule;
      l.executorId = a.executorId || to!.executorId;
      l.batchIds =
        a.batchIds || (to!.batchIds?.length === 1 ? to!.batchIds : undefined);
      if (to!.kind === "stage")
        need(
          l.batchIds?.length === 1,
          "请选择具体平台生产批次，不能把多个批次合并成一批",
        );
      log(n!.label + " → " + to!.label + " " + q.toLocaleString() + " 条");
    } else if (a.type === "stale") {
      const l = p.lots.find((l) => l.nodeId === n!.id && l.state === "running");
      need(l, "没有运行批次");
      l!.at = new Date(Date.now() - 49 * 3600000).toISOString();
      log("模拟回传中断49小时，触发新鲜度预警");
    } else if (a.type === "report") {
      const l = p.lots.find((l) => l.id === a.lotId && l.nodeId === n!.id);
      need(l && l.state === "running", "批次已完成或不存在，回传不重复记账");
      if (a.fail) {
        l!.state = "failed";
        l!.reason = "平台处理失败，需新线路承接";
        log("异常回传 " + l!.id);
      } else {
        const out = p.edges.find(
          (e) =>
            e.source === n!.id &&
            p.nodes.find((n) => n.id === e.target)?.kind === "buffer",
        );
        need(out, "请连接输出缓冲池");
        l!.state = "available";
        l!.remaining = 0;
        const outputCid =
          n!.outputMode === "append"
            ? "DEMO-CID-OUTPUT-" + n!.id
            : "DEMO-CID-" +
              n!.id +
              "-" +
              l!.executorId +
              "-" +
              l!.batchIds?.[0];
        put(out!.target, l!.quantity, [l!.id], "available", outputCid);
        p.cidMeta![outputCid].mode =
          n!.outputMode === "append" ? "append" : "fixed";
        log("产出回传至缓冲池 " + l!.quantity.toLocaleString() + " 条");
      }
    } else if (a.type === "recover") {
      const q = amount();
      const parents = consume(n!.id, q, ["failed"]);
      const id = next("recovery"),
        b = next("buffer");
      const platform = a.platform || "human";
      p.nodes.push(
        {
          id,
          kind: "stage",
          platform,
          label: a.label || "异常处理新工序",
          x: n!.x + 380,
          y: n!.y + 350,
        },
        {
          id: b,
          kind: "buffer",
          label: "异常处理缓冲池",
          x: n!.x + 760,
          y: n!.y + 350,
        },
      );
      put(id, q, parents);
      p.edges.push(
        { id: next("edge"), source: n!.id, target: id },
        { id: next("edge"), source: id, target: b },
      );
      log("异常隔离并转入新工序；请绑定执行器后启动");
    } else if (a.type === "start") {
      need(n!.executorId, "请绑定执行器");
      need(!n!.paused, "工序已暂停");
      const q = amount(),
        parents = consume(n!.id, q);
      const l = put(n!.id, q, parents, "running");
      l.executorId = n!.executorId;
      l.batchIds = n!.batchIds;
      log("启动异常处理批次 " + l.id);
    } else if (a.type === "rule") {
      need(a.prompt?.trim(), "请输入处理要求");
      const version = (p.rules[n!.id]?.version || 0) + 1;
      p.rules[n!.id] = { prompt: a.prompt!, columns: a.columns || "", version };
      log("确认AI表处理规则 v" + version + "；仅预览已验证，全量由平台执行");
    } else throw Error("操作不支持");
  }
  p.revision++;
  p.events = p.events.slice(-200);
  return p;
}
