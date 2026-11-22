import { createPlan, applyPlan } from "../../shared/production-plan";
import {
  createPOC,
  transition,
  validateGraph,
  stateRows,
  type OState,
  type ONode,
  type OAction,
} from "../../shared/orchestration";
import {
  requireValue,
  record,
  type State,
  type Context,
  type Command,
} from "../../shared/types";

/** Keep orchestration demonstration facts separate from original production financial records. */
export function handleOrchestration(state: State, cmd: Command, ctx: Context) {
  if (!cmd.type.startsWith("orchestration.")) return undefined;
  const p = cmd.payload || {};
  requireValue(
    ctx.actor.role === "pm" || ctx.actor.role === "approver",
    "当前身份不能操作生产编排",
  );
  const business = state.businesses.find((b) => b.id === p.businessId);
  requireValue(business, "项目不存在");
  requireValue(
    !business.completed && business.stage !== "LOST",
    "已结束项目不能修改编排",
  );
  requireValue(
    ctx.actor.role === "approver" || business.ownerId === ctx.actor.id,
    "仅项目负责人可以操作编排",
  );
  if (cmd.type === "orchestration.plan") {
    const key = `production-plan:${business.id}`;
    const current = state.drafts[key] || createPlan();
    requireValue(
      p.canvasRevision === current.revision,
      "编排已更新，请刷新后重试",
    );
    state.drafts[key] = applyPlan(current, p.action);
    record(
      state,
      ctx,
      "批次生产编排",
      state.drafts[key].events.at(-1)?.detail || p.action.type,
    );
    return { canvas: state.drafts[key] };
  }
  const key = `orchestration:${business.id}`;
  const current: OState = state.drafts[key] || createPOC(business.id);
  requireValue(
    p.canvasRevision === current.revision,
    "编排已被更新，请刷新后重试",
  );
  if (cmd.type === "orchestration.apply") {
    requireValue(p.action && typeof p.action.type === "string", "操作无效");
    const allowed = [
      "scan",
      "configure",
      "bind",
      "release",
      "execute",
      "report",
      "deliver",
      "reroute",
      "export",
      "cancelExport",
      "return",
      "retain",
      "format",
      "discard",
      "publish",
    ];
    requireValue(
      allowed.includes(p.action.type),
      "请在画布草稿中编辑节点和连线",
    );
    state.drafts[key] = transition(current, p.action as OAction);
    record(
      state,
      ctx,
      "本地生产编排",
      state.drafts[key].audit.at(-1)?.detail || p.action.type,
    );
    return { canvas: state.drafts[key] };
  }
  if (cmd.type === "orchestration.saveGraph") {
    requireValue(
      Array.isArray(p.graph?.nodes) && Array.isArray(p.graph?.edges),
      "画布结构无效",
    );
    const next = structuredClone(current);
    const nodes = p.graph.nodes as ONode[];
    requireValue(nodes.length <= 150, "本地演示最多支持 150 个节点");
    for (const old of current.nodes) {
      const incoming = nodes.find((n) => n.id === old.id);
      if (!incoming)
        requireValue(
          !stateRows(current, old.id).length &&
            !current.runs.some((r) => r.stageId === old.id),
          "已有生产数据的节点不能删除",
        );
      else {
        requireValue(old.kind === incoming.kind, "不能改变已有节点的类型");
        if (old.batchId)
          requireValue(
            incoming.batchId === old.batchId,
            "请通过批次绑定操作修改平台对象",
          );
        if (current.runs.some((r) => r.stageId === old.id))
          requireValue(
            incoming.platform === old.platform,
            "已有生产记录的工序不能更换平台",
          );
        if (old.scanCount)
          requireValue(
            incoming.bucket === old.bucket,
            "已开始扫描的桶不能修改，请新增来源",
          );
      }
    }
    next.nodes = nodes;
    next.edges = p.graph.edges;
    next.serial = Math.max(current.serial, Number(p.graph.serial) || 0);
    next.cids = next.cids.filter((c) => nodes.some((n) => n.id === c.nodeId));
    for (const n of nodes.filter((n) =>
      ["buffer", "sourcePool", "delivery"].includes(n.kind),
    ))
      if (!next.cids.some((c) => c.nodeId === n.id)) {
        let cid = "";
        do {
          cid = `CID-${String(++next.serial).padStart(3, "0")}`;
        } while (next.cids.some((c) => c.id === cid));
        next.cids.push({
          id: cid,
          nodeId: n.id,
          label: n.label,
          version: 1,
          rows: [],
        });
      }
    const errors = validateGraph(next);
    requireValue(!errors.length, errors.join("；"));
    next.revision++;
    next.published = false;
    next.audit.push({
      id: `LOG-${++next.serial}`,
      at: ctx.now,
      action: "保存编排草稿",
      detail: `${nodes.length} 个节点，${next.edges.length} 条交接关系`,
    });
    state.drafts[key] = next;
    record(state, ctx, "保存编排草稿", business.name);
    return { canvas: next };
  }
  return undefined;
}
