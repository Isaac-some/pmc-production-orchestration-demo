/** Project-scoped, deterministic local demonstration. No remote platform is called. */
export type OKind = "source" | "sourcePool" | "stage" | "buffer" | "delivery";
export type OPlatform = "machine" | "agent" | "human" | "compress";
export type OStatus = "available" | "failed" | "consumed" | "discarded";
export type OQueue = {
  id: string;
  name: string;
  quantity: number;
  terminal?: boolean;
  templateVersion?: string;
};
export type OFilter = {
  field: string;
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
  value: string | number;
};
export type ONode = {
  id: string;
  kind: OKind;
  label: string;
  x: number;
  y: number;
  platform?: OPlatform;
  bucket?: string;
  batchId?: string;
  queues?: OQueue[];
  fields?: string[];
  filter?: OFilter;
  autoRelease?: boolean;
  paused?: boolean;
  requiresFormat?: boolean;
  formatReady?: boolean;
  requiredFields?: string[];
  scanCount?: number;
  note?: string;
  inputRowKeys?: string[];
  templateVersion?: string;
  templateJSON?: string;
  fieldMapping?: Record<string, string>;
};
export type ORow = {
  rowkey: string;
  tos_path: string;
  cid: string;
  status: OStatus;
  reason?: string;
  values: Record<string, unknown>;
  consumedBy?: string;
  revision: number;
  sourceCid?: string;
  parentCid?: string;
};
export type OCid = {
  id: string;
  nodeId: string;
  label: string;
  version: number;
  rows: ORow[];
};
export type OExport = {
  id: string;
  cidId: string;
  start: number;
  end: number;
  totalAtOpen: number;
  baseVersion: number;
  rowKeys: string[];
  snapshot: ORow[];
  status: "processing" | "returned" | "cancelled";
  createdAt: string;
  returnedCount?: number;
};
export type ORun = {
  id: string;
  stageId: string;
  batchId: string;
  inputRefs: { cidId: string; rowkey: string; tos_path: string }[];
  inputs: ORow[];
  status: "queued" | "awaiting-report" | "completed";
  outputs: ORow[];
  createdAt: string;
  reportedAt?: string;
};
export type OAudit = {
  id: string;
  at: string;
  action: string;
  detail: string;
  nodeId?: string;
};
export type OHistory = {
  cidId: string;
  version: number;
  rows: ORow[];
  exportId: string;
  at: string;
};
export type ORetention = {
  id: string;
  cidIds: string[];
  omittedCidIds: string[];
  reason: string;
  status: "queued";
  rows: Record<string, unknown>[];
  at: string;
};
export type OState = {
  schema: 1;
  projectId: string;
  revision: number;
  serial: number;
  nodes: ONode[];
  edges: { id: string; source: string; target: string; label?: string }[];
  cids: OCid[];
  exports: OExport[];
  runs: ORun[];
  audit: OAudit[];
  history: OHistory[];
  retention: ORetention[];
  published?: boolean;
};
export type OAction =
  | { type: "scan"; sourceId: string; objects?: Record<string, unknown>[] }
  | {
      type: "importCID";
      nodeId: string;
      cidId: string;
      rows: Record<string, unknown>[];
    }
  | { type: "configure"; nodeId: string; patch: Partial<ONode> }
  | {
      type: "addNode";
      kind: OKind;
      label: string;
      platform?: OPlatform;
      x?: number;
      y?: number;
    }
  | { type: "connect"; source: string; target: string }
  | { type: "disconnect"; edgeId: string }
  | { type: "move"; nodeId: string; x: number; y: number }
  | { type: "removeNode"; nodeId: string }
  | { type: "bind"; stageId: string; batchId?: string; queues?: OQueue[] }
  | {
      type: "release";
      fromId: string;
      toId: string;
      quantity: number;
      fields?: string[];
      rowKeys?: string[];
      includeFailed?: boolean;
      queueAllocations?: Record<string, number>;
    }
  | { type: "execute"; stageId: string }
  | { type: "report"; stageId: string }
  | { type: "deliver"; fromId: string; toId?: string }
  | {
      type: "reroute";
      fromId: string;
      mode: "compress" | "human" | "parallel";
      rowKeys?: string[];
      label?: string;
    }
  | { type: "export"; cidId: string; start: number; end: number }
  | { type: "cancelExport"; exportId: string }
  | { type: "return"; exportId: string; rows: Record<string, unknown>[] }
  | { type: "retain"; cidIds: string[]; reason?: string }
  | {
      type: "format";
      fromId: string;
      toId: string;
      template: string;
      version: string;
      mapping: Record<string, string>;
    }
  | { type: "discard"; nodeId: string; rowKeys: string[]; reason: string }
  | { type: "publish" };

