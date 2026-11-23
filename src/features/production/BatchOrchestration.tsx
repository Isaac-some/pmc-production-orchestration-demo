import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  App,
  Alert,
  Button,
  Modal,
  Input,
  InputNumber,
  Select,
  Table,
  Tabs,
  Space,
  Tag,
  Empty,
  Upload,
  Drawer,
  Checkbox,
} from "antd";
import {
  DatabaseOutlined,
  CloudOutlined,
  RobotOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  FullscreenOutlined,
} from "@ant-design/icons";
import {
  ReactFlow,
  Handle,
  Position,
  Controls,
  MiniMap,
  MarkerType,
  type ReactFlowInstance,
  applyNodeChanges,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { parseImportCSV } from "../../../shared/process";
import { usePMC } from "../../api";
import {
  createPlan,
  stock,
  planRisks,
  planSignals,
  planBatches,
  planCids,
  type ProductionPlan,
  type PlanNode,
  type PlanAction,
} from "../../../shared/production-plan";
import {
  WorkflowNodeCard,
  WorkflowNodeParam,
  WorkflowNodeMetrics,
} from "../../components/ui/WorkflowNodeCard";
import { BatchBindings } from "../../components/ui/BatchBindings";
import { HumanPlatformPrototype } from "../../components/ui/HumanPlatformPrototype";
import { AITablePrompt } from "../../components/ui/AITablePrompt";
import "./batch-orchestration.css";
const labels = {
  source: "输入源",
  sourcePool: "资源储备池",
  stage: "生产工序",
  buffer: "缓冲池",
  delivery: "交付池",
};
const modes = {
  selection: "库内检索后圈选",
  collection: "TOS持续扫描",
  purchase: "TOS一次导入",
};
const platforms = {
  machine: "机器标注",
  human: "人工标注",
  agent: "Agent处理",
  compress: "视频压缩",
};
function PlanCard({ data }: any) {
  const n: PlanNode = data.node;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={n.kind !== "source"}
      />
      <WorkflowNodeCard
        title={n.label}
        subtitle={
          n.kind === "source"
            ? modes[n.mode!]
            : n.kind === "stage"
              ? platforms[n.platform!]
              : labels[n.kind]
        }
        icon={
          n.kind === "stage" ? (
            <RobotOutlined />
          ) : n.kind === "source" ? (
            <CloudOutlined />
          ) : n.kind === "delivery" ? (
            <CheckCircleOutlined />
          ) : (
            <InboxOutlined />
          )
        }
        variant={n.kind}
        status={
          data.failed
            ? "error"
            : n.paused
              ? "paused"
              : data.running
                ? "running"
                : "idle"
        }
        statusLabel={
          data.failed
            ? "待处理"
            : n.paused
              ? "已暂停"
              : data.running
                ? "生产中"
                : n.kind === "stage"
                  ? n.executorId
                    ? "已绑定"
                    : "待绑定"
                  : "可调度"
        }
        footer={
          n.kind === "buffer"
            ? "CID接收与交接"
            : n.kind === "stage"
              ? "平台生产批次"
              : "CID数据集"
        }
        actionLabel={n.kind === "stage" ? "去标注 / 管理" : "查看与调度"}
        onAction={data.open}
        selected={data.selected}
      >
        {n.kind === "source" && (
          <WorkflowNodeParam
            label="接入方式"
            value={
              n.mode === "selection"
                ? "确认后生成可用CID"
                : n.bucket || "TOS目录"
            }
          />
        )}
        {n.kind === "stage" && (
          <WorkflowNodeParam
            label="执行器 / 生产批次"
            value={`${(n.bindings || []).length || (n.executorId ? 1 : 0)} 个 / ${data.batchCount} 批`}
          />
        )}
        <WorkflowNodeMetrics
          values={
            n.kind === "stage"
              ? [
                  { label: "累计投入", value: data.input },
                  { label: "处理中", value: data.running },
                  { label: "已完成", value: data.completed },
                  {
                    label: "失败隔离",
                    value: data.failed,
                    danger: !!data.failed,
                  },
                ]
              : [
                  {
                    label: n.kind === "delivery" ? "累计交付" : "可用库存",
                    value: data.available,
                  },
                  {
                    label: "异常隔离",
                    value: data.failed,
                    danger: !!data.failed,
                  },
                ]
          }
        />
      </WorkflowNodeCard>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={n.kind !== "delivery"}
      />
    </>
  );
}
const nodeTypes = { plan: memo(PlanCard) };
const initialViewport = { x: 30, y: 70, zoom: 0.85 };
const ManagedPlanFlow = memo(function ManagedPlanFlow({
  models,
  ...props
}: { models: Node[] } & Omit<
  React.ComponentProps<typeof ReactFlow>,
  "nodes" | "onNodesChange"
>) {
  const [nodes, setNodes] = useState<Node[]>(models);
  useEffect(() => setNodes(models), [models]);
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  return <ReactFlow {...props} nodes={nodes} onNodesChange={onNodesChange} />;
});
export function BatchOrchestration({ businessId }: { businessId: string }) {
  const { state, user, command, busy } = usePMC(),
    { message, modal } = App.useApp();
  const p: ProductionPlan = useMemo(
    () => state.drafts["production-plan:" + businessId] || createPlan(),
    [state.drafts, businessId],
  );
  const [selected, setSelected] = useState(""),
    [tab, setTab] = useState("canvas"),
    [full, setFull] = useState(false),
    [error, setError] = useState("");
  const [q, setQ] = useState<number>(1000000),
    [targetBatch, setTargetBatch] = useState(""),
    [inputCid, setInputCid] = useState(""),
    [edgeId, setEdgeId] = useState(""),
    [edgeCid, setEdgeCid] = useState(""),
    [offlineCid, setOfflineCid] = useState(""),
    [uploadPreview, setUploadPreview] = useState<{
      cid: string;
      version: number;
      quantity: number;
      headers: string[];
      file: string;
    } | null>(null),
    [uploadError, setUploadError] = useState(""),
    [picked, setPicked] = useState(false);
  const [humanOpen, setHumanOpen] = useState(false),
    [recoveryPlatform, setRecoveryPlatform] =
      useState<PlanNode["platform"]>("human"),
    [binding, setBinding] = useState(false),
    [executor, setExecutor] = useState(""),
    [batch, setBatch] = useState(""),
    [offline, setOffline] = useState(false),
    [offlineJob, setOfflineJob] = useState(""),
    [retention, setRetention] = useState(false),
    [retainIds, setRetainIds] = useState<string[]>([]),
    [retainReason, setRetainReason] = useState(""),
    [history, setHistory] = useState(false),
    [add, setAdd] = useState(false),
    [name, setName] = useState(""),
    [kind, setKind] = useState<PlanNode["kind"]>("stage"),
    [mode, setMode] = useState<PlanNode["mode"]>("collection"),
    [platform, setPlatform] = useState<PlanNode["platform"]>("machine");
  const [goal, setGoal] = useState(p.goal),
    [days, setDays] = useState(p.days),
    [daily, setDaily] = useState(200000);
  const flow = useRef<ReactFlowInstance | null>(null),
    returning = useRef(false);
  const n = p.nodes.find((n) => n.id === selected);
  const r = planRisks(p);
  const disabled =
    busy ||
    !["pm", "approver"].includes(user.role) ||
    (user.role === "pm" &&
      state.businesses.find((b) => b.id === businessId)?.ownerId !== user.id) ||
    !!state.businesses.find((b) => b.id === businessId)?.completed;
  async function act(action: PlanAction) {
    setError("");
    try {
      return await command("orchestration.plan", {
        businessId,
        canvasRevision: p.revision,
        action,
      });
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  const run = (a: PlanAction) => {
    void act(a).catch(() => undefined);
  };
  useEffect(() => {
    document.querySelector(".batch-orchestration")?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    setTargetBatch("");
    setInputCid("");
    setOfflineCid("");
    setUploadPreview(null);
    setUploadError("");
    setPicked(false);
    setQ(1000000);
  }, [selected]);
  useEffect(() => {
    const query = new URLSearchParams(location.hash.split("?")[1] || "");
    const requestId = query.get("pmcRequest");
    if (!requestId || returning.current) return;
    const nodeId = query.get("pmcNode") || "";
    const req = p.requests[requestId];
    if (!req || req.used) {
      setError("执行器回传已使用或与当前项目不匹配");
      return;
    }
    if (query.get("status") === "cancelled") {
      setError("已取消平台创建，编排保持未绑定");
      query.delete("pmcRequest");
      query.delete("status");
      historyReplace(query);
      return;
    }
    if (req.kind === "selection") {
      const cid = query.get("selectionCid");
      if (!cid) return;
      returning.current = true;
      setSelected(nodeId);
      void act({
        type: "ingest",
        nodeId,
        requestId,
        cid,
        eventId: requestId,
        quantity: Number(query.get("quantity")),
        headers: (query.get("headers") || "rowkey,tos_path,caption").split(","),
      })
        .then(() => {
          for (const k of [
            "pmcRequest",
            "pmcNode",
            "selectionCid",
            "quantity",
            "headers",
            "status",
          ])
            query.delete(k);
          historyReplace(query);
          message.success("圈选结果已回传");
        })
        .catch(() => {
          returning.current = false;
        });
      return;
    }
    if (!query.get("executorId")) return;
    returning.current = true;
    setSelected(nodeId);
    act({
      type: "bind",
      nodeId,
      requestId,
      executorId: query.get("executorId")!,
      status: query.get("status") || "ready",
      completed: Number(query.get("completed") || 0),
      failed: Number(query.get("failed") || 0),
      batchIds: (query.get("batchIds") || "").split(",").filter(Boolean),
    })
      .then(() => {
        message.success("执行器与批次已回传并绑定");
        for (const k of [
          "pmcRequest",
          "pmcNode",
          "executorId",
          "batchIds",
          "status",
          "completed",
          "failed",
        ])
          query.delete(k);
        historyReplace(query);
      })
      .catch(() => {
        returning.current = false;
      });
  }, [p.revision]);
  function historyReplace(query: URLSearchParams) {
    window.history.replaceState(
      null,
      "",
      location.pathname +
        location.search +
        location.hash.split("?")[0] +
        "?" +
        query,
    );
  }
  async function goPlatform() {
    if (!n) return;
    if (n.platform === "human") {
      setHumanOpen(true);
      return;
    }
    const requestId = crypto.randomUUID();
    await act({ type: "request", nodeId: n.id, requestId });
    const url = new URL(
      "https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/project/detail/",
    );
    url.search = new URLSearchParams({
      id: "234",
      tab: "executors",
      pmcProject: businessId,
      pmcNode: n.id,
      pmcRequest: requestId,
      pmcReturn: location.href,
    }).toString();
    location.assign(url.href);
  }
  const platformBatches = useMemo(() => planBatches(p), [p]);
  const nodeModels = useMemo(
    () =>
      p.nodes.map((n) => ({
        id: n.id,
        type: "plan",
        position: { x: n.x, y: n.y },
        data: {
          node: n,
          batchCount: platformBatches.filter((b) => b.nodeId === n.id).length,
          selected: n.id === selected,
          input: p.lots
            .filter(
              (l) => l.nodeId === n.id && l.executorId && l.batchIds?.length,
            )
            .reduce((s, l) => s + l.quantity, 0),
          completed: p.lots
            .filter(
              (l) =>
                l.nodeId === n.id &&
                l.executorId &&
                l.state === "available" &&
                l.remaining === 0,
            )
            .reduce((s, l) => s + l.quantity, 0),
          available:
            n.kind === "delivery"
              ? p.lots
                  .filter((l) => l.nodeId === n.id && l.state === "delivered")
                  .reduce((s, l) => s + l.quantity, 0)
              : stock(p, n.id),
          running: p.lots
            .filter((l) => l.nodeId === n.id && l.state === "running")
            .reduce((s, l) => s + l.quantity, 0),
          failed: p.lots
            .filter((l) => l.nodeId === n.id && l.state === "failed")
            .reduce((s, l) => s + l.remaining, 0),
          open: () => setSelected(n.id),
        },
      })),
    [p, selected, platformBatches],
  );
  const activeEdge = p.edges.find((e) => e.id === edgeId);
  const activeEdgeTarget = p.nodes.find((n) => n.id === activeEdge?.target);
  const edgeCids = activeEdge
    ? planCids(p, activeEdge.source).filter((c) => c.available > 0)
    : [];
  const currentCids = n ? planCids(p, n.id) : [];
  const sourceOptions = n
    ? p.edges
        .filter((e) => e.target === n.id)
        .flatMap((e) =>
          planCids(p, e.source)
            .filter((c) => c.available > 0)
            .map((c) => ({
              value: JSON.stringify([e.source, c.id]),
              label:
                p.nodes.find((n) => n.id === e.source)?.label +
                " / " +
                c.id +
                " · " +
                c.available.toLocaleString() +
                " 条",
            })),
        )
    : [];
  const selectedInput = inputCid
    ? JSON.parse(inputCid)
    : sourceOptions.length === 1
      ? JSON.parse(sourceOptions[0].value)
      : null;
  const stageBindings = (n?.bindings || []).flatMap((b) =>
    b.batchIds.map((batchId) => ({
      value: JSON.stringify([b.executorId, batchId]),
      label: b.executorId + " / " + batchId,
    })),
  );
  const selectedBatch = targetBatch
    ? JSON.parse(targetBatch)
    : stageBindings.length === 1
      ? JSON.parse(stageBindings[0].value)
      : null;
  const edges = p.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    // Give converging edges separate lanes so later edges cannot hide earlier ones.
    pathOptions: {
      offset: 8,
      stepPosition:
        (p.edges.filter((x) => x.target === e.target).findIndex((x) => x.id === e.id) + 1) /
        (p.edges.filter((x) => x.target === e.target).length + 1),
    },
    interactionWidth: 12,
    ariaLabel: `${p.nodes.find((n) => n.id === e.source)?.label} → ${p.nodes.find((n) => n.id === e.target)?.label}`,
    labelStyle: { fontSize: 12, fill: "#596b7e" },
    markerEnd: { type: MarkerType.ArrowClosed },
    label:
      p.edges.filter((x) => x.source === e.source).length > 1
        ? "分支 · 分配数量"
        : p.edges.filter((x) => x.target === e.target).length > 1 &&
            p.edges.find((x) => x.target === e.target)?.id === e.id
          ? "合流 · 批次汇集"
          : undefined,
  }));
  const outgoing = p.edges.filter((e) => e.source === selected),
    lots = p.lots.filter((l) => l.nodeId === selected);
  const lotColumns: any[] = [
    { title: "交接记录", dataIndex: "id" },
    {
      title: "输入数量",
      dataIndex: "quantity",
      align: "right",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "剩余数量",
      dataIndex: "remaining",
      align: "right",
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: "状态",
      dataIndex: "state",
      render: (v: string, l: any) =>
        v === "available" && l.remaining === 0
          ? "已交接"
          : {
              available: "可调度",
              running: "生产中",
              failed: "异常隔离",
              delivered: "已交付",
            }[v],
    },
    {
      title: "执行器",
      dataIndex: "executorId",
      render: (v: string) => v || "—",
    },
    {
      title: "处理规则",
      dataIndex: "rule",
      render: (v: any) => (v ? "v" + v.version : "—"),
    },
    {
      title: "血缘",
      dataIndex: "parents",
      render: (v: string[]) => v.join(", ") || "来源输入",
    },
  ];
  function downloadCid(job: ProductionPlan["offline"][number], sample = false) {
    const data = {
      cid: job.cid,
      version: job.version || 1,
      quantity: job.quantity,
      headers: job.headers || ["rowkey", "tos_path", "caption"],
      scope: job.id,
    };
    const columns = [
      "cid",
      "cid_version",
      "rowkey",
      "tos_path",
      ...data.headers.filter(
        (h) => !["cid", "cid_version", "rowkey", "tos_path"].includes(h),
      ),
    ];
    const csv = [
      columns.join(","),
      ...Array.from({ length: Math.min(3, job.quantity) }, (_, i) =>
        columns
          .map((h) =>
            h === "cid"
              ? job.cid
              : h === "cid_version"
                ? String(data.version)
                : h === "rowkey"
                  ? "demo-" + (i + 1)
                  : h === "tos_path"
                    ? "tos://demo-motion/" + (i + 1) + ".mp4"
                    : "示例内容",
          )
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([sample ? csv : JSON.stringify(data, null, 2)], {
      type: sample ? "text/csv;charset=utf-8" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      job.cid + "-v" + data.version + (sample ? "-sample.csv" : ".json");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function previewCid(
    file: File,
    job: ProductionPlan["offline"][number],
  ) {
    setUploadPreview(null);
    setUploadError("");
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error("原型预览文件请小于2MB；大规模数据由平台回执登记");
      const text = await file.text();
      let data: any;
      if (file.name.toLowerCase().endsWith(".json")) data = JSON.parse(text);
      else {
        const { headers, rows } = parseImportCSV(text);
        if (!headers.includes("cid") || !headers.includes("cid_version"))
          throw Error("CSV必须保留cid与cid_version列");
        if (rows.some((r) => r.cid !== job.cid))
          throw Error("文件包含其他CID，不能混合上传");
        if (rows.some((r) => Number(r.cid_version) !== (job.version || 1)))
          throw Error("上传CID版本不匹配");
        const keys = new Set<string>();
        for (const row of rows) {
          if (!row.rowkey || !row.tos_path)
            throw Error("必须保留原始rowkey和tos_path");
          const key = row.rowkey + "\u0000" + row.tos_path;
          if (keys.has(key)) throw Error("上传包含重复数据");
          keys.add(key);
        }
        data = {
          cid: job.cid,
          version: job.version || 1,
          quantity: rows.length,
          headers,
        };
      }
      if (data.cid !== job.cid) throw Error("上传CID与所选CID不一致");
      if (data.version !== (job.version || 1)) throw Error("CID版本不匹配");
      if (!Number.isSafeInteger(data.quantity) || data.quantity < 0)
        throw Error("上传数据总量无效");
      if (
        !Array.isArray(data.headers) ||
        !data.headers.includes("rowkey") ||
        !data.headers.includes("tos_path")
      )
        throw Error("必须保留rowkey和tos_path表头");
      setOfflineJob(job.id);
      setUploadPreview({ ...data, file: file.name });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  }
  async function goSelection() {
    if (!n) return;
    const requestId = crypto.randomUUID();
    await act({
      type: "request",
      nodeId: n.id,
      requestId,
      pendingKind: "selection",
    });
    const query = new URLSearchParams({
      pmcProject: businessId,
      pmcNode: n.id,
      pmcRequest: requestId,
      pmcReturn: location.href,
    });
    location.hash = "/selection?" + query;
  }
  return (
    <section className={"batch-orchestration" + (full ? " batch-full" : "")}>
      <header className="batch-top">
        <div>
          <h1>生产编排</h1>
          <span>运动感知 · 生产编排</span>
        </div>
        <Space>
          <Button onClick={() => setHistory(true)}>
            操作记录 {p.events.length}
          </Button>
          <Button
            icon={<PlusOutlined aria-hidden="true" />}
            disabled={disabled}
            onClick={() => setAdd(true)}
          >
            添加节点
          </Button>
          <Button
            icon={<FullscreenOutlined aria-hidden="true" />}
            onClick={() => {
              setFull(!full);
            }}
          >
            {full ? "退出全屏" : "全屏画布"}
          </Button>
        </Space>
      </header>
      <div className="batch-summary">
        <div>
          <span>交付目标</span>
          <strong>
            {p.goal.toLocaleString()}
            <small> 条</small>
          </strong>
        </div>
        <div>
          <span>已交付</span>
          <strong>
            {r.delivered.toLocaleString()}
            <small> 条</small>
          </strong>
        </div>
        <div>
          <span>计划工期</span>
          <strong>
            {p.days}
            <small> 天</small>
          </strong>
        </div>
        <div>
          <span>剩余工期</span>
          <strong>
            {r.daysLeft}
            <small> 天</small>
          </strong>
        </div>
        <div>
          <span>异常待处理</span>
          <strong>
            {r.failed.toLocaleString()}
            <small> 条</small>
          </strong>
        </div>
      </div>
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "canvas", label: "编排画布" },
          { key: "monitor", label: "批次与风险监控" },
          { key: "plan", label: "生产计划" },
        ]}
      />
      {tab === "canvas" && (
        <div className="batch-work">
          <div className="batch-graph">
            <div className="batch-graph-tools">
              <Button onClick={() => flow.current?.fitView({ padding: 0.12 })}>
                查看全链路
              </Button>
              <Select
                aria-label="定位节点"
                placeholder="定位节点"
                style={{ width: 180 }}
                value={selected || undefined}
                onChange={(id) => {
                  setSelected(id);
                  const n = p.nodes.find((n) => n.id === id)!;
                  flow.current?.setCenter(n.x + 148, n.y + 140, {
                    zoom: 0.85,
                    duration: 200,
                  });
                }}
                options={p.nodes.map((n) => ({ value: n.id, label: n.label }))}
              />
              <span>端口连线交接 · 点击连线解绑</span>
            </div>
            <ManagedPlanFlow
              models={nodeModels}
              edges={edges}
              nodesDraggable={!disabled}
              nodesConnectable={!disabled}
              nodeTypes={nodeTypes}
              defaultViewport={initialViewport}
              minZoom={0.18}
              maxZoom={1.25}
              onInit={(f) => (flow.current = f)}
              onNodeClick={(_, n) => setSelected(n.id)}
              onNodeDragStop={(_, n) =>
                run({
                  type: "move",
                  nodeId: n.id,
                  x: n.position.x,
                  y: n.position.y,
                })
              }
              onConnect={(e) =>
                !disabled &&
                run({ type: "connect", source: e.source!, target: e.target! })
              }
              onEdgeClick={(_, e) => {
                setEdgeId(e.id);
                setEdgeCid("");
              }}
            >
              <Controls />
              <MiniMap />
            </ManagedPlanFlow>
            <div className="batch-legend">拖动节点编排 · 从端口连接上下游</div>
          </div>
          {n ? (
            <aside className="batch-inspector">
              <header>
                <div>
                  <span>{labels[n.kind]}</span>
                  <h3>{n.label}</h3>
                </div>
                <Button onClick={() => setSelected("")}>关闭</Button>
              </header>
              {n.kind === "source" && (
                <>
                  <Tag>{modes[n.mode!]}</Tag>
                  {n.mode === "selection" && (
                    <>
                      <div className="batch-cid-total">
                        <span>圈选结果</span>
                        <strong>
                          {currentCids
                            .reduce((sum, c) => sum + c.total, 0)
                            .toLocaleString()}{" "}
                          条
                        </strong>
                      </div>
                      <Button
                        type="primary"
                        disabled={disabled}
                        onClick={() => void goSelection()}
                      >
                        去圈选
                      </Button>
                    </>
                  )}
                  {n.mode !== "selection" && (
                    <>
                      <label>本次接入数量（条）</label>
                      <InputNumber
                        aria-label="本次接入数量"
                        min={1}
                        max={1000000000}
                        precision={0}
                        value={q}
                        onChange={(v) => setQ(v || 1)}
                      />
                      <Button
                        type="primary"
                        disabled={
                          disabled ||
                          n.paused ||
                          (n.mode === "purchase" && lots.length > 0)
                        }
                        onClick={() =>
                          run({
                            type: "ingest",
                            nodeId: n.id,
                            quantity: q,
                            eventId: crypto.randomUUID(),
                          })
                        }
                      >
                        {n.mode === "purchase"
                          ? "模拟一次性导入"
                          : "模拟扫描到新增数据"}
                      </Button>
                    </>
                  )}
                </>
              )}
              {n.kind === "stage" && (
                <>
                  <BatchBindings
                    batches={platformBatches.filter((b) => b.nodeId === n.id)}
                    disabled={disabled}
                    onBind={() => {
                      setExecutor("");
                      setBatch("");
                      setBinding(true);
                    }}
                    onCreate={() => void goPlatform().catch(() => undefined)}
                    onUnbind={async (executorId, batchId) => {
                      await act({
                        type: "unbind",
                        nodeId: n.id,
                        executorId,
                        batchIds: [batchId],
                      });
                    }}
                  />
                  <div className="batch-stage-input">
                    <h4>生产输入</h4>
                    <Select
                      aria-label="上游输入CID"
                      placeholder="选择已连线的上游CID"
                      value={
                        inputCid ||
                        (sourceOptions.length === 1
                          ? sourceOptions[0].value
                          : undefined)
                      }
                      onChange={setInputCid}
                      options={sourceOptions}
                    />
                    <Select
                      aria-label="执行生产批次"
                      placeholder="选择本环节实际批次"
                      value={
                        targetBatch ||
                        (stageBindings.length === 1
                          ? stageBindings[0].value
                          : undefined)
                      }
                      onChange={setTargetBatch}
                      options={stageBindings}
                    />
                    <label>本次执行数量（条）</label>
                    <InputNumber
                      aria-label="本次执行数量"
                      value={q}
                      min={1}
                      max={1000000000}
                      precision={0}
                      onChange={(v) => setQ(v || 1)}
                    />
                    <Button
                      type="primary"
                      disabled={disabled || !selectedInput || !selectedBatch}
                      onClick={() =>
                        run({
                          type: "transfer",
                          nodeId: selectedInput[0],
                          cid: selectedInput[1],
                          target: n.id,
                          quantity: q,
                          executorId: selectedBatch[0],
                          batchIds: [selectedBatch[1]],
                        })
                      }
                    >
                      启动生产
                    </Button>
                  </div>
                  <label>产出方式</label>
                  <Select
                    aria-label="产出方式"
                    value={n.outputMode || "fixed"}
                    disabled={disabled || lots.some((l) => l.executorId)}
                    onChange={(outputMode) =>
                      run({ type: "configureOutput", nodeId: n.id, outputMode })
                    }
                    options={[
                      { value: "fixed", label: "成批生产 · 每批固定CID" },
                      { value: "append", label: "流式生产 · 持续追加同一CID" },
                    ]}
                  />
                  {stock(p, n.id) > 0 && (
                    <Button
                      disabled={disabled || !n.executorId}
                      onClick={() =>
                        run({
                          type: "start",
                          nodeId: n.id,
                          quantity: stock(p, n.id),
                        })
                      }
                    >
                      启动待处理批次
                    </Button>
                  )}
                  {lots
                    .filter((l) => l.state === "running")
                    .map((l) => (
                      <div className="batch-run" key={l.id}>
                        <strong>
                          {l.id} · {l.quantity.toLocaleString()} 条
                        </strong>
                        <p>
                          绑定快照：{l.executorId} / {l.batchIds?.join(", ")}
                        </p>
                        <Space>
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              run({ type: "report", nodeId: n.id, lotId: l.id })
                            }
                          >
                            模拟成功回传
                          </Button>
                          <Button
                            danger
                            disabled={disabled}
                            onClick={() =>
                              run({
                                type: "report",
                                nodeId: n.id,
                                lotId: l.id,
                                fail: true,
                              })
                            }
                          >
                            模拟失败回传
                          </Button>
                        </Space>
                        <Button
                          disabled={disabled}
                          onClick={() => run({ type: "stale", nodeId: n.id })}
                        >
                          模拟49小时未回传
                        </Button>
                      </div>
                    ))}
                </>
              )}
              {lots.some((l) => l.state === "failed" && l.remaining > 0) && (
                <Alert
                  type="warning"
                  message="异常隔离，原线路不回退"
                  description={
                    <>
                      <Select
                        aria-label="异常承接平台"
                        value={recoveryPlatform}
                        onChange={setRecoveryPlatform}
                        options={Object.entries(platforms).map(
                          ([value, label]) => ({ value, label }),
                        )}
                      />
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          run({
                            type: "recover",
                            nodeId: n.id,
                            quantity: lots
                              .filter((l) => l.state === "failed")
                              .reduce((s, l) => s + l.remaining, 0),
                            platform: recoveryPlatform,
                          })
                        }
                      >
                        创建异常处理新线路
                      </Button>
                    </>
                  }
                />
              )}
              <section className="batch-relations">
                <h4>上下游</h4>
                <div>
                  <span>上游</span>
                  <p>
                    {p.edges
                      .filter((e) => e.target === n.id)
                      .map((e) => p.nodes.find((n) => n.id === e.source)?.label)
                      .join("、") || "—"}
                  </p>
                </div>
                <div>
                  <span>下游</span>
                  <p>
                    {outgoing
                      .map((e) => p.nodes.find((n) => n.id === e.target)?.label)
                      .join("、") || "—"}
                  </p>
                </div>
              </section>
              {n.kind !== "stage" && (
                <section className="batch-cid-list">
                  <h4>数据集 · {currentCids.length} 个 CID</h4>
                  {currentCids.map((c) => (
                    <div className="batch-cid-row" key={c.id}>
                      <strong>{c.id}</strong>
                      <span>
                        {c.mode === "append" ? "持续追加" : "固定数据集"} · v
                        {c.version}
                      </span>
                      <b>{(c.available + c.processing).toLocaleString()} 条</b>
                      {c.processing > 0 && (
                        <small>
                          离线处理中 {c.processing.toLocaleString()} 条
                        </small>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {["sourcePool", "buffer"].includes(n.kind) && (
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setOfflineJob("");
                    setOffline(true);
                  }}
                >
                  离线加工记录与回传
                </Button>
              )}
              {n.kind === "delivery" && (
                <Button
                  disabled={disabled || !lots.length}
                  onClick={() => {
                    setRetainIds(lots.map((l) => l.id));
                    setRetainReason("");
                    setRetention(true);
                  }}
                >
                  选择交付批次并留存
                </Button>
              )}
              <AITablePrompt
                nodeId={n.id}
                headers={[...new Set(currentCids.flatMap((c) => c.headers))]}
                rule={p.rules[n.id]}
                disabled={disabled}
                onConfirm={async (prompt, columns) => {
                  await act({ type: "rule", nodeId: n.id, prompt, columns });
                }}
              />
              <Button
                disabled={disabled}
                onClick={() => run({ type: "pause", nodeId: n.id })}
              >
                {n.paused ? "恢复调度" : "暂停调度"}
              </Button>
              <Button
                onClick={() => {
                  setTab("monitor");
                }}
              >
                查看生产批次与血缘
              </Button>
            </aside>
          ) : null}
        </div>
      )}
      {tab === "monitor" && (
        <div className="batch-monitor">
          <div className="batch-risk-grid">
            <section>
              <h3>交付预测</h3>
              <p>
                近 {Math.min(7, p.daily.length)} 个已登记日的有效交付均值：
                {r.rate.toLocaleString()} 条/天
              </p>
              <strong>
                {r.eta === null ? "等待日产量基线" : `预计还需 ${r.eta} 天`}
              </strong>
              <p>
                {r.eta === null
                  ? "无历史数据时不预测，不把缺数据当零产能。"
                  : `按剩余 ${r.daysLeft} 天，预测缺口 ${r.shortfall.toLocaleString()} 条。`}
              </p>
              <Button onClick={() => setTab("plan")}>
                调整计划与登记日产量
              </Button>
            </section>
            <section>
              <h3>需要处理</h3>
              {planSignals(p).map((signal, i) => (
                <Alert
                  key={i}
                  type="warning"
                  message={signal.title}
                  description={
                    <>
                      {signal.detail}
                      <Button
                        type="link"
                        onClick={() => {
                          setSelected(signal.nodeId);
                          setTab("canvas");
                          const n = p.nodes.find(
                            (n) => n.id === signal.nodeId,
                          )!;
                          setTimeout(
                            () =>
                              flow.current?.setCenter(n.x + 148, n.y + 140, {
                                zoom: 0.85,
                              }),
                            100,
                          );
                        }}
                      >
                        定位并处理
                      </Button>
                    </>
                  }
                />
              ))}
              {r.failed > 0 ? (
                <Alert
                  type="error"
                  message={`${r.failed.toLocaleString()} 条异常隔离`}
                  description="定位异常工序，转入新线路后继续生产。"
                />
              ) : (
                <p>暂无失败批次</p>
              )}
              {r.shortfall > 0 && r.rate > 0 && (
                <Alert
                  type="warning"
                  message="交付产能低于剩余日均需求"
                  description="增加独立生产线或调整下游日处理能力，勿直接累加中间队列产量。"
                />
              )}
              <p>
                回传时间见批次表；原型无持续在线监测，不声称已连接真实心跳。
              </p>
            </section>
          </div>
          <h3>每日有效交付产能</h3>
          <div className="batch-days">
            {p.daily.length ? (
              p.daily.map((v, i) => (
                <div key={i} title={`第${i + 1}天 ${v.toLocaleString()}条`}>
                  <i
                    style={{
                      height: Math.max(2, (80 * v) / Math.max(...p.daily, 1)),
                    }}
                  />
                  <span>{i + 1}日</span>
                </div>
              ))
            ) : (
              <Empty description="在生产计划中登记每天有效产出，观察一个月的趋势" />
            )}
          </div>
          <h3>平台生产批次 · {platformBatches.length} 批</h3>
          <Table
            size="small"
            rowKey="key"
            dataSource={platformBatches}
            columns={[
              { title: "生产环节", dataIndex: "node" },
              { title: "执行器", dataIndex: "executorId" },
              { title: "实际批次", dataIndex: "batchId" },
              {
                title: "绑定",
                dataIndex: "bound",
                render: (v: boolean) => (v ? "已绑定" : "已解绑 · 历史"),
              },
              ...["input", "running", "completed", "failed"].map((key, i) => ({
                title: ["输入数量", "处理中", "已完成", "异常"][i],
                dataIndex: key,
                align: "right" as const,
                render: (v: number) => v.toLocaleString(),
              })),
            ]}
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 850 }}
          />
          <h3>交接与库存血缘 · {p.lots.length} 条记录</h3>
          <Table
            size="small"
            rowKey="id"
            dataSource={p.lots}
            columns={[
              {
                title: "所在节点",
                dataIndex: "nodeId",
                render: (v: string) => (
                  <Button
                    type="link"
                    onClick={() => {
                      setSelected(v);
                      setTab("canvas");
                    }}
                  >
                    {p.nodes.find((n) => n.id === v)?.label}
                  </Button>
                ),
              },
              ...lotColumns,
              {
                title: "最近回传 / 登记",
                dataIndex: "at",
                render: (v: string) => new Date(v).toLocaleString("zh-CN"),
              },
            ]}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </div>
      )}
      {tab === "plan" && (
        <div className="batch-plan">
          <h3>长周期生产计划</h3>
          <label>目标交付量（条）</label>
          <InputNumber
            min={1}
            max={1000000000}
            precision={0}
            value={goal}
            onChange={(v) => setGoal(v || 1)}
          />
          <label>计划工期（天）</label>
          <InputNumber
            min={1}
            max={365}
            precision={0}
            value={days}
            onChange={(v) => setDays(v || 1)}
          />
          <Button
            disabled={disabled}
            onClick={() => run({ type: "plan", goal, days })}
          >
            保存生产计划
          </Button>
          <h3>登记有效交付日产能</h3>
          <p>
            按日期顺序登记，仅统计满足交付标准的终端产出。中间工序数量不重复计入。
          </p>
          <InputNumber
            aria-label="有效日产量"
            min={0}
            max={1000000000}
            precision={0}
            value={daily}
            onChange={(v) => setDaily(v || 0)}
          />
          <Button
            disabled={disabled}
            onClick={() => run({ type: "day", quantity: daily })}
          >
            模拟推进一天并登记
          </Button>
        </div>
      )}
      <HumanPlatformPrototype
        open={humanOpen}
        onClose={() => setHumanOpen(false)}
        onBind={async (executorId, batchIds) => {
          await act({ type: "bind", nodeId: selected, executorId, batchIds });
          setHumanOpen(false);
        }}
      />
      <Modal
        title="离线处理 CID"
        open={offline}
        onCancel={() => {
          setOffline(false);
          setUploadPreview(null);
        }}
        footer={null}
        width={800}
        centered
        styles={{
          body: { maxHeight: "calc(100vh - 210px)", overflowY: "auto" },
        }}
      >
        <label>选择一个输入 CID</label>
        <Select
          aria-label="离线CID"
          style={{ width: "100%", margin: "12px 0" }}
          value={offlineCid || undefined}
          onChange={(id) => {
            setOfflineCid(id);
            setUploadPreview(null);
            setUploadError("");
          }}
          options={currentCids.map((c) => ({
            value: c.id,
            label:
              c.id +
              " · " +
              c.total.toLocaleString() +
              " 条 · " +
              (c.mode === "append" ? "持续追加" : "固定"),
            disabled: c.available === 0 || c.consumed > 0,
          }))}
        />
        <Button
          disabled={
            disabled ||
            !offlineCid ||
            p.offline.some(
              (j) => j.cid === offlineCid && j.status === "processing",
            )
          }
          onClick={async () => {
            const result = await act({
              type: "offline",
              nodeId: selected,
              cid: offlineCid,
            });
            downloadCid(result.canvas.offline.at(-1));
          }}
        >
          登记并下载此 CID
        </Button>
        {uploadError && <Alert type="error" message={uploadError} />}
        {(p.offline || [])
          .filter((j) => j.nodeId === selected)
          .map((j) => (
            <div className="cid-offline-job" key={j.id}>
              <header>
                <strong>{j.cid}</strong>
                <Tag>
                  {j.status === "processing"
                    ? "处理中"
                    : j.status === "returned"
                      ? "已回传"
                      : "已取消"}
                </Tag>
              </header>
              <p>
                下载版本 v{j.version || 1} · {j.quantity.toLocaleString()} 条
              </p>
              <Space wrap>
                <Button onClick={() => downloadCid(j)}>下载 CID 引用</Button>
                <Button onClick={() => downloadCid(j, true)}>
                  下载 3 行样例 CSV
                </Button>
                <Upload
                  accept=".csv,.json"
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    await previewCid(file, j);
                    return false;
                  }}
                >
                  <Button disabled={disabled || j.status !== "processing"}>
                    上传处理结果
                  </Button>
                </Upload>
                <Button
                  disabled={disabled || j.status !== "processing"}
                  onClick={() =>
                    run({
                      type: "offlineCancel",
                      nodeId: selected,
                      lotId: j.id,
                    })
                  }
                >
                  取消处理
                </Button>
              </Space>
              {uploadPreview && offlineJob === j.id && (
                <div className="cid-upload-preview">
                  <h4>回传预览</h4>
                  <p>{uploadPreview.file}</p>
                  <p>
                    覆盖 {j.cid} · v{j.version} → v{(j.version || 1) + 1}
                  </p>
                  <p>
                    处理前 {j.quantity.toLocaleString()} 条 → 上传后{" "}
                    {uploadPreview.quantity.toLocaleString()} 条
                  </p>
                  <p>
                    覆盖后池内现存{" "}
                    {(
                      stock(p, selected) + uploadPreview.quantity
                    ).toLocaleString()}{" "}
                    条；下载后新增保留
                  </p>
                  <Button
                    type="primary"
                    disabled={disabled}
                    onClick={async () => {
                      const result = await act({
                        type: "offlineReturn",
                        nodeId: selected,
                        lotId: j.id,
                        cid: uploadPreview.cid,
                        expectedVersion: uploadPreview.version,
                        quantity: uploadPreview.quantity,
                        headers: uploadPreview.headers,
                      });
                      setUploadPreview(null);
                      message.success(
                        "已覆盖原CID，池内现存 " +
                          stock(result.canvas, selected).toLocaleString() +
                          " 条",
                      );
                    }}
                  >
                    确认覆盖原 CID
                  </Button>
                </div>
              )}
            </div>
          ))}
        <p className="batch-note">
          池内现存 {stock(p, selected).toLocaleString()} 条
        </p>
      </Modal>
      <Modal
        title="交接关系"
        open={!!activeEdge}
        onCancel={() => setEdgeId("")}
        footer={null}
        width={600}
      >
        <p>
          {p.nodes.find((n) => n.id === activeEdge?.source)?.label} →{" "}
          {activeEdgeTarget?.label}
        </p>
        {activeEdgeTarget?.kind === "stage" ? (
          <>
            <p>生产输入与执行数量在目标生产环节中设置。</p>
            <Button
              onClick={() => {
                setSelected(activeEdgeTarget.id);
                setEdgeId("");
              }}
            >
              打开生产环节
            </Button>
          </>
        ) : (
          <>
            <Select
              aria-label="交接CID"
              placeholder="选择整个CID"
              value={edgeCid || undefined}
              onChange={setEdgeCid}
              style={{ width: "100%", margin: "12px 0" }}
              options={edgeCids.map((c) => ({
                value: c.id,
                label: c.id + " · " + c.available.toLocaleString() + " 条",
              }))}
            />
            <Button
              type="primary"
              disabled={disabled || !edgeCid}
              onClick={async () => {
                await act({
                  type: "transfer",
                  nodeId: activeEdge!.source,
                  target: activeEdge!.target,
                  cid: edgeCid,
                });
                setEdgeId("");
              }}
            >
              交接此 CID
            </Button>
          </>
        )}
        <Button
          danger
          style={{ float: "right" }}
          disabled={disabled}
          onClick={() =>
            modal.confirm({
              title: "解除交接关系？",
              content: "已产生的数据与历史生产记录会保留。",
              onOk: async () => {
                await act({ type: "disconnect", source: edgeId });
                setEdgeId("");
              },
            })
          }
        >
          解除连线
        </Button>
      </Modal>
      <Modal
        title="交付留存范围"
        open={retention}
        onCancel={() => setRetention(false)}
        okText="提交留存任务"
        onOk={async () => {
          await act({
            type: "retain",
            nodeId: selected,
            source: retainIds.join(","),
            label: retainReason,
          });
          setRetention(false);
        }}
      >
        <p>按最终交付批次选择，保留CID身份；任务独立排队，不改变结项审批。</p>
        <div className="batch-retention">
          {lots
            .filter((l) => l.state === "delivered")
            .map((l) => (
              <Checkbox
                key={l.id}
                checked={retainIds.includes(l.id)}
                onChange={(e) =>
                  setRetainIds(
                    e.target.checked
                      ? [...retainIds, l.id]
                      : retainIds.filter((id) => id !== l.id),
                  )
                }
              >
                {l.cid} · {l.quantity.toLocaleString()} 条
              </Checkbox>
            ))}
        </div>
        <label>未留存的共享原因（有未选项时必填）</label>
        <Input.TextArea
          value={retainReason}
          onChange={(e) => setRetainReason(e.target.value)}
        />
        <p>已提交 {(p.retention || []).length} 次留存任务</p>
      </Modal>
      <Modal
        title="绑定平台执行器"
        open={binding}
        onCancel={() => setBinding(false)}
        okText="确认绑定"
        confirmLoading={busy}
        onOk={async () => {
          await act({
            type: "bind",
            nodeId: selected,
            executorId: executor,
            batchIds: batch
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          });
          setBinding(false);
        }}
      >
        <p>
          执行器可以只包含一个批次。人工平台以终端批次上报，保留平台最小生产单元。
        </p>
        <label>执行器 ID</label>
        <Input
          aria-label="执行器ID"
          value={executor}
          onChange={(e) => setExecutor(e.target.value)}
        />
        <label>批次 ID（多个用逗号分隔）</label>
        <Input
          aria-label="批次ID"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        />
      </Modal>
      <Modal
        title="添加编排节点"
        open={add}
        onCancel={() => setAdd(false)}
        okText="添加节点"
        onOk={async () => {
          await act({ type: "add", label: name, source: kind, mode, platform });
          setAdd(false);
          setName("");
        }}
      >
        <div className="batch-modal-fields">
          <label>名称</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <label>节点职责</label>
          <Select
            value={kind}
            onChange={setKind}
            options={Object.entries(labels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          {kind === "source" && (
            <Select
              value={mode}
              onChange={setMode}
              options={Object.entries(modes).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
          {kind === "stage" && (
            <Select
              value={platform}
              onChange={setPlatform}
              options={Object.entries(platforms).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
        </div>
      </Modal>
      <Drawer
        title="编排操作记录"
        open={history}
        onClose={() => setHistory(false)}
        width={520}
      >
        {p.events
          .slice()
          .reverse()
          .map((e, i) => (
            <p key={i}>
              {new Date(e.at).toLocaleString("zh-CN")}
              <br />
              {e.detail}
            </p>
          ))}
      </Drawer>
    </section>
  );
}
