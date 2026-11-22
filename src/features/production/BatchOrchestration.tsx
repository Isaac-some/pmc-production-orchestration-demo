import React, { useMemo, useState, useEffect, useRef } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePMC } from "../../api";
import {
  createPlan,
  stock,
  planRisks,
  planSignals,
  type ProductionPlan,
  type PlanNode,
  type PlanAction,
} from "../../../shared/production-plan";
import {
  WorkflowNodeCard,
  WorkflowNodeParam,
  WorkflowNodeMetrics,
} from "../../components/ui/WorkflowNodeCard";
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
            ? "质检确认 · 按批次放行"
            : n.kind === "stage"
              ? "执行器回传 · 保留批次血缘"
              : "库存按范围管理，工序按平台批次"
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
            value={`${(n.bindings || []).length || (n.executorId ? 1 : 0)} 个 / ${new Set((n.bindings || []).flatMap((b) => b.batchIds)).size || n.batchIds?.length || 0} 批`}
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
const nodeTypes = { plan: PlanCard };
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
    [target, setTarget] = useState(""),
    [targetBatch, setTargetBatch] = useState(""),
    [connectTarget, setConnectTarget] = useState(""),
    [search, setSearch] = useState(""),
    [searched, setSearched] = useState(""),
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
      await command("orchestration.plan", {
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
    setTarget("");
    setTargetBatch("");
    setConnectTarget("");
    setSearch("");
    setSearched("");
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
  const nodes = useMemo(
    () =>
      p.nodes.map((n) => ({
        id: n.id,
        type: "plan",
        position: { x: n.x, y: n.y },
        data: {
          node: n,
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
    [p, selected],
  );
  const edges = p.edges.map((e) => ({
    ...e,
    type: "smoothstep",
    labelStyle: { fontSize: 12, fill: "#596b7e" },
    markerEnd: { type: MarkerType.ArrowClosed },
    label:
      p.edges.filter((x) => x.source === e.source).length > 1
        ? "分支 · 分配数量"
        : p.edges.filter((x) => x.target === e.target).length > 1
          ? "合流 · 批次汇集"
          : undefined,
  }));
  const platformBatches = p.nodes
    .filter((n) => n.kind === "stage")
    .flatMap((n) =>
      (
        n.bindings ||
        (n.executorId
          ? [{ executorId: n.executorId, batchIds: n.batchIds || [], at: "" }]
          : [])
      ).flatMap((b) =>
        b.batchIds.map((batchId) => {
          const records = p.lots.filter(
            (l) =>
              l.nodeId === n.id &&
              l.executorId === b.executorId &&
              l.batchIds?.includes(batchId),
          );
          return {
            key: n.id + ":" + b.executorId + ":" + batchId,
            nodeId: n.id,
            node: n.label,
            executorId: b.executorId,
            batchId,
            input: records.reduce((s, l) => s + l.quantity, 0),
            running: records
              .filter((l) => l.state === "running")
              .reduce((s, l) => s + l.quantity, 0),
            failed: records
              .filter((l) => l.state === "failed")
              .reduce((s, l) => s + l.remaining, 0),
            completed: records
              .filter((l) => l.state === "available" && l.remaining === 0)
              .reduce((s, l) => s + l.quantity, 0),
          };
        }),
      ),
    );
  const targetNode = p.nodes.find((n) => n.id === target);
  const targetBindings = (
    targetNode?.bindings ||
    (targetNode?.executorId
      ? [
          {
            executorId: targetNode.executorId,
            batchIds: targetNode.batchIds || [],
            at: "",
          },
        ]
      : [])
  ).flatMap((b) =>
    b.batchIds.map((batchId) => ({
      value: JSON.stringify([b.executorId, batchId]),
      label: b.executorId + " / " + batchId,
    })),
  );
  const chosenBinding = targetBatch
    ? JSON.parse(targetBatch)
    : targetBindings.length === 1
      ? JSON.parse(targetBindings[0].value)
      : null;
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
  return (
    <section className={"batch-orchestration" + (full ? " batch-full" : "")}>
      <header className="batch-top">
        <div>
          <h1>生产编排</h1>
          <span>运动感知 POC · 批次调度 · 生产事件模拟</span>
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
              setTimeout(() => flow.current?.fitView({ padding: 0.15 }), 100);
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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodesDraggable={!disabled}
              nodesConnectable={!disabled}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 30, y: 70, zoom: 0.85 }}
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
              onEdgeClick={(_, e) =>
                !disabled &&
                modal.confirm({
                  title: "移除后续交接关系？",
                  content:
                    "已产生批次的数量和血缘会保留，只停止此路径后续调度。",
                  onOk: () => act({ type: "disconnect", source: e.id }),
                })
              }
            >
              <Controls />
              <MiniMap />
            </ReactFlow>
            <div className="batch-legend">
              来源接入 → 储备 / 直接生产 /
              直接交付　·　缓冲池是放行闸门　·　多入为合流，多出为数量分支
            </div>
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
              <p>
                {n.kind === "source"
                  ? "按来源生产批次登记数量与引用，原始数据留在数据平台。"
                  : n.kind === "buffer"
                    ? "产出在此等待确认；可分配给多个下游，累计放行不超过可用量。"
                    : n.kind === "stage"
                      ? "在此创建执行器、绑定平台最小生产批次，并接收生产反馈。"
                      : "可同时接收多条线路，保留来源与每次流转的批次血缘。"}
              </p>
              {n.kind === "source" && (
                <>
                  <Tag>{modes[n.mode!]}</Tag>
                  {n.mode === "selection" && (
                    <>
                      <label>检索库内数据</label>
                      <Input
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setSearched("");
                          setPicked(false);
                        }}
                        placeholder="如：运动场景视频"
                      />
                      <Button
                        disabled={!search.trim() || disabled}
                        onClick={() => {
                          setSearched(search);
                          setPicked(false);
                        }}
                      >
                        检索演示数据
                      </Button>
                      {searched && (
                        <div className="batch-search">
                          <Checkbox
                            checked={picked}
                            onChange={(e) => setPicked(e.target.checked)}
                          >
                            运动感知素材 · 1,000,000 条
                          </Checkbox>
                          <p>模拟检索结果；选定前无可用 CID</p>
                        </div>
                      )}
                    </>
                  )}
                  <label>本次接入数量（条）</label>
                  <InputNumber
                    aria-label="本次接入数量"
                    min={1}
                    max={1000000000}
                    precision={0}
                    value={n.mode === "selection" ? 1000000 : q}
                    disabled={n.mode === "selection"}
                    onChange={(v) => setQ(v || 1)}
                  />
                  <Button
                    type="primary"
                    disabled={
                      disabled ||
                      (n.mode === "selection" && !picked) ||
                      n.paused ||
                      (n.mode === "purchase" && lots.length > 0)
                    }
                    onClick={() =>
                      run({
                        type: "ingest",
                        nodeId: n.id,
                        quantity: n.mode === "selection" ? 1000000 : q,
                        eventId: crypto.randomUUID(),
                        cid:
                          n.mode === "selection"
                            ? "DEMO-CID-" + crypto.randomUUID().slice(0, 8)
                            : undefined,
                      })
                    }
                  >
                    {n.mode === "selection"
                      ? "确认圈选并接入"
                      : n.mode === "purchase"
                        ? "模拟一次性导入"
                        : "模拟扫描到新生产批次"}
                  </Button>
                  <p className="batch-note">
                    {n.mode === "collection"
                      ? "持续采集按扫描事件追加；仅手动推进模拟，不后台不断造数。"
                      : n.mode === "purchase"
                        ? "本采购来源只导入一次，新增采购另建来源。"
                        : "CID 在确认检索结果后才登记；公开原型使用 DEMO 标识。"}
                  </p>
                </>
              )}
              {n.kind === "stage" && (
                <>
                  <div className="batch-well">
                    <span>绑定执行器</span>
                    <strong>{n.executorId || "未绑定"}</strong>
                    <span>平台生产批次</span>
                    <strong>{n.batchIds?.join(", ") || "未绑定"}</strong>
                  </div>
                  {n.feedback && (
                    <Alert
                      type="info"
                      message={"平台回传：" + n.feedback.status}
                      description={`末端成功 ${n.feedback.completed.toLocaleString()} / 失败 ${n.feedback.failed.toLocaleString()} 条；回传 ${new Date(n.feedback.at).toLocaleString("zh-CN")}。绑定反馈不直接重复计入交付。`}
                    />
                  )}
                  <Button
                    type="primary"
                    disabled={disabled}
                    onClick={() => void goPlatform().catch(() => undefined)}
                  >
                    {n.platform === "human"
                      ? "去人工标注 · 创建并绑定"
                      : "去标注 · 新建执行器"}
                  </Button>
                  <Space>
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        setExecutor(n.executorId || "");
                        setBatch(n.batchIds?.join(",") || "");
                        setBinding(true);
                      }}
                    >
                      绑定已有执行器
                    </Button>
                    <Button
                      danger
                      disabled={disabled || !n.executorId}
                      onClick={() => run({ type: "unbind", nodeId: n.id })}
                    >
                      解绑
                    </Button>
                  </Space>
                  <h4>
                    环节内生产批次 ·{" "}
                    {platformBatches.filter((b) => b.nodeId === n.id).length} 批
                  </h4>
                  <p>
                    批次由平台创建，可为500条或80万条。运行中可继续绑定新执行器；放行只增加对应批次输入，不新造平台批次。
                  </p>
                  {platformBatches
                    .filter((b) => b.nodeId === n.id)
                    .map((b) => (
                      <div className="batch-run" key={b.key}>
                        <strong>
                          {b.batchId} · {b.input.toLocaleString()} 条
                        </strong>
                        <p>
                          {b.executorId} · 处理中 {b.running.toLocaleString()} /
                          完成 {b.completed.toLocaleString()} / 异常{" "}
                          {b.failed.toLocaleString()}
                        </p>
                        <Button
                          danger
                          disabled={disabled || b.running > 0}
                          onClick={() =>
                            run({
                              type: "unbind",
                              nodeId: n.id,
                              executorId: b.executorId,
                              batchIds: [b.batchId],
                            })
                          }
                        >
                          解绑此批次
                        </Button>
                      </div>
                    ))}
                  {n.platform === "human" && (
                    <p className="batch-note">
                      人工平台无在线原型，在本地复用绑定面板演示；终端结果确认后才计入可交付产出。
                    </p>
                  )}
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
              {n.kind !== "stage" && n.kind !== "delivery" && (
                <>
                  <h4>下游交接</h4>
                  <Select
                    aria-label="新增交接目标"
                    placeholder="可直接生产或交付，选择新目标"
                    value={connectTarget || undefined}
                    onChange={setConnectTarget}
                    options={p.nodes
                      .filter(
                        (x) =>
                          x.id !== n.id &&
                          x.kind !== "source" &&
                          !outgoing.some((e) => e.target === x.id),
                      )
                      .map((x) => ({ value: x.id, label: x.label }))}
                  />
                  <Button
                    disabled={disabled || !connectTarget}
                    onClick={() =>
                      run({
                        type: "connect",
                        source: n.id,
                        target: connectTarget,
                      })
                    }
                  >
                    建立交接关系
                  </Button>
                  {!outgoing.length && (
                    <p>从右侧端口连接到生产工序或交付池。</p>
                  )}
                  <Select
                    aria-label="交接目标"
                    placeholder="选择下游"
                    value={target || undefined}
                    onChange={(v) => {
                      setTarget(v);
                      setTargetBatch("");
                    }}
                    options={outgoing.map((e) => ({
                      value: e.target,
                      label: p.nodes.find((n) => n.id === e.target)?.label,
                    }))}
                  />
                  {targetNode?.kind === "stage" && (
                    <Select
                      aria-label="目标平台生产批次"
                      placeholder="选择环节内的实际生产批次"
                      value={
                        targetBatch ||
                        (targetBindings.length === 1
                          ? targetBindings[0].value
                          : undefined)
                      }
                      onChange={setTargetBatch}
                      options={targetBindings}
                    />
                  )}
                  <label>本次放行数量（条）</label>
                  <InputNumber
                    aria-label="本次放行数量"
                    value={q}
                    min={1}
                    max={1000000000}
                    precision={0}
                    onChange={(v) => setQ(v || 1)}
                  />
                  <p>
                    可用库存 {stock(p, n.id).toLocaleString()}{" "}
                    条；分支按数量拆分，合流保留多父批次。
                  </p>
                  <Button
                    disabled={
                      disabled ||
                      !target ||
                      stock(p, n.id) < q ||
                      (targetNode?.kind === "stage" && !chosenBinding)
                    }
                    onClick={() =>
                      run({
                        type: "transfer",
                        nodeId: n.id,
                        target,
                        quantity: q,
                        executorId: chosenBinding?.[0],
                        batchIds: chosenBinding
                          ? [chosenBinding[1]]
                          : undefined,
                      })
                    }
                  >
                    确认放行给下游
                  </Button>
                </>
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
          ) : (
            <aside className="batch-inspector batch-guide">
              <h3>从输入到交付</h3>
              <p>
                先圈选、采集或采买接入，按批次放行；点击工序可去平台创建执行器。
              </p>
              <Button
                onClick={() => {
                  setSelected("selection");
                  flow.current?.setCenter(148, 150, { zoom: 1, duration: 200 });
                }}
              >
                开始圈选
              </Button>
              <h4>长周期生产</h4>
              <p>
                30
                天计划，千万级目标。只记录批次元数据，查看逐日产能和预测缺口。
              </p>
              <Button onClick={() => setTab("monitor")}>查看风险与批次</Button>
              <Alert
                type="info"
                message="模拟边界"
                description="真实跨原型跳转；TOS、AI处理和生产回传以模拟事件验证。不会操作测试环境生产数据。"
              />
            </aside>
          )}
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
        title="离线加工 · 批次记录"
        open={offline}
        onCancel={() => setOffline(false)}
        footer={null}
        width={680}
      >
        <p>
          原始数据由资源平台导出；本原型下载的是批次清单，不生成百万行CSV。登记后冻结该数量，新增库存仍可生产。
        </p>
        <label>本次处理数量</label>
        <InputNumber
          aria-label="离线数量"
          value={q}
          min={1}
          precision={0}
          onChange={(v) => setQ(v || 1)}
        />
        <Button
          disabled={disabled || stock(p, selected) < q}
          onClick={() =>
            run({ type: "offline", nodeId: selected, quantity: q })
          }
        >
          登记离线处理范围
        </Button>
        {(p.offline || [])
          .filter((j) => j.nodeId === selected)
          .map((j) => (
            <div className="batch-run" key={j.id}>
              <p>
                {j.id} · {j.quantity.toLocaleString()} 条 · {j.status}
              </p>
              <Space>
                <Button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(j, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = j.id + "-manifest.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  下载批次清单
                </Button>
                <Button
                  disabled={disabled || j.status !== "processing"}
                  onClick={() => setOfflineJob(j.id)}
                >
                  回传预览
                </Button>
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
                  取消并解冻
                </Button>
              </Space>
              {offlineJob === j.id && j.status === "processing" && (
                <div>
                  <p>
                    将回传 {q.toLocaleString()} 条；原CID {j.cid}{" "}
                    保留；其他范围和并发新增不覆盖。仅演示平台完成回执，实际文件仍由资源平台处理。
                  </p>
                  <Button
                    disabled={disabled || q > j.quantity}
                    onClick={() =>
                      run({
                        type: "offlineReturn",
                        nodeId: selected,
                        lotId: j.id,
                        quantity: q,
                      })
                    }
                  >
                    确认模拟回传
                  </Button>
                </div>
              )}
            </div>
          ))}
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