const clone = <T>(value: T): T => structuredClone(value);
function need(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
const key = (r: { rowkey: string; tos_path: string }) =>
  `${r.rowkey}\u0000${r.tos_path}`;
const productKey = (r: ORow) =>
  `${key(r)}\u0000${String(r.values.product_id || r.values.product_kind || "default")}`;
const clock = () => new Date().toISOString();
const id = (s: OState, prefix: string) =>
  `${prefix}-${String(++s.serial).padStart(3, "0")}`;
const log = (s: OState, action: string, detail: string, nodeId?: string) =>
  s.audit.push({ id: id(s, "LOG"), at: clock(), action, detail, nodeId });
export const nodeCids = (s: OState, nodeId: string): OCid[] =>
  s.cids.filter((c) => c.nodeId === nodeId);
export const stateRows = (s: OState, nodeId: string): ORow[] =>
  nodeCids(s, nodeId).flatMap((c) => c.rows);
export const isLocked = (s: OState, r: ORow): boolean =>
  s.exports.some(
    (e) =>
      e.cidId === r.cid &&
      e.status === "processing" &&
      e.rowKeys.includes(key(r)),
  );
export const availableRows = (s: OState, nodeId: string): ORow[] =>
  stateRows(s, nodeId).filter(
    (r) => r.status === "available" && !isLocked(s, r),
  );
export const rowValues = (r: ORow): Record<string, unknown> => ({
  ...r.values,
  rowkey: r.rowkey,
  tos_path: r.tos_path,
  cid: r.cid,
  source_cid: r.sourceCid || r.cid,
});
function node(s: OState, nodeId: string) {
  const n = s.nodes.find((n) => n.id === nodeId);
  need(n, "节点不存在");
  return n;
}
function edge(s: OState, source: string, target: string) {
  return s.edges.find((e) => e.source === source && e.target === target);
}
function allowed(a: ONode, b: ONode) {
  if (a.kind === "source") return b.kind === "sourcePool";
  if (a.kind === "stage") return b.kind === "buffer";
  if (a.kind === "sourcePool" || a.kind === "buffer")
    return b.kind === "stage" || b.kind === "delivery";
  return false;
}
export function validateGraph(s: OState): string[] {
  const errors: string[] = [],
    ids = new Set<string>();
  for (const n of s.nodes) {
    if (ids.has(n.id)) errors.push("节点标识重复");
    ids.add(n.id);
    if (!n.label.trim()) errors.push("节点名称不能为空");
    if (n.kind === "stage" && !n.platform)
      errors.push(`${n.label}：请选择生产平台`);
  }
  const pairs = new Set<string>();
  for (const e of s.edges) {
    const a = s.nodes.find((n) => n.id === e.source),
      b = s.nodes.find((n) => n.id === e.target);
    if (!a || !b) {
      errors.push("连线引用了不存在的节点");
      continue;
    }
    if (!allowed(a, b))
      errors.push(`${a.label} → ${b.label}：节点类型不能直接交接`);
    const p = `${a.id}:${b.id}`;
    if (pairs.has(p)) errors.push("重复连线");
    pairs.add(p);
  }
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(n: string) {
    if (visiting.has(n)) {
      errors.push("生产链路不能形成循环；请创建新的工序承接异常数据");
      return;
    }
    if (done.has(n)) return;
    visiting.add(n);
    for (const e of s.edges.filter((e) => e.source === n)) visit(e.target);
    visiting.delete(n);
    done.add(n);
  }
  for (const n of s.nodes) visit(n.id);
  return [...new Set(errors)];
}
function connect(s: OState, source: string, target: string, label?: string) {
  const a = node(s, source),
    b = node(s, target);
  need(
    source !== target && allowed(a, b),
    "此类节点不能直接相连，请经由对应缓冲池交接",
  );
  need(!edge(s, source, target), "这条交接关系已经存在");
  s.edges.push({ id: id(s, "E"), source, target, label });
  const errors = validateGraph(s);
  need(!errors.length, errors.join("；"));
}
function ensureCid(s: OState, nodeId: string, preferred?: string) {
  const found = nodeCids(s, nodeId)[0];
  if (found) return found;
  const cid: OCid = {
    id: preferred || id(s, "CID"),
    nodeId,
    label: node(s, nodeId).label,
    version: 1,
    rows: [],
  };
  s.cids.push(cid);
  return cid;
}
function append(s: OState, cid: OCid, rows: ORow[]) {
  const identity = node(s, cid.nodeId).kind === "delivery" ? productKey : key;
  const existing = new Set(cid.rows.map(identity));
  let count = 0;
  for (const r of rows)
    if (!existing.has(identity(r))) {
      cid.rows.push({
        ...clone(r),
        cid: cid.id,
        parentCid: r.cid,
        sourceCid: r.sourceCid || r.cid,
        revision: 1,
        status: r.status === "failed" ? "failed" : "available",
        consumedBy: undefined,
      });
      existing.add(identity(r));
      count++;
    }
  if (count) cid.version++;
  return count;
}
function addStage(
  s: OState,
  label: string,
  platform: OPlatform,
  x: number,
  y: number,
) {
  const n: ONode = {
    id: id(s, "stage"),
    kind: "stage",
    label,
    platform,
    x,
    y,
    requiredFields:
      platform === "human"
        ? ["rowkey", "tos_path", "caption"]
        : ["rowkey", "tos_path"],
  };
  const b: ONode = {
    id: id(s, "buffer"),
    kind: "buffer",
    label: `${label}缓冲池`,
    x: x + 310,
    y,
    fields: ["rowkey", "tos_path", "caption", "sizeMB", "duration"],
  };
  s.nodes.push(n, b);
  connect(s, n.id, b.id);
  ensureCid(s, b.id);
  return { stage: n, buffer: b };
}
function passFilter(r: ORow, filter?: OFilter) {
  if (!filter) return true;
  const val = rowValues(r)[filter.field];
  switch (filter.op) {
    case "eq":
      return String(val) === String(filter.value);
    case "ne":
      return String(val) !== String(filter.value);
    case "gt":
      return Number(val) > Number(filter.value);
    case "gte":
      return Number(val) >= Number(filter.value);
    case "lt":
      return Number(val) < Number(filter.value);
    case "lte":
      return Number(val) <= Number(filter.value);
    case "contains":
      return String(val ?? "").includes(String(filter.value));
  }
}
function freshOutput(s: OState, stage: ONode, r: ORow): ORow {
  const out = clone(r);
  out.status = "available";
  delete out.consumedBy;
  delete out.reason;
  if (stage.platform === "machine" && Number(r.values.sizeMB) > 500) {
    out.status = "failed";
    out.reason = "视频过大，需要压缩";
  } else if (
    stage.platform === "agent" &&
    r.values.agentConfigIssue &&
    !stage.formatReady
  ) {
    out.status = "failed";
    out.reason = "Agent 配置与数据不匹配";
  } else if (stage.platform === "compress") {
    out.values.sizeMB = Math.round(Number(r.values.sizeMB || 120) * 0.3);
    out.values.processed_tos_path = `${r.tos_path}.compressed.mp4`;
    out.values.compressed = true;
  } else if (stage.platform === "human") {
    out.values.caption = String(r.values.caption || `人工确认：${r.rowkey}`);
    out.values.quality = "合格";
    out.values.annotatedBy = "人工标注";
  } else {
    out.values.caption = String(r.values.caption || `运动感知片段 ${r.rowkey}`);
    out.values.annotatedBy =
      stage.platform === "agent" ? "Agent 标注" : "机器标注";
  }
  out.values.projectId = s.projectId;
  return out;
}
function report(s: OState, stageId: string) {
  const stage = node(s, stageId),
    outputEdges = s.edges.filter((e) => e.source === stageId);
  need(
    outputEdges.length === 1 &&
      node(s, outputEdges[0].target).kind === "buffer",
    "工序需要唯一的输出缓冲池",
  );
  const runs = s.runs.filter(
    (r) => r.stageId === stageId && r.status === "awaiting-report",
  );
  need(runs.length, "没有待上报的终端队列结果");
  const cid = ensureCid(s, outputEdges[0].target);
  let total = 0,
    failed = 0;
  for (const run of runs) {
    total += append(s, cid, run.outputs);
    failed += run.outputs.filter((r) => r.status === "failed").length;
    run.status = "completed";
    run.reportedAt = clock();
  }
  log(
    s,
    stage.platform === "human" ? "人工上报终端结果" : "平台结果进入缓冲池",
    `${stage.label} → ${cid.id}，${total} 条（失败 ${failed} 条）`,
    stageId,
  );
}

export function createPOC(projectId = "motion-poc"): OState {
  const s: OState = {
    schema: 1,
    projectId,
    revision: 0,
    serial: 0,
    nodes: [
      {
        id: "source-tos",
        kind: "source",
        label: "运动感知素材",
        x: 0,
        y: 180,
        bucket: "tos://motion-perception/videos/",
        scanCount: 0,
      },
      {
        id: "pool-source",
        kind: "sourcePool",
        label: "来源池",
        x: 300,
        y: 180,
        fields: ["rowkey", "tos_path", "caption", "sizeMB", "duration"],
      },
      {
        id: "stage-machine",
        kind: "stage",
        platform: "machine",
        label: "动作预标注",
        x: 600,
        y: 180,
        requiredFields: ["rowkey", "tos_path"],
      },
      {
        id: "buffer-machine",
        kind: "buffer",
        label: "预标注缓冲池",
        x: 900,
        y: 180,
        fields: ["rowkey", "tos_path", "caption", "sizeMB", "duration"],
      },
      {
        id: "stage-agent",
        kind: "stage",
        platform: "agent",
        label: "Agent 动作补标",
        x: 1200,
        y: 180,
        requiredFields: ["rowkey", "tos_path", "caption"],
      },
      {
        id: "buffer-agent",
        kind: "buffer",
        label: "动作结果缓冲池",
        x: 1500,
        y: 180,
        fields: ["rowkey", "tos_path", "caption", "sizeMB", "duration"],
      },
      {
        id: "stage-human",
        kind: "stage",
        platform: "human",
        label: "人工验收",
        x: 1800,
        y: 180,
        requiredFields: ["rowkey", "tos_path", "caption"],
        requiresFormat: true,
        formatReady: false,
      },
      {
        id: "buffer-human",
        kind: "buffer",
        label: "验收结果缓冲池",
        x: 2100,
        y: 180,
        fields: ["rowkey", "tos_path", "caption", "quality"],
      },
      {
        id: "pool-delivery",
        kind: "delivery",
        label: "交付池",
        x: 2400,
        y: 180,
      },
    ],
    edges: [],
    cids: [],
    exports: [],
    runs: [],
    audit: [],
    history: [],
    retention: [],
  };
  for (let i = 0; i < s.nodes.length - 1; i++)
    s.edges.push({
      id: `poc-edge-${i}`,
      source: s.nodes[i].id,
      target: s.nodes[i + 1].id,
    });
  for (const [nid, cid] of [
    ["pool-source", "S01"],
    ["buffer-machine", "C01"],
    ["buffer-agent", "C02"],
    ["buffer-human", "C03"],
  ])
    ensureCid(s, nid, cid);
  log(
    s,
    "建立运动感知 POC",
    "演示数据来自本地模拟。先扫描 TOS，再为工序绑定生产批次并分批放行。",
  );
  return s;
}

export function transition(input: OState, action: OAction): OState {
  const s = clone(input);
  s.revision++;
  switch (action.type) {
    case "configure": {
      const n = node(s, action.nodeId),
        p = clone(action.patch);
      need(!p.kind || p.kind === n.kind, "不能更改节点类型");
      need(!p.id || p.id === n.id, "不能更改节点标识");
      if (p.label !== undefined) need(p.label.trim(), "节点名称不能为空");
      if (p.platform && p.platform !== n.platform)
        need(
          !s.runs.some((r) => r.stageId === n.id),
          "已有运行记录的工序不能切换平台，请新增工序",
        );
      if (p.bucket !== undefined) {
        need(
          /^tos:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(p.bucket),
          "请填写 tos://桶名/目录 格式的地址",
        );
        need(
          !n.scanCount || p.bucket === n.bucket,
          "已开始扫描的数据源不能修改桶地址，请新增数据源",
        );
      }
      Object.assign(n, p);
      log(s, "保存节点配置", n.label, n.id);
      break;
    }
    case "addNode": {
      need(action.label.trim(), "请输入节点名称");
      if (action.kind === "stage") {
        need(action.platform, "请选择生产平台");
        addStage(
          s,
          action.label,
          action.platform,
          action.x ?? 600,
          action.y ?? 500,
        );
      } else {
        const n: ONode = {
          id: id(s, action.kind),
          kind: action.kind,
          label: action.label,
          x: action.x ?? 0,
          y: action.y ?? 500,
        };
        s.nodes.push(n);
        if (n.kind !== "source") ensureCid(s, n.id);
      }
      log(s, "新增节点", action.label);
      break;
    }
    case "connect":
      connect(s, action.source, action.target);
      log(
        s,
        "建立交接",
        `${node(s, action.source).label} → ${node(s, action.target).label}`,
      );
      break;
    case "disconnect": {
      const e = s.edges.find((e) => e.id === action.edgeId);
      need(e, "连线不存在");
      need(
        !s.runs.some((r) => r.stageId === e.target && r.status !== "completed"),
        "下游有在制批次，暂不能移除交接关系",
      );
      s.edges = s.edges.filter((e) => e.id !== action.edgeId);
      log(s, "移除交接", `${e.source} → ${e.target}`);
      break;
    }
    case "move": {
      const n = node(s, action.nodeId);
      n.x = action.x;
      n.y = action.y;
      break;
    }
    case "removeNode": {
      const n = node(s, action.nodeId);
      need(
        !stateRows(s, n.id).length && !s.runs.some((r) => r.stageId === n.id),
        "节点已有生产数据，不能删除，请暂停或创建新线路",
      );
      const remove = new Set([n.id]);
      if (n.kind === "stage") {
        for (const e of s.edges.filter((e) => e.source === n.id)) {
          need(!stateRows(s, e.target).length, "输出缓冲池已有数据，不能删除");
          remove.add(e.target);
        }
      }
      s.nodes = s.nodes.filter((n) => !remove.has(n.id));
      s.edges = s.edges.filter(
        (e) => !remove.has(e.source) && !remove.has(e.target),
      );
      s.cids = s.cids.filter((c) => !remove.has(c.nodeId));
      log(s, "删除空节点", n.label);
      break;
    }
    case "importCID": {
      const n = node(s, action.nodeId);
      need(n.kind === "sourcePool", "已有 CID 只能接入来源池");
      need(
        action.cidId.trim() && !s.cids.some((c) => c.id === action.cidId),
        "CID 标识为空或已接入本项目",
      );
      need(action.rows.length, "导入 CID 不能为空");
      const rows: ORow[] = [],
        seen = new Set<string>();
      for (const raw of action.rows) {
        need(
          typeof raw.rowkey === "string" &&
            raw.rowkey.trim() &&
            typeof raw.tos_path === "string" &&
            /^tos:\/\//.test(raw.tos_path),
          "已有 CID 的每行必须带原始 rowkey 与 tos_path",
        );
        const k = key(raw as { rowkey: string; tos_path: string });
        need(!seen.has(k), "导入 CID 存在重复血缘");
        seen.add(k);
        const values: Record<string, unknown> = { ...raw };
        for (const f of ["rowkey", "tos_path", "cid", "source_cid"])
          delete values[f];
        rows.push({
          rowkey: raw.rowkey,
          tos_path: raw.tos_path,
          cid: action.cidId.trim(),
          sourceCid: action.cidId.trim(),
          values,
          status: "available",
          revision: 1,
        });
      }
      s.cids.push({
        id: action.cidId.trim(),
        nodeId: n.id,
        label: action.cidId.trim(),
        version: 1,
        rows,
      });
      log(
        s,
        "接入已有 CID",
        `${action.cidId}：${rows.length} 条；来源字段及血缘完整保留，下游按需选择宽表字段`,
        n.id,
      );
      break;
    }
    case "scan": {
      const source = node(s, action.sourceId);
      need(source.kind === "source" && !source.paused, "数据源未启用");
      need(
        source.bucket && /^tos:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(source.bucket),
        "请先填写有效 TOS 桶地址",
      );
      const output = s.edges.filter((e) => e.source === source.id);
      need(
        output.length === 1 && node(s, output[0].target).kind === "sourcePool",
        "请先将数据源连接到来源池",
      );
      const count = source.scanCount || 0,
        start = count * 12;
      const objects =
        action.objects ||
        Array.from({ length: 12 }, (_, i) => ({
          tos_path: `${source.bucket!.replace(/\/?$/, "/")}${String(start + i + 1).padStart(4, "0")}.mp4`,
          caption: ["跑步", "跳跃", "抬手", "转身"][i % 4],
          sizeMB: i === 2 || i === 7 ? 860 : 120 + i * 12,
          duration: 15 + i * 3,
          agentConfigIssue: i === 1 || i === 4,
          projectId: s.projectId,
        }));
      const cid = ensureCid(s, output[0].target),
        known = new Set(
          s.cids
            .filter((c) => node(s, c.nodeId).kind === "sourcePool")
            .flatMap((c) => c.rows.map((r) => r.tos_path)),
        );
      let added = 0;
      for (const object of objects) {
        const path = String(object.tos_path || "");
        need(
          path.startsWith(source.bucket!),
          "扫描数据必须属于当前 TOS 桶/目录",
        );
        if (known.has(path)) continue;
        const values: Record<string, unknown> = { ...object };
        delete values.tos_path;
        delete values.rowkey;
        const row: ORow = {
          rowkey: id(s, "RK"),
          tos_path: path,
          cid: cid.id,
          sourceCid: cid.id,
          values,
          status: "available",
          revision: 1,
        };
        cid.rows.push(row);
        known.add(path);
        added++;
      }
      source.scanCount = count + 1;
      if (added) cid.version++;
      log(
        s,
        "持续发现并登记资源",
        `${source.bucket}：新增 ${added} 条，已生成唯一 rowkey，追加 ${cid.id}；重复地址跳过`,
        source.id,
      );
      break;
    }
    case "bind": {
      const n = node(s, action.stageId);
      need(n.kind === "stage", "只能绑定生产工序");
      need(
        !s.runs.some((r) => r.stageId === n.id && r.status !== "completed"),
        "当前批次尚有在制数据，完成后才能重新绑定",
      );
      const desired = action.batchId?.trim();
      need(
        !desired ||
          !s.nodes.some(
            (other) => other.id !== n.id && other.batchId === desired,
          ),
        "同一个平台生产对象不能登记到多个工序",
      );
      n.batchId = desired || id(s, n.platform === "human" ? "QUEUE" : "BATCH");
      n.queues = clone(
        action.queues ||
          (n.platform === "human"
            ? [
                {
                  id: id(s, "Q"),
                  name: "人工验收终端队列",
                  quantity: 0,
                  terminal: true,
                },
              ]
            : []),
      );
      if (n.platform === "human") {
        need(
          n.queues.length && n.queues.some((q) => q.terminal),
          "请指定至少一个终端队列",
        );
        need(
          n.queues.every(
            (q) => Number.isInteger(q.quantity) && q.quantity >= 0,
          ),
          "队列分配量须为非负整数",
        );
        need(
          new Set(n.queues.map((q) => q.id)).size === n.queues.length,
          "队列标识不能重复",
        );
        const versions = new Set(
          n.queues.map((q) => q.templateVersion || "v1"),
        );
        need(versions.size === 1, "入口队列模板版本不一致，请统一模板后再绑定");
        n.templateVersion = [...versions][0];
      }
      log(
        s,
        "创建并绑定生产批次",
        `${n.label} → ${n.batchId}${n.platform === "human" ? "（结果由 PM 手动上报）" : ""}`,
        n.id,
      );
      break;
    }
    case "release": {
      const from = node(s, action.fromId),
        to = node(s, action.toId);
      need(
        ["sourcePool", "buffer"].includes(from.kind) &&
          to.kind === "stage" &&
          edge(s, from.id, to.id),
        "请先连接缓冲池/来源池与目标工序",
      );
      need(!from.paused && !to.paused, "当前交接已暂停");
      need(to.batchId, "请先创建或绑定下游生产批次");
      need(
        !to.requiresFormat || to.formatReady,
        "请由项目经理先开启人工标注前的格式转换",
      );
      need(
        Number.isInteger(action.quantity) && action.quantity > 0,
        "放行数量须为正整数",
      );
      const fields = action.fields ||
        from.fields || ["rowkey", "tos_path", "caption"];
      need(
        fields.includes("rowkey") && fields.includes("tos_path"),
        "下游字段必须保留原始 rowkey 与 tos_path",
      );
      need(
        (to.requiredFields || []).every((f) => fields.includes(f)),
        `下游必需字段：${(to.requiredFields || []).join("、")}`,
      );
      const candidates = stateRows(s, from.id).filter(
        (r) =>
          (r.status === "available" ||
            ((action.includeFailed || to.inputRowKeys?.length) &&
              r.status === "failed")) &&
          !isLocked(s, r) &&
          (!action.rowKeys || action.rowKeys.includes(r.rowkey)) &&
          (!to.inputRowKeys || to.inputRowKeys.includes(r.rowkey)) &&
          passFilter(r, from.filter),
      );
      const unique = new Set<string>(),
        rows = candidates.filter((r) => {
          if (unique.has(key(r))) return false;
          unique.add(key(r));
          return true;
        });
      need(
        rows.length >= action.quantity,
        `可放行 ${rows.length} 条；处理中、已领取、失败或不满足条件的数据不计入`,
      );
      const picked = rows.slice(0, action.quantity);
      const previously = new Set(
        s.runs
          .filter((r) => r.stageId === to.id)
          .flatMap((r) => r.inputRefs.map(key)),
      );
      need(
        picked.every((r) => !previously.has(key(r))),
        "同一工序不能重复领取同一条数据",
      );
      if (
        action.queueAllocations &&
        to.platform === "human" &&
        to.queues &&
        Object.keys(action.queueAllocations).length
      ) {
        for (const q of to.queues) {
          const amount = action.queueAllocations[q.id] || 0;
          need(
            Number.isInteger(amount) && amount >= 0,
            "队列分配量须为非负整数",
          );
          q.quantity = amount;
        }
        need(
          to.queues.reduce((a, q) => a + q.quantity, 0) === action.quantity,
          "各人工队列的分配数量之和须等于本次放行数量",
        );
      }
      if (to.platform === "human" && to.queues?.some((q) => q.quantity > 0))
        need(
          to.queues.reduce((n, q) => n + q.quantity, 0) === action.quantity,
          "各人工队列的分配数量之和须等于本次放行数量",
        );
      const pickedKeys = new Set(picked.map(key));
      for (const r of stateRows(s, from.id))
        if (pickedKeys.has(key(r))) {
          r.status = "consumed";
          r.consumedBy = to.id;
          r.revision++;
        }
      const run: ORun = {
        id: id(s, "RUN"),
        stageId: to.id,
        batchId: to.batchId!,
        inputRefs: picked.map((r) => ({
          cidId: r.cid,
          rowkey: r.rowkey,
          tos_path: r.tos_path,
        })),
        inputs: picked.map((r) => ({
          ...clone(r),
          status: "available",
          consumedBy: undefined,
        })),
        status: "queued",
        outputs: [],
        createdAt: clock(),
      };
      if (to.platform === "human" && to.fieldMapping) {
        for (const row of run.inputs) {
          const payload: Record<string, unknown> = {};
          for (const [dest, src] of Object.entries(to.fieldMapping)) {
            const val = rowValues(row)[src];
            need(
              val !== undefined && val !== null && val !== "",
              `字段 ${src} 缺失，无法生成模板 ${dest}`,
            );
            payload[dest] = val;
          }
          row.values.payload = payload;
        }
      }
      // The entire source record remains available for lineage/audit; projection is a downstream contract, not destructive source editing.
      for (const r of run.inputs) r.values._selectedFields = fields;
      s.runs.push(run);
      log(
        s,
        "向下游放行",
        `${from.label} → ${to.label}，${picked.length} 条，批次 ${to.batchId}`,
        from.id,
      );
      break;
    }
    case "execute": {
      const stage = node(s, action.stageId);
      need(stage.kind === "stage" && stage.batchId, "请先绑定生产批次");
      need(!stage.paused, "工序已暂停");
      const runs = s.runs.filter(
        (r) => r.stageId === stage.id && r.status === "queued",
      );
      need(runs.length, "没有已放行且待处理的数据");
      for (const run of runs) {
        run.outputs = run.inputs.map((r) => freshOutput(s, stage, r));
        run.status = "awaiting-report";
      }
      log(
        s,
        "平台生产完成",
        `${stage.label}：${runs.reduce((n, r) => n + r.outputs.length, 0)} 条${stage.platform === "human" ? "，等待 PM 上报终端结果" : ""}`,
        stage.id,
      );
      if (stage.platform !== "human") report(s, stage.id);
      break;
    }
    case "report": {
      const n = node(s, action.stageId);
      need(n.platform === "human", "仅人工终端队列需要手动上报");
      report(s, n.id);
      break;
    }
    case "deliver": {
      const from = node(s, action.fromId),
        target = action.toId
          ? node(s, action.toId)
          : s.nodes.find(
              (n) => n.kind === "delivery" && edge(s, from.id, n.id),
            );
      need(
        target && target.kind === "delivery" && edge(s, from.id, target.id),
        "请将结果缓冲池连接到交付池",
      );
      const rows = availableRows(s, from.id).filter((r) =>
        passFilter(r, from.filter),
      );
      need(rows.length, "没有满足交付规则且未领取的结果");
      const existing = new Set(
        s.cids
          .filter((c) => node(s, c.nodeId).kind === "delivery")
          .flatMap((c) => c.rows.map(productKey)),
      );
      const unique: ORow[] = [];
      let duplicate = 0;
      for (const row of rows) {
        if (existing.has(productKey(row))) duplicate++;
        else {
          unique.push(clone(row));
          existing.add(productKey(row));
        }
        row.status = "consumed";
        row.consumedBy = target.id;
        row.revision++;
      }
      if (unique.length) {
        const num =
          s.cids.filter(
            (c) =>
              node(s, c.nodeId).kind === "delivery" && c.id.startsWith("D"),
          ).length + 1;
        const cid: OCid = {
          id: `D${String(num).padStart(2, "0")}`,
          nodeId: target.id,
          label: `交付批次 ${num}`,
          version: 1,
          rows: [],
        };
        s.cids.push(cid);
        append(s, cid, unique);
      }
      log(
        s,
        "汇入交付池",
        `${unique.length} 条新交付结果；按原始血缘与产物标识跳过 ${duplicate} 条项目内重复`,
        target.id,
      );
      break;
    }
    case "reroute": {
      const from = node(s, action.fromId);
      need(
        ["buffer", "sourcePool"].includes(from.kind),
        "请选择缓冲池或来源池",
      );
      const failed = stateRows(s, from.id).filter(
        (r) =>
          r.status === "failed" &&
          !isLocked(s, r) &&
          (!action.rowKeys || action.rowKeys.includes(r.rowkey)),
      );
      const y = Math.max(...s.nodes.map((n) => n.y), 180) + 300;
      if (action.mode === "parallel") {
        need(
          availableRows(s, from.id).length,
          "没有尚未领取的数据，无法增加并行产线",
        );
        const next = addStage(
          s,
          action.label || "补充产线 · 机器预标注",
          "machine",
          from.x + 300,
          y,
        );
        connect(s, from.id, next.stage.id, "新增产线");
        const agent = s.nodes.find((n) => n.id === "stage-agent");
        if (agent) connect(s, next.buffer.id, agent.id);
        log(
          s,
          "增加生产线",
          `${from.label} → ${next.stage.label}，按未领取范围分批处理，不重复取数`,
          next.stage.id,
        );
      } else {
        need(failed.length, "没有可转交的失败数据");
        need(
          failed.every((r) =>
            action.mode === "compress"
              ? r.reason?.includes("视频过大")
              : r.reason?.includes("Agent"),
          ),
          "所选失败原因与新线路不匹配，请按失败原因选择数据",
        );
        const first = addStage(
          s,
          action.label ||
            (action.mode === "compress" ? "大视频压缩" : "异常转人工标注"),
          action.mode === "compress" ? "compress" : "human",
          from.x + 300,
          y,
        );
        connect(
          s,
          from.id,
          first.stage.id,
          action.mode === "compress"
            ? "仅视频过大失败数据"
            : "仅 Agent 配置失败数据",
        );
        // Failure membership stays in buffer; next release explicitly selects these rowkeys, and never retries the old stage.
        first.stage.inputRowKeys = failed.map((r) => r.rowkey);
        first.stage.note = `承接失败范围：${failed.map((r) => r.rowkey).join(", ")}`;
        if (action.mode === "compress") {
          const next = addStage(
            s,
            "压缩后重新预标注",
            "machine",
            first.buffer.x + 300,
            y,
          );
          connect(s, first.buffer.id, next.stage.id);
          const agent = s.nodes.find((n) => n.id === "stage-agent");
          if (agent) connect(s, next.buffer.id, agent.id);
        } else {
          const delivery = s.nodes.find((n) => n.kind === "delivery");
          if (delivery) connect(s, first.buffer.id, delivery.id);
        }
        log(
          s,
          "为失败数据建立新线路",
          `${failed.length} 条失败数据 → ${first.stage.label}；保留原始血缘，不回到原工序`,
          first.stage.id,
        );
      }
      break;
    }
    case "export": {
      const cid = s.cids.find((c) => c.id === action.cidId);
      need(cid, "CID 不存在");
      need(
        Number.isInteger(action.start) &&
          Number.isInteger(action.end) &&
          action.start >= 1 &&
          action.end >= action.start &&
          action.end <= cid.rows.length,
        `区间须在 1–${cid.rows.length} 之内`,
      );
      const snapshot = clone(cid.rows.slice(action.start - 1, action.end));
      need(
        snapshot.every((r) => r.status !== "consumed"),
        "本次范围已有数据被下游领取，不能进入离线覆盖流程",
      );
      need(
        snapshot.every((r) => !isLocked(s, r)),
        "所选范围与进行中的离线批次重叠，请继续原批次或取消后重选",
      );
      const exp: OExport = {
        id: id(s, "EXPORT"),
        cidId: cid.id,
        start: action.start,
        end: action.end,
        totalAtOpen: cid.rows.length,
        baseVersion: cid.version,
        rowKeys: snapshot.map(key),
        snapshot,
        status: "processing",
        createdAt: clock(),
      };
      s.exports.push(exp);
      log(
        s,
        "冻结离线处理范围",
        `${exp.id}：${cid.id} 第 ${action.start}–${action.end} 条，共 ${snapshot.length} 条；期间新入数据不受影响`,
        cid.nodeId,
      );
      break;
    }
    case "cancelExport": {
      const exp = s.exports.find((e) => e.id === action.exportId);
      need(exp?.status === "processing", "该离线批次已结束");
      exp.status = "cancelled";
      log(
        s,
        "取消离线处理",
        `${exp.id} 已释放本次范围；下载文件仍可保留但不能再回传覆盖`,
      );
      break;
    }
    case "return": {
      const exp = s.exports.find((e) => e.id === action.exportId);
      need(exp?.status === "processing", "该离线批次已结束或不存在");
      const cid = s.cids.find((c) => c.id === exp.cidId);
      need(cid, "原 CID 已不存在");
      const originals = new Map(exp.snapshot.map((r) => [key(r), r])),
        seen = new Set<string>();
      for (const before of exp.snapshot) {
        const current = cid.rows.find((r) => key(r) === key(before));
        need(
          current &&
            current.revision === before.revision &&
            current.status !== "consumed",
          "导出后原范围已变更或被下游领取，禁止覆盖，请核对历史版本",
        );
      }
      const returned: ORow[] = [];
      for (const raw of action.rows) {
        need(
          typeof raw.rowkey === "string" &&
            raw.rowkey.trim() &&
            typeof raw.tos_path === "string" &&
            raw.tos_path.trim(),
          "每行必须保留原始 rowkey 与 tos_path",
        );
        const k = key(raw as { rowkey: string; tos_path: string });
        need(!seen.has(k), "回传包含重复的 rowkey + tos_path，不能覆盖");
        seen.add(k);
        const before = originals.get(k);
        need(before, "回传行不属于本次原始导出范围，或原始 tos_path 已被改写");
        need(!raw.cid || raw.cid === cid.id, "回传 CID 与本次原 CID 不一致");
        const values: Record<string, unknown> = {
          ...before.values,
          ...(typeof raw.values === "object" && raw.values ? raw.values : {}),
          ...raw,
        };
        for (const f of [
          "rowkey",
          "tos_path",
          "cid",
          "source_cid",
          "status",
          "reason",
          "revision",
          "consumedBy",
          "values",
        ])
          delete values[f];
        const next = {
          ...clone(before),
          values,
          revision: before.revision + 1,
          status: "available" as const,
        };
        delete next.reason;
        delete next.consumedBy;
        returned.push(next);
      }
      s.history.push({
        cidId: cid.id,
        version: cid.version,
        rows: clone(cid.rows),
        exportId: exp.id,
        at: clock(),
      });
      const replace = new Map(returned.map((r) => [key(r), r]));
      // Preserve insertion order of survivors and every concurrently appended/unselected row.
      cid.rows = cid.rows.flatMap((r) =>
        originals.has(key(r))
          ? replace.has(key(r))
            ? [replace.get(key(r))!]
            : []
          : [r],
      );
      cid.version++;
      exp.status = "returned";
      exp.returnedCount = returned.length;
      log(
        s,
        "离线结果覆盖原 CID 范围",
        `${exp.id}：${cid.id} 本次 ${exp.snapshot.length} → ${returned.length} 条；原版本已留存，其他范围不变`,
        cid.nodeId,
      );
      break;
    }
    case "retain": {
      const deliveryCids = s.cids.filter(
        (c) => node(s, c.nodeId).kind === "delivery" && c.rows.length,
      );
      need(deliveryCids.length, "交付池暂无可留存 CID");
      need(
        new Set(action.cidIds).size === action.cidIds.length &&
          action.cidIds.every((cid) => deliveryCids.some((c) => c.id === cid)),
        "只能从交付池选择 CID",
      );
      const omitted = deliveryCids.filter((c) => !action.cidIds.includes(c.id));
      need(
        !omitted.length || action.reason?.trim(),
        "存在不留存的 CID，请填写一份共享原因",
      );
      need(!s.retention.length, "本次交付池已发起留存选择，请查看任务记录");
      const rows = deliveryCids
        .filter((c) => action.cidIds.includes(c.id))
        .flatMap((c) =>
          c.rows.map((r) => ({
            rowkey: r.rowkey,
            tos_path: r.tos_path,
            caption: r.values.caption || "",
            processed_tos_path: r.values.processed_tos_path || "",
            source_cid: c.id,
          })),
        );
      s.retention.push({
        id: id(s, "RETENTION"),
        cidIds: [...action.cidIds],
        omittedCidIds: omitted.map((c) => c.id),
        reason: omitted.length ? action.reason!.trim() : "",
        status: "queued",
        rows,
        at: clock(),
      });
      log(
        s,
        "提交结项留存选择",
        `留存 ${action.cidIds.join("、") || "无"}；不留存 ${omitted.map((c) => c.id).join("、") || "无"}；透传移除项目扩展字段，任务独立跟踪，不阻断结项`,
      );
      break;
    }
    case "format": {
      const from = node(s, action.fromId),
        to = node(s, action.toId);
      need(
        edge(s, from.id, to.id) && to.platform === "human",
        "请选择相连的人工标注工序",
      );
      need(to.batchId, "请先绑定人工标注队列");
      need(action.version.trim(), "请填写模板版本");
      let template: unknown;
      try {
        template = JSON.parse(action.template);
      } catch {
        throw Error("模板样例必须为有效 JSON");
      }
      need(
        template && typeof template === "object" && !Array.isArray(template),
        "模板必须为 JSON 对象",
      );
      const keys = Object.keys(template as object);
      need(
        keys.length && keys.every((k) => action.mapping[k]),
        "请为每个模板字段选择来源列",
      );
      const rows = availableRows(s, from.id);
      need(rows.length, "没有待转换的数据");
      for (const row of rows)
        for (const f of Object.values(action.mapping))
          need(
            rowValues(row)[f] !== undefined &&
              rowValues(row)[f] !== null &&
              rowValues(row)[f] !== "",
            `原始记录 ${row.rowkey} 缺少 ${f}，模板转换失败`,
          );
      need(
        !to.queues?.some(
          (q) => q.templateVersion && q.templateVersion !== action.version,
        ),
        "模板版本与队列版本不一致",
      );
      to.templateVersion = action.version;
      to.templateJSON = action.template;
      to.fieldMapping = clone(action.mapping);
      to.requiresFormat = true;
      to.formatReady = true;
      log(
        s,
        "PM 开启人工模板转换",
        `${from.label} → ${to.label}，模板 ${action.version}，校验 ${rows.length} 条成功；未放行，等待 PM 确认`,
        from.id,
      );
      break;
    }
    case "discard": {
      const n = node(s, action.nodeId);
      need(["sourcePool", "buffer"].includes(n.kind), "仅池内待处理数据可丢弃");
      need(action.reason.trim(), "请填写丢弃原因");
      need(action.rowKeys.length, "请选择待丢弃记录");
      const rows = stateRows(s, n.id).filter((r) =>
        action.rowKeys.includes(r.rowkey),
      );
      need(
        rows.length === new Set(action.rowKeys).size,
        "丢弃范围包含不存在或重复的记录",
      );
      need(
        rows.every(
          (r) =>
            (r.status === "available" || r.status === "failed") &&
            !isLocked(s, r),
        ),
        "已交接、已丢弃或离线处理中的数据不能丢弃",
      );
      rows.forEach((r) => {
        r.status = "discarded";
        r.reason = action.reason;
        r.revision++;
      });
      log(s, "人工丢弃池内数据", `${rows.length} 条：${action.reason}`, n.id);
      break;
    }
    case "publish": {
      const errors = validateGraph(s);
      need(!errors.length, errors.join("；"));
      need(
        s.nodes.some((n) => n.kind === "source") &&
          s.nodes.some((n) => n.kind === "delivery"),
        "链路需要数据源与交付池",
      );
      for (const n of s.nodes.filter((n) => n.kind === "stage"))
        need(
          s.edges.filter((e) => e.source === n.id).length === 1 &&
            s.edges.some((e) => e.target === n.id),
          `${n.label} 需要输入和唯一的输出缓冲池`,
        );
      s.published = true;
      log(
        s,
        "发布本地演示编排",
        `${s.nodes.length} 个节点，${s.edges.length} 条单向交接关系`,
      );
      break;
    }
  }
  return s;
}
