/** Authoritative local pull decisions, immutable result references and receipts. */
import {
  mutable,
  requireValue as ok,
  record,
  day,
  type State,
  type Context,
  type Command,
} from "../../shared/types";
import {
  latest,
  productionData,
  platforms,
  type ProductionNode,
  type ProductionVersion,
} from "../../shared/production";
import {
  allocateArrivals,
  rowQuantity,
  flowQuantity,
  claimedQuantity,
  unallocatedQuantity,
  processUnitPullAllowance,
  defaultStages,
  validatePullGraph,
  pipeRows,
  pipeKey,
  type FlowResult,
} from "../../shared/pull-flow";
const clone = <T>(x: T): T => structuredClone(x);
export function handlePullFlow(s: State, cmd: Command, c: Context): any {
  if (!cmd.type.startsWith("production.flow.")) return undefined;
  ok(
    c.actor.role === "pm" || c.actor.role === "approver",
    "当前身份不能修改生产业务",
  );
  const x = cmd.payload,
    b = mutable(s, x.businessId, c);
  ok(b.kind === "project", "生产管理仅适用于项目");
  const p = productionData(s, b.id),
    ch = p.chains.find((ch) => ch.id === x.chainId);
  ok(ch && !ch.voided, "链路不存在或已作废");
  const v = latest(ch);
  ok(!x.versionId || x.versionId === v.id, "历史修订只读，请核对当前版本");
  const action = cmd.type.slice("production.flow.".length);
  const log = (label: string, detail: string, snapshot?: unknown) => {
    const r = record(s, c, label, detail, b.id, snapshot);
    p.audit.unshift(r);
  };
  if (action === "upgrade") {
    ok(v.mode !== "pull", "已经是按需取数编排");
    ok(!ch.draft, "请先处理已有草稿");
    const d = clone(v);
    d.mode = "pull";
    d.stages = defaultStages();
    d.allocations = {};
    d.baseline = null;
    d.nodes = d.nodes.map((n) => ({
      ...n,
      kind: "platform",
      stageId:
        n.id === d.output
          ? "delivery"
          : d.inputs.includes(n.id)
            ? "source"
            : "process",
      platformRef: p.tasks.find((t) => t.id === n.taskId)?.name || "",
      flowUnit: p.tasks.find((t) => t.id === n.taskId)?.unit || b.unit,
      resultFields: [],
      requiredFields: [],
      flowResults: [],
      reports: [],
      reportHistory: [],
      corrections: {},
      batches: [],
      selected: [],
      taskId: "",
    }));
    if (d.output) {
      const previous = d.nodes.find((n) => n.id === d.output)!;
      previous.stageId = "process";
      const delivery: ProductionNode = {
        ...clone(previous),
        id: c.id(),
        title: "交付汇总",
        platform: "FLOW",
        kind: "router",
        stageId: "delivery",
        platformRef: "",
        position: { x: previous.position.x + 300, y: previous.position.y },
        flowResults: [],
        resultFields: [],
        requiredFields: [],
      };
      d.edges.push({ from: previous.id, to: delivery.id });
      d.nodes.push(delivery);
      d.output = delivery.id;
    }
    ch.draft = d;
    log("创建按需取数草稿", "仅转换配置，历史日报不生成逐条数据");
    return {};
  }
  ok(v.mode === "pull" || ch.draft?.mode === "pull", "请先创建按需取数编排");
  if (action === "review") {
    ok(
      typeof x.issueKey === "string" &&
        x.issueKey.trim() &&
        x.issueKey.length <= 200,
      "请指定风险或问题",
    );
    ok(!x.nodeId || v.nodes.some((n) => n.id === x.nodeId), "关联节点不存在");
    ok(
      s.users.some((u) => u.id === x.ownerId),
      "请选择有效负责人",
    );
    ok(["open", "acted", "verified"].includes(x.status), "复查状态无效");
    ok(
      typeof x.action === "string" &&
        x.action.trim() &&
        typeof x.note === "string" &&
        x.note.trim(),
      "请填写处理动作及结论",
    );
    ok(
      /^\d{4}-\d{2}-\d{2}$/.test(x.reviewDate) &&
        !Number.isNaN(Date.parse(x.reviewDate + "T00:00:00Z")),
      "请填写复查日期",
    );
    ok(
      x.evidence &&
        Number.isSafeInteger(x.evidence.quantity) &&
        x.evidence.quantity >= 0,
      "请填写复查数量证据",
    );
    if (x.status === "verified")
      ok(
        x.evidence.asOf && !Number.isNaN(Date.parse(x.evidence.asOf)),
        "确认复查须填写证据时间",
      );
    if (x.status === "verified") {
      const previous = (p.flowReviews || [])
        .filter((r) => r.chainId === ch.id && r.issueKey === x.issueKey.trim())
        .at(-1);
      const scope = v.nodes.find((n) => n.id === (x.nodeId || v.output));
      ok(scope, "请指定有真实证据的复查节点");
      const actualAt = [
        ...(scope.flowResults || []).map((r) => r.at),
        ...(p.pullReceipts || [])
          .filter((r) => r.chainId === ch.id && r.to === scope.id)
          .map((r) => r.at),
      ]
        .sort()
        .at(-1);
      ok(
        actualAt &&
          x.evidence.asOf === actualAt &&
          x.evidence.quantity === flowQuantity(scope.flowResults || []),
        "复查证据须匹配当前节点的真实最新记录时间和产出数量",
      );
      ok(
        !previous ||
          (Date.parse(actualAt) >= Date.parse(previous.at) &&
            (!previous.evidence.asOf ||
              Date.parse(actualAt) > Date.parse(previous.evidence.asOf))),
        "复查证据须来自上次处理之后的新记录",
      );
      ok(
        Date.parse(x.evidence.asOf) <= Date.parse(c.now),
        "复查证据时间不能晚于当前时间",
      );
    }
    const review = {
      id: c.id(),
      chainId: ch.id,
      versionId: v.id,
      issueKey: x.issueKey.trim(),
      nodeId: x.nodeId,
      ownerId: x.ownerId,
      action: x.action.trim(),
      note: x.note.trim(),
      reviewDate: x.reviewDate,
      status: x.status,
      at: c.now,
      actor: c.actor.name,
      evidence: clone(x.evidence),
    };
    (p.flowReviews ||= []).push(review);
    log("记录处理与复查", review.note, review);
    return review;
  }
  if (action === "save") {
    const d = clone(x.value) as ProductionVersion;
    ok(d.id === v.id && d.mode === "pull", "草稿版本不匹配");
    const old = ch.draft || v;
    if (v.output && v.nodes.find((n) => n.id === v.output)?.flowResults?.length)
      ok(
        d.output === v.output,
        "已有交付准入结果的汇总入口须保留，避免重复计算历史产量",
      );
    d.target = v.target;
    d.confirmedAt = v.confirmedAt;
    d.revision = v.revision;
    d.status = v.status;
    if (d.output && d.output !== v.output)
      ok(
        !old.nodes.find((n) => n.id === d.output)?.flowResults?.length,
        "已有留存结果请通过新的交付汇总环节按准入规则领取，不直接改为交付产量",
      );
    d.nodes = d.nodes.map((n) => {
      const source = old.nodes.find((o) => o.id === n.id);
      if (source?.flowResults?.length) {
        ok(
          source.platform === n.platform &&
            source.platformRef === n.platformRef &&
            source.flowUnit === n.flowUnit &&
            source.kind === n.kind,
          "已有结果的节点不能更换平台、关联项目、类型或单位，请新增环节",
        );
        ok(
          JSON.stringify(source.resultFields || []) ===
            JSON.stringify(n.resultFields || []),
          "已有结果的字段结构不能改写，请新增环节",
        );
      }
      ok(
        n.kind === "router"
          ? n.platform === "FLOW"
          : !!platforms[n.platform] && n.platform !== "FLOW",
        "节点平台无效",
      );
      return {
        ...n,
        flowResults: source?.flowResults || [],
        reports: [],
        reportHistory: [],
        corrections: {},
        batches: source?.batches || [],
        selected: [],
        taskId: "",
        scopeVersion: 0,
        finalConfirmed: false,
      };
    });
    validatePullGraph(d, false);
    ok(
      !d.output || d.nodes.find((n) => n.id === d.output)?.flowUnit === b.unit,
      "交付入口单位须与项目一致",
    );
    ch.draft = d;
    return {};
  }
  ok(v.mode === "pull" && v.confirmedAt && !ch.draft, "请先发布编排草稿");
  const sync = (nodeId: string, fn: (n: ProductionNode) => void) => {
    for (const ver of ch.versions.filter((ver) => ver.mode === "pull")) {
      const n = ver.nodes.find((n) => n.id === nodeId);
      if (n) fn(n);
    }
  };
  if (action === "deposit") {
    ok(
      typeof x.requestId === "string" &&
        x.requestId.trim() &&
        x.requestId.length <= 100,
      "请提供沉淀登记请求标识",
    );
    ok(
      typeof x.libraryRef === "string" &&
        x.libraryRef.trim() &&
        x.libraryRef.length <= 200,
      "请填写目的资源库标识",
    );
    ok(typeof x.note === "string" && x.note.trim(), "请填写关联登记说明");
    const signature = JSON.stringify({
      chainId: ch.id,
      nodeId: x.nodeId,
      resultId: x.resultId,
      quantity: x.quantity,
      libraryRef: x.libraryRef.trim(),
      note: x.note.trim(),
    });
    const previous = (p.flowDeposits || []).find(
      (d) => d.requestId === x.requestId,
    );
    if (previous) {
      ok(previous.signature === signature, "请求标识已用于其他沉淀登记");
      return previous;
    }
    const node = v.nodes.find((n) => n.id === v.output),
      row = node?.flowResults?.find((r) => r.id === x.resultId);
    ok(
      node && x.nodeId === v.output && row,
      "仅交付候选入口现有结果可登记沉淀关联",
    );
    const used = (p.flowDeposits || [])
      .filter(
        (d) =>
          d.chainId === ch.id &&
          d.nodeId === node.id &&
          d.resultId === row.id &&
          d.libraryRef === x.libraryRef.trim(),
      )
      .reduce((sum, d) => sum + d.quantity, 0);
    ok(
      Number.isSafeInteger(x.quantity) &&
        x.quantity > 0 &&
        x.quantity <= rowQuantity(row) - used,
      "同来源同资源库累计登记数量超过候选结果数量",
    );
    const result = clone(row);
    result.quantity = x.quantity;
    result.cost =
      row.cost == null
        ? null
        : Number(
            (BigInt(row.cost) * BigInt(x.quantity)) / BigInt(rowQuantity(row)),
          );
    const deposit = {
      id: c.id(),
      requestId: x.requestId,
      signature,
      chainId: ch.id,
      versionId: v.id,
      nodeId: node.id,
      resultId: row.id,
      quantity: x.quantity,
      libraryRef: x.libraryRef.trim(),
      note: x.note.trim(),
      result,
      at: c.now,
      actor: c.actor.name,
    };
    (p.flowDeposits ||= []).push(deposit);
    log("登记资源库关联（本地示意）", deposit.note, deposit);
    return deposit;
  }
  if (action === "retire") {
    const n = v.nodes.find((n) => n.id === x.nodeId);
    ok(n, "节点不存在");
    ok(typeof x.retired === "boolean", "请指定退场状态");
    ok(typeof x.reason === "string" && x.reason.trim(), "请填写退场或恢复原因");
    n.retiredAt = x.retired ? c.now : undefined;
    n.retirementReason = x.reason.trim();
    if (x.retired)
      for (const e of v.edges.filter((e) => e.from === n.id || e.to === n.id))
        (p.pipeGates ||= {})[pipeKey(ch.id, e.from, e.to)] = false;
    log(x.retired ? "环节退场" : "恢复环节", n.retirementReason, {
      nodeId: n.id,
      retired: x.retired,
    });
    return {};
  }
  if (action === "disposition") {
    ok(
      typeof x.requestId === "string" &&
        x.requestId.trim() &&
        x.requestId.length <= 100,
      "请提供处置请求标识",
    );
    ok(["discard", "recover"].includes(x.action), "处置方式无效");
    ok(typeof x.reason === "string" && x.reason.trim(), "请填写处置原因");
    const signature = JSON.stringify({
      chainId: ch.id,
      nodeId: x.nodeId,
      resultId: x.resultId,
      quantity: x.quantity,
      action: x.action,
      reason: x.reason.trim(),
    });
    const previous = (p.flowDispositions || []).find(
      (d) => d.requestId === x.requestId,
    );
    if (previous) {
      ok(previous.signature === signature, "请求标识已用于其他处置");
      return previous;
    }
    const n = v.nodes.find((n) => n.id === x.nodeId),
      row = n?.flowResults?.find((r) => r.id === x.resultId);
    ok(n && row, "处置数据不存在");
    ok(n.id !== v.output, "交付候选结果须通过正式交付或反馈处理，不可在此处置");
    ok(
      Number.isSafeInteger(x.quantity) &&
        x.quantity > 0 &&
        x.quantity <= unallocatedQuantity(p, ch.id, n.id, row),
      "处置数量超过未领取且未分配的可用余额",
    );
    if (x.action === "recover") {
      const marked = (p.flowDispositions || [])
        .filter(
          (d) =>
            d.chainId === ch.id &&
            d.nodeId === n.id &&
            d.resultId === row.id &&
            d.action === "recover",
        )
        .reduce((sum, d) => sum + d.quantity, 0);
      ok(
        marked + x.quantity <= rowQuantity(row),
        "回捞候选标记数量超过原结果总量",
      );
    }
    const disposition = {
      id: c.id(),
      requestId: x.requestId,
      signature,
      chainId: ch.id,
      versionId: v.id,
      nodeId: n.id,
      resultId: row.id,
      quantity: x.quantity,
      action: x.action as "discard" | "recover",
      reason: x.reason.trim(),
      at: c.now,
      actor: c.actor.name,
    };
    (p.flowDispositions ||= []).push(disposition);
    log(
      x.action === "discard" ? "登记丢弃处置" : "标记回捞候选",
      disposition.reason,
      disposition,
    );
    return disposition;
  }
  if (action === "schema") {
    const n = v.nodes.find((n) => n.id === x.nodeId);
    ok(
      n?.kind === "platform" && !n.flowResults?.length,
      "已有结果的字段结构须保留，请使用新平台环节",
    );
    ok(Array.isArray(x.fields), "平台字段结构无效");
    const fields = clone(x.fields);
    const next = clone(v);
    next.nodes.find((a) => a.id === n.id)!.resultFields = fields;
    validatePullGraph(next);
    sync(n.id, (n) => {
      n.resultFields = fields;
    });
    log("同步平台字段", n.title, { nodeId: n.id, fields });
    return {};
  }
  if (action === "gate") {
    ok(typeof x.open === "boolean", "开关值无效");
    ok(
      v.edges.some((e) => e.from === x.from && e.to === x.to),
      "管道不存在",
    );
    (p.pipeGates ||= {})[pipeKey(ch.id, x.from, x.to)] = x.open;
    log("切换管道", `${x.from} → ${x.to}：${x.open ? "开放" : "关闭"}`, {
      versionId: v.id,
      from: x.from,
      to: x.to,
      open: x.open,
    });
    return {};
  }
  if (action === "feedback") {
    const n = v.nodes.find((n) => n.id === v.output);
    ok(n, "请先指定交付汇总入口");
    ok(
      Number.isSafeInteger(x.quantity) && x.quantity >= 0,
      "客户接受量须为非负整数",
    );
    ok(
      typeof x.name === "string" && x.name.trim() && x.name.length <= 50,
      "请填写50字以内批次名称",
    );
    ok(
      x.quantity > 0 || String(x.feedback || "").trim(),
      "零接受量须填写客户反馈",
    );
    const batch = {
      id: c.id(),
      name: x.name.trim(),
      quantity: x.quantity,
      feedback: String(x.feedback || ""),
      selected: [`flow-${n.id}`],
      createdAt: c.now,
      at: c.now,
      actor: c.actor.name,
    };
    sync(n.id, (n) => {
      n.batches.push(clone(batch));
    });
    p.costConfirmed = false;
    log("登记客户反馈", batch.name, batch);
    return batch;
  }
  if (action === "pull") {
    ok(
      typeof x.requestId === "string" &&
        x.requestId.length > 0 &&
        x.requestId.length <= 100,
      "请提供取数请求标识",
    );
    const signature = JSON.stringify({
      chainId: ch.id,
      versionId: v.id,
      from: x.from,
      to: x.to,
      ids: x.resultIds ? [...x.resultIds].sort() : null,
      count: x.count ?? null,
      quantities: x.quantities ?? null,
    });
    const previous = (p.pullReceipts || []).find(
      (r) => r.requestId === x.requestId,
    );
    if (previous) {
      ok(previous.signature === signature, "请求标识已用于其他取数操作");
      return previous;
    }
    ok(v.status === "RUNNING", "请先开始或恢复生产");
    const source = v.nodes.find((n) => n.id === x.from),
      target = v.nodes.find((n) => n.id === x.to);
    ok(source && target, "取数节点不存在");
    const candidates = pipeRows(p, ch.id, v, x.from, x.to);
    ok(candidates.open, "管道已关闭，不接受新取数");
    let rows: FlowResult[] = [];
    const quantities: Record<string, number> = {};
    if (x.resultIds || x.quantities) {
      const ids: string[] = x.resultIds || Object.keys(x.quantities);
      ok(
        Array.isArray(ids) &&
          ids.length > 0 &&
          new Set(ids).size === ids.length,
        "请选择不重复的数据",
      );
      for (const id of ids) {
        const item = candidates.rows.find((r) => r.row.id === id);
        ok(item, "数据不存在，请刷新");
        ok(!item.reason, item.reason);
        ok(!item.taken, "数据已被领取或不存在，请刷新");
        const quantity = x.quantities?.[id] ?? item.remainingQuantity;
        ok(
          Number.isSafeInteger(quantity) &&
            quantity > 0 &&
            quantity <= item.remainingQuantity,
          "领取数量超过当前可用余额",
        );
        quantities[id] = quantity;
        rows.push({ ...item.row, quantity });
      }
    } else {
      ok(Number.isSafeInteger(x.count) && x.count > 0, "取数数量须为正整数");
      ok(
        candidates.availableQuantity >= x.count,
        "符合条件且尚未领取的数据不足",
      );
      let remaining = x.count;
      for (const item of candidates.available) {
        const quantity = Math.min(remaining, item.remainingQuantity);
        if (!quantity) break;
        quantities[item.row.id] = quantity;
        rows.push({ ...item.row, quantity });
        remaining -= quantity;
      }
    }
    const allowance = processUnitPullAllowance(
      p,
      ch.id,
      v,
      target.id,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(c.now)),
    );
    ok(
      allowance.remaining == null || flowQuantity(rows) <= allowance.remaining,
      `超过同环节短板允许的当日投入余额 ${allowance.remaining ?? ""}；${allowance.reason}`,
    );
    rows = rows.map((row) => {
      const original = source.flowResults!.find((r) => r.id === row.id)!;
      const prior = claimedQuantity(p, ch.id, x.from, row.id);
      const quantity = rowQuantity(row),
        total = rowQuantity(original);
      const priorRows = (p.pullReceipts || [])
        .filter((r) => r.chainId === ch.id && r.from === x.from)
        .flatMap((r) => r.results.filter((result) => result.id === row.id));
      const remainingCost =
        original.cost == null || priorRows.some((r) => r.cost == null)
          ? null
          : original.cost - priorRows.reduce((sum, r) => sum + r.cost!, 0);
      return {
        ...row,
        cost:
          remainingCost == null
            ? null
            : Number(
                (BigInt(remainingCost) * BigInt(quantity)) /
                  BigInt(total - prior),
              ),
      };
    });
    const edge = v.edges.find((e) => e.from === x.from && e.to === x.to)!;
    const receipt = {
      id: c.id(),
      requestId: x.requestId,
      signature,
      chainId: ch.id,
      versionId: v.id,
      from: x.from,
      to: x.to,
      resultIds: rows.map((r) => r.id),
      quantities,
      results: clone(rows),
      rules: clone(edge.rules || []),
      requiredFields: clone(target.requiredFields || []),
      at: c.now,
      actor: c.actor.name,
    };
    (p.pullReceipts ||= []).push(receipt);
    if (target.kind === "router")
      sync(target.id, (n) => {
        n.flowResults ||= [];
        for (const r of rows) {
          const old = n.flowResults.find((a) => a.id === r.id);
          if (old) {
            old.quantity = rowQuantity(old) + rowQuantity(r);
            old.cost =
              old.cost == null || r.cost == null ? null : old.cost + r.cost;
          } else n.flowResults.push(clone(r));
        }
      });
    allocateArrivals(p, ch.id, v, target.id, c.now);
    p.costConfirmed = false;
    log(
      "下游领取数据",
      `${source.title} → ${target.title}，${flowQuantity(rows)} ${target.inputUnit || target.flowUnit}`,
      receipt,
    );
    return receipt;
  }
  if (action === "register" || action === "externalOutput") {
    const external = action === "externalOutput";
    let externalSignature = "";
    if (external) {
      ok(
        typeof x.requestId === "string" &&
          x.requestId.trim() &&
          x.requestId.length <= 100,
        "请提供输出关联请求标识",
      );
      ok(
        typeof x.externalBatchId === "string" &&
          x.externalBatchId.trim() &&
          x.externalBatchId.length <= 200 &&
          typeof x.marker === "string" &&
          x.marker.trim() &&
          x.marker.length <= 200,
        "请填写外部批次ID及编排关联标记",
      );
      ok(
        Number.isSafeInteger(x.quantity) && x.quantity > 0,
        "输出数量须为正安全整数",
      );
      externalSignature = JSON.stringify({
        chainId: ch.id,
        nodeId: x.nodeId,
        externalBatchId: x.externalBatchId,
        marker: x.marker,
        quantity: x.quantity,
        fields: x.fields || {},
        date: x.date || null,
        cost: x.cost ?? null,
        sourceIds: x.sourceIds || null,
        receiptId: x.receiptId || null,
      });
      const previous = (p.externalOutputs || []).find(
        (r) => r.requestId === x.requestId,
      );
      if (previous) {
        ok(
          previous.signature === externalSignature,
          "请求标识已用于其他输出关联",
        );
        return {
          count: 1,
          quantity: previous.quantity,
          resultId: previous.resultId,
        };
      }
      x.rows = [
        {
          externalId: x.externalBatchId.trim(),
          externalBatchId: x.externalBatchId.trim(),
          marker: x.marker.trim(),
          quantity: x.quantity,
          fields: x.fields || {},
          date: x.date,
          cost: x.cost,
          sourceIds: x.sourceIds,
        },
      ];
    }
    const n = v.nodes.find((n) => n.id === x.nodeId);
    ok(n && n.kind === "platform", "只有平台节点能登记平台结果");
    ok(v.status === "RUNNING", "请先开始或恢复生产");
    ok(
      Array.isArray(x.rows) && x.rows.length > 0 && x.rows.length <= 500,
      "一次登记1至500条平台结果",
    );
    const receipt = x.receiptId
      ? (p.pullReceipts || []).find(
          (r) => r.id === x.receiptId && r.chainId === ch.id && r.to === n.id,
        )
      : undefined;
    ok(
      !v.edges.some((e) => e.to === n.id) || receipt,
      "下游平台结果须关联已领取的输入",
    );
    const declared = n.resultFields || [];
    const rows: FlowResult[] = x.rows.map((r: any) => {
      ok(
        typeof r.externalId === "string" &&
          r.externalId.trim() &&
          r.externalId.length <= 200,
        "平台结果标识必填且不超过200字",
      );
      ok(
        r.quantity == null ||
          (Number.isSafeInteger(r.quantity) && r.quantity > 0),
        "结果数量须为正安全整数",
      );
      ok(
        r.fields && typeof r.fields === "object" && !Array.isArray(r.fields),
        "结果字段格式无效",
      );
      for (const [key, value] of Object.entries(r.fields)) {
        const field = declared.find((f) => f.key === key);
        ok(field, "结果含未声明的平台字段");
        ok(
          field.type === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : field.type === "boolean"
              ? typeof value === "boolean"
              : typeof value === "string",
          "平台字段值类型不符",
        );
      }
      ok(
        r.cost == null || (Number.isSafeInteger(r.cost) && r.cost >= 0),
        "平台成本须为非负整数分或未知",
      );
      const date = r.date || day();
      ok(
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date &&
          date <= day(),
        "平台结果日期无效",
      );
      const sourceIds = r.sourceIds || receipt?.resultIds || [];
      ok(
        Array.isArray(sourceIds) &&
          (!receipt || sourceIds.length > 0) &&
          new Set(sourceIds).size === sourceIds.length &&
          sourceIds.every((id: string) => receipt?.resultIds.includes(id)),
        "来源须属于已领取批次",
      );
      const id = JSON.stringify([
        n.platform,
        n.platformRef,
        r.externalId.trim(),
      ]);
      return {
        id,
        externalId: r.externalId.trim(),
        ...(r.quantity != null ? { quantity: r.quantity } : {}),
        ...(external
          ? { externalBatchId: r.externalBatchId, marker: r.marker }
          : {}),
        platform: n.platform,
        platformRef: n.platformRef!,
        fields: clone(r.fields),
        unit: n.flowUnit!,
        date,
        cost: r.cost ?? null,
        sourceIds: clone(sourceIds),
        receiptId: receipt?.id,
        at: c.now,
      };
    });
    ok(
      new Set(rows.map((r) => r.id)).size === rows.length,
      "本次平台结果标识重复",
    );
    const existing =
      s.production &&
      Object.values(s.production).flatMap((p) =>
        p.chains.flatMap((ch) =>
          ch.versions.flatMap((v) =>
            v.mode === "pull"
              ? v.nodes
                  .filter((n) => n.kind === "platform")
                  .flatMap((n) => n.flowResults || [])
              : [],
          ),
        ),
      );
    ok(
      rows.every((r) => !existing.some((e) => e.id === r.id)),
      "平台结果已登记，请勿重复登记",
    );
    sync(n.id, (n) => {
      n.flowResults = [...(n.flowResults || []), ...clone(rows)];
    });
    p.costConfirmed = false;
    log("登记平台结果", `${n.title}：${flowQuantity(rows)} ${n.flowUnit}`, {
      nodeId: n.id,
      rows,
    });
    if (external) {
      (p.externalOutputs ||= []).push({
        requestId: x.requestId,
        signature: externalSignature,
        resultId: rows[0].id,
        chainId: ch.id,
        nodeId: n.id,
        quantity: x.quantity,
        at: c.now,
      });
      return { count: 1, quantity: x.quantity, resultId: rows[0].id };
    }
    return { count: rows.length };
  }
  throw Error("未知的按需取数操作");
}
