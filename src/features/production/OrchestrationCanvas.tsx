import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Upload,
} from "antd";
import {
  ApartmentOutlined,
  DatabaseOutlined,
  CloudOutlined,
  RobotOutlined,
  TeamOutlined,
  InboxOutlined,
  PlusOutlined,
  SaveOutlined,
  UndoOutlined,
  RedoOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  AimOutlined,
  CloseOutlined,
  PlayCircleOutlined,
  PauseOutlined,
  DownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  HistoryOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  MarkerType,
  applyNodeChanges,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import * as XLSX from "xlsx";
import "@xyflow/react/dist/style.css";
import { usePMC } from "../../api";
import {
  createPOC,
  transition,
  validateGraph,
  stateRows,
  availableRows,
  nodeCids,
  rowValues,
  isLocked,
  type OState,
  type ONode,
  type OAction,
  type ORow,
  type OPlatform,
} from "../../../shared/orchestration";
import "./orchestration-canvas.css";
import {
  WorkflowNodeCard,
  WorkflowNodeParam,
  WorkflowNodeMetrics,
  type WorkflowCardStatus,
} from "../../components/ui/WorkflowNodeCard";

const kinds = {
  source: "数据源",
  sourcePool: "来源池",
  stage: "生产工序",
  buffer: "缓冲池",
  delivery: "交付池",
};
const platforms: Record<OPlatform, string> = {
  machine: "机器标注平台",
  agent: "Agent 标注平台",
  human: "人工标注平台",
  compress: "视频压缩处理",
};
const icons = {
  source: <CloudOutlined aria-hidden="true" />,
  sourcePool: <DatabaseOutlined aria-hidden="true" />,
  stage: <ApartmentOutlined aria-hidden="true" />,
  buffer: <InboxOutlined aria-hidden="true" />,
  delivery: <CheckCircleOutlined aria-hidden="true" />,
};
const stateNames = {
  available: "待放行",
  failed: "待处理失败",
  consumed: "已交接",
  discarded: "已丢弃",
};
function BoardNode({ data, selected }: any) {
  const n: ONode = data.node;
  const icon =
    n.kind === "stage" ? (
      n.platform === "human" ? (
        <TeamOutlined aria-hidden="true" />
      ) : n.platform === "compress" ? (
        <ThunderboltOutlined aria-hidden="true" />
      ) : (
        <RobotOutlined aria-hidden="true" />
      )
    ) : (
      icons[n.kind]
    );
  let status: WorkflowCardStatus = n.paused
    ? "paused"
    : data.failed
      ? "error"
      : data.pending
        ? "running"
        : data.total
          ? "completed"
          : "idle";
  const label = n.paused
    ? "已暂停"
    : data.failed
      ? `${data.failed} 条异常`
      : n.kind === "source"
        ? n.scanCount
          ? "持续接收"
          : "待启动"
        : data.pending
          ? "生产中"
          : data.awaitReport
            ? "待上报"
            : data.inflight
              ? "待生产"
              : n.kind === "stage"
                ? n.batchId
                  ? "已绑定"
                  : "待绑定"
                : data.total
                  ? "已有数据"
                  : "等待数据";
  const footer =
    n.kind === "source"
      ? "新素材自动登记"
      : n.kind === "buffer"
        ? "PM 确认后交接"
        : n.kind === "sourcePool"
          ? "项目资源储备"
          : n.kind === "delivery"
            ? "交付与留存"
            : n.platform === "human"
              ? "PM 手动上报终端"
              : "输出进入缓冲池";
  const actionLabel =
    n.kind === "source"
      ? n.scanCount
        ? "查看来源"
        : "开始接入"
      : n.kind === "stage"
        ? data.inflight
          ? "执行节点"
          : n.batchId
            ? "查看批次"
            : "绑定平台"
        : n.kind === "delivery"
          ? "查看交付"
          : "查看并放行";
  return (
    <div className="o-card-node">
      {n.kind !== "source" && (
        <Handle
          className={(n.kind === "buffer" || n.kind === "sourcePool" ? "wf-bridge-port" : "wf-node-port") + (data.inputConnected ? " connected" : "")}
          type="target"
          position={Position.Left}
        />
      )}
      <WorkflowNodeCard
        title={n.label}
        subtitle={n.kind === "stage" ? platforms[n.platform!] : kinds[n.kind]}
        icon={icon}
        variant={n.kind}
        status={status}
        statusLabel={label}
        selected={selected}
        footer={footer}
        actionLabel={actionLabel}
        onAction={data.onAction}
        disabled={data.disabled}
        errorMessage={
          data.failed
            ? `${data.failed} 条数据需处理，点击节点查看原因`
            : undefined
        }
      >
        {n.kind === "source" ? (
          <>
            <WorkflowNodeParam
              label="TOS 地址"
              value={n.bucket || "未配置"}
              code
            />
            <WorkflowNodeParam
              label="发现次数"
              value={`${n.scanCount || 0} 次`}
            />
            <WorkflowNodeParam label="接收方式" value="持续扫描 · 自动登记" />
          </>
        ) : n.kind === "stage" ? (
          <>
            <WorkflowNodeParam
              label="批次 / 队列"
              value={n.batchId || "尚未绑定"}
              code
            />
            <WorkflowNodeMetrics
              values={[
                { label: "待生产", value: data.inflight },
                { label: "累计输出", value: data.produced },
              ]}
            />
          </>
        ) : (
          <>
            <WorkflowNodeParam
              label="资源集合"
              value={data.cids || "等待首批 CID"}
              code
            />
            <WorkflowNodeMetrics
              values={[
                {
                  label: n.kind === "delivery" ? "交付结果" : "可放行",
                  value: n.kind === "delivery" ? data.total : data.ready,
                },
                {
                  label: data.failed ? "待处理异常" : "已交接",
                  value: data.failed || data.consumed,
                  danger: !!data.failed,
                },
              ]}
            />
          </>
        )}
      </WorkflowNodeCard>
      {n.kind !== "delivery" && (
        <Handle
          className={
            (n.kind === "buffer" || n.kind === "sourcePool" ? "wf-bridge-port" : "wf-node-port") + (data.outputConnected ? " connected" : "")
          }
          type="source"
          position={Position.Right}
        />
      )}
    </div>
  );
}
function BranchNode({ data }: any) {
  return (
    <div className="o-card-node">
      <Handle
        type="target"
        className="wf-node-port connected"
        position={Position.Left}
      />
      <div className="wf-card wf-branch-card">
        <header className="wf-card-header">
          <span className="wf-icon">
            <BranchesOutlined aria-hidden="true" />
          </span>
          <div className="wf-heading">
            <h3>分支放行</h3>
            <p>{data.count} 个下游去向</p>
          </div>
        </header>
        <div className="wf-card-body">由 PM 选择范围和接收工序</div>
        <footer className="wf-card-footer">
          <span>手动分配</span>
          <button
            className="wf-card-action nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              data.onOpen?.();
            }}
          >
            选择去向
          </button>
        </footer>
      </div>
      <Handle
        type="source"
        className="wf-node-port connected"
        position={Position.Right}
      />
    </div>
  );
}
const nodeTypes = { orchestration: BoardNode, branch: BranchNode };
const rowKey = (r: ORow) => `${r.cid}:${r.rowkey}`;
const fieldOptions = (rows: ORow[]) => [
  ...new Set([
    "rowkey",
    "tos_path",
    "caption",
    "sizeMB",
    "duration",
    ...rows.flatMap((r) =>
      Object.keys(r.values).filter((f) => !f.startsWith("_")),
    ),
  ]),
];
function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  const normalized = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "object" ? JSON.stringify(v) : v,
      ]),
    ),
  );
  const csv =
    "\ufeff" + XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(normalized));
  const href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function OrchestrationCanvas({ businessId }: { businessId: string }) {
  const { state, user, command, busy } = usePMC();
  const { message, modal } = App.useApp();
  const key = `orchestration:${businessId}`;
  const persisted: OState = useMemo(
    () => state.drafts[key] || createPOC(businessId),
    [state.drafts[key], businessId],
  );
  const [draft, setDraft] = useState<OState | null>(null);
  const s = draft || persisted;
  const [selection, setSelection] = useState<string>("");
  const selected = s.nodes.find((n) => n.id === selection);
  const [fullscreen, setFullscreen] = useState(false),
    [palette, setPalette] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [add, setAdd] = useState(false);
  const [addPosition, setAddPosition] = useState({ x: 600, y: 500 });
  const [addKind, setAddKind] = useState<ONode["kind"]>("stage"),
    [addName, setAddName] = useState(""),
    [addPlatform, setAddPlatform] = useState<OPlatform>("machine");
  const [undo, setUndo] = useState<OState[]>([]),
    [redo, setRedo] = useState<OState[]>([]);
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  const flow = useRef<ReactFlowInstance | null>(null);
  const [executingNode, setExecutingNode] = useState("");
  const [error, setError] = useState(""),
    [inspectorTab, setInspectorTab] = useState("operation");
  const readOnly =
    !["pm", "approver"].includes(user.role) ||
    !!state.businesses.find((b) => b.id === businessId)?.completed;
  const dirty = !!draft;
  const [exportOpen, setExportOpen] = useState(false),
    [exportCid, setExportCid] = useState(""),
    [start, setStart] = useState(1),
    [end, setEnd] = useState(1);
  const [returnId, setReturnId] = useState(""),
    [uploadRows, setUploadRows] = useState<Record<string, unknown>[] | null>(
      null,
    ),
    [uploadName, setUploadName] = useState("");
  const [retentionOpen, setRetentionOpen] = useState(false),
    [retainCids, setRetainCids] = useState<string[]>([]),
    [reason, setReason] = useState("");
  const persistedRef = useRef(persisted.revision);
  useEffect(() => {
    if (persistedRef.current !== persisted.revision) {
      persistedRef.current = persisted.revision;
      setDraft(null);
      setUndo([]);
      setRedo([]);
    }
  }, [persisted.revision]);
  useEffect(() => {
    setDraft(null);
    setSelection("");
  }, [businessId]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  useEffect(() => {
    if (readOnly || dirty || busy) return;
    const source = persisted.nodes.find(
      (n) => n.kind === "source" && n.scanCount && !n.paused,
    );
    if (!source) return;
    const timer = setTimeout(() => {
      void command("orchestration.apply", {
        businessId,
        canvasRevision: persisted.revision,
        action: { type: "scan", sourceId: source.id },
      }).catch(() => undefined);
    }, 30000);
    return () => clearTimeout(timer);
  }, [persisted.revision, dirty, busy, businessId, readOnly]);
  const graphData = useMemo(
    () =>
      s.nodes.map((n) => {
        const rows = stateRows(s, n.id);
        return {
          id: n.id,
          type: "orchestration",
          position: { x: n.x * 1.35, y: n.y * 1.45 },
          selected: n.id === selection,
          data: {
            node: n,
            disabled: readOnly || busy || dirty,
            pending: executingNode === n.id,
            awaitReport: s.runs.some(
              (r) => r.stageId === n.id && r.status === "awaiting-report",
            ),
            inputConnected: s.edges.some((e) => e.target === n.id),
            outputConnected: s.edges.some((e) => e.source === n.id),
            consumed: rows.filter((r) => r.status === "consumed").length,
            produced: s.runs
              .filter((r) => r.stageId === n.id && r.status === "completed")
              .reduce((a, r) => a + r.outputs.length, 0),
            onAction: () => {
              if (n.kind === "source" && !n.scanCount) {
                run({ type: "scan", sourceId: n.id });
              } else if (
                n.kind === "stage" &&
                s.runs.some((r) => r.stageId === n.id && r.status === "queued")
              ) {
                run({ type: "execute", stageId: n.id });
              } else {
                focus(n.id);
              }
            },
            total: rows.length,
            ready: availableRows(s, n.id).length,
            failed: (n.kind === "stage"
              ? s.runs
                  .filter((r) => r.stageId === n.id)
                  .flatMap((r) => r.outputs)
              : rows
            ).filter((r) => r.status === "failed").length,
            cids: nodeCids(s, n.id)
              .map((c) => c.id)
              .join(" + "),
            inflight: s.runs
              .filter((r) => r.stageId === n.id && r.status !== "completed")
              .reduce((a, r) => a + r.inputs.length, 0),
          },
        };
      }),
    [s, selection, busy, readOnly, dirty, executingNode],
  );
  const branchPools = useMemo(
    () =>
      s.nodes.filter(
        (n) =>
          ["sourcePool", "buffer"].includes(n.kind) &&
          s.edges.filter((e) => e.source === n.id).length > 1,
      ),
    [s],
  );
  const branchNodes = useMemo(
    () =>
      branchPools.map((n) => ({
        id: "branch:" + n.id,
        type: "branch",
        position: { x: n.x * 1.35 + 40, y: n.y * 1.45 - 190 },
        draggable: false,
        connectable: false,
        data: {
          onOpen: () => {
            focus(n.id);
          },
          owner: n.id,
          count: s.edges.filter((e) => e.source === n.id).length,
        },
      })),
    [branchPools, s],
  );
  const displayNodes = useMemo(
    () => [...graphData, ...branchNodes],
    [graphData, branchNodes],
  );
  const displayEdges = useMemo(
    () => [
      ...s.edges.map((e) => ({
        ...e,
        source: branchPools.some((n) => n.id === e.source)
          ? "branch:" + e.source
          : e.source,
      })),
      ...branchPools.map((n) => ({
        id: "branch-link:" + n.id,
        source: n.id,
        target: "branch:" + n.id,
        label: "PM 选择范围",
      })),
    ],
    [s, branchPools],
  );
  useEffect(() => setGraphNodes(displayNodes), [displayNodes]);
  const graphEdit = (action: OAction) => {
    if (readOnly) return;
    try {
      const next = transition(s, action);
      setUndo((u) => [...u, s].slice(-30));
      setRedo([]);
      setDraft(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function save() {
    if (!draft) return;
    await command("orchestration.saveGraph", {
      businessId,
      graph: { nodes: draft.nodes, edges: draft.edges, serial: draft.serial },
      canvasRevision: persisted.revision,
    });
    setDraft(null);
    message.success("编排已保存");
  }
  async function act(action: OAction) {
    if (readOnly) return;
    if (dirty) {
      setError("请先保存编排，再执行数据操作。");
      return;
    }
    try {
      setError("");
      setExecutingNode(
        "stageId" in action
          ? action.stageId
          : "sourceId" in action
            ? action.sourceId
            : "",
      );
      await command("orchestration.apply", {
        businessId,
        action,
        canvasRevision: persisted.revision,
      });
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setExecutingNode("");
    }
  }
  const run = (a: OAction) => void act(a).catch(() => undefined);
  const focus = (nodeId: string) => {
    setSelection(nodeId);
    setInspectorTab("operation");
    const n = s.nodes.find((n) => n.id === nodeId);
    if (n)
      flow.current?.setCenter(n.x * 1.35 + 140, n.y * 1.45 + 110, {
        zoom: 0.8,
        duration: 250,
      });
  };
  const allDelivery = s.cids.filter(
    (c) =>
      s.nodes.find((n) => n.id === c.nodeId)?.kind === "delivery" &&
      c.rows.length,
  );
  const openExport = (cidId?: string) => {
    const cid = s.cids.find((c) => c.id === cidId) || nodeCids(s, selection)[0];
    if (!cid?.rows.length) {
      setError("当前 CID 暂无数据可导出");
      return;
    }
    setExportCid(cid.id);
    const last = s.exports
      .filter((e) => e.cidId === cid.id && e.status !== "cancelled")
      .at(-1);
    setStart(last && last.end < cid.rows.length ? last.end + 1 : 1);
    setEnd(cid.rows.length);
    setExportOpen(true);
  };
  const openReturn = (id: string) => {
    setReturnId(id);
    setUploadRows(null);
    setUploadName("");
    setError("");
  };
  const fit = () => flow.current?.fitView({ padding: 0.12, duration: 250 });
  const selectedRows = selected ? stateRows(s, selected.id) : [];
  const restore = (direction: "undo" | "redo") => {
    const list = direction === "undo" ? undo : redo;
    const previous = list.at(-1);
    if (!previous) return;
    if (direction === "undo") {
      setUndo(list.slice(0, -1));
      setRedo((r) => [...r, s]);
    } else {
      setRedo(list.slice(0, -1));
      setUndo((u) => [...u, s]);
    }
    setDraft(previous);
  };

  return (
    <div
      className={`o-workbench${fullscreen ? " o-fullscreen" : ""}`}
      data-production-dirty={dirty ? "true" : "false"}
    >
      <div className="o-toolbar">
        <div className="o-toolbar-title">
          <BranchesOutlined aria-hidden="true" />
          <h1>生产编排</h1>
          <span>
            {dirty
              ? "有未保存修改"
              : s.published
                ? "已发布 · 本地演示"
                : "草稿 · 本地演示"}
          </span>
        </div>
        <Space size={4}>
          <Tooltip title="撤销本次编排修改">
            <Button
              aria-label="撤销"
              icon={<UndoOutlined aria-hidden="true" />}
              disabled={!undo.length || readOnly}
              onClick={() => restore("undo")}
            />
          </Tooltip>
          <Tooltip title="重做本次编排修改">
            <Button
              aria-label="重做"
              icon={<RedoOutlined aria-hidden="true" />}
              disabled={!redo.length || readOnly}
              onClick={() => restore("redo")}
            />
          </Tooltip>
          <Button
            icon={<SaveOutlined aria-hidden="true" />}
            disabled={!dirty || readOnly || busy}
            onClick={() => void save().catch(() => undefined)}
          >
            保存编排
          </Button>
          <Button
            disabled={dirty || readOnly || busy}
            type="primary"
            icon={<PlayCircleOutlined aria-hidden="true" />}
            onClick={() => run({ type: "publish" })}
          >
            校验并发布
          </Button>
          <Button
            aria-label={fullscreen ? "退出全屏画布" : "全屏画布"}
            icon={
              fullscreen ? (
                <FullscreenExitOutlined aria-hidden="true" />
              ) : (
                <FullscreenOutlined aria-hidden="true" />
              )
            }
            onClick={() => setFullscreen(!fullscreen)}
          />
        </Space>
      </div>
      <div className="o-scenarios">
        <span>运动感知 POC</span>
        <button onClick={() => focus("source-tos")}>① 持续接入</button>
        <button onClick={() => focus("buffer-machine")}>② 大视频转压缩</button>
        <button onClick={() => focus("pool-source")}>③ 增加生产线</button>
        <button onClick={() => focus("buffer-agent")}>④ 失败转人工</button>
        <button onClick={() => focus("pool-delivery")}>⑤ 交付与留存</button>
      </div>
      <div className="o-demo-notice">
        本地可操作演示：TOS
        扫描、压缩、平台生产均使用模拟数据；批次、CID、范围和血缘记录保存在本机。
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setError("")}
          message={error}
        />
      )}
      {readOnly && (
        <Alert type="info" message="当前身份或项目状态只允许查看。" />
      )}
      <div className={`o-main${selected ? " has-inspector" : ""}`}>
        <div className="o-plane">
          <div className="o-plane-tools">
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={readOnly}
              onClick={() => setPalette(!palette)}
            >
              添加节点
            </Button>
            <Button icon={<AimOutlined aria-hidden="true" />} onClick={fit}>
              查看全链路
            </Button>
            <Button
              icon={<HistoryOutlined aria-hidden="true" />}
              onClick={() => setHistoryOpen(true)}
            >
              操作记录 {s.audit.length}
            </Button>
          </div>
          {palette && (
            <aside className="o-palette">
              <header>
                <strong>选择节点类型</strong>
                <Button
                  type="text"
                  aria-label="关闭节点面板"
                  icon={<CloseOutlined aria-hidden="true" />}
                  onClick={() => setPalette(false)}
                />
              </header>
              {(
                ["source", "sourcePool", "stage", "buffer", "delivery"] as const
              ).map((kind) => (
                <button
                  key={kind}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/pmc-node", kind)
                  }
                  onClick={() => {
                    setAddKind(kind);
                    setAddName(kind === "stage" ? "" : kinds[kind]);
                    setAdd(true);
                  }}
                >
                  {icons[kind]}
                  <span>
                    <strong>{kinds[kind]}</strong>
                    <small>
                      {
                        {
                          source: "填写 TOS 桶，持续发现并登记",
                          sourcePool: "汇集已登记 CID，供下游领取",
                          stage: "绑定平台批次，输出接入缓冲池",
                          buffer: "规整字段、筛选、离线处理与放行",
                          delivery: "汇总合格 CID，交付和结项留存",
                        }[kind]
                      }
                    </small>
                  </span>
                </button>
              ))}
            </aside>
          )}
          <ReactFlow
            nodes={graphNodes}
            edges={displayEdges.map((e) => ({
              ...e,
              type: "default",
              label: e.label,
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
              },
              style: { stroke: "#7c8b9c", strokeWidth: 1.6 },
            }))}
            nodeTypes={nodeTypes}
            minZoom={0.2}
            maxZoom={1.6}
            defaultViewport={{ x: 32, y: -70, zoom: 0.85 }}
            onInit={(instance) => {
              flow.current = instance;
            }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            deleteKeyCode={null}
            onNodeClick={(_, n) => {
              focus(n.id.startsWith("branch:") ? n.id.slice(7) : n.id);
            }}
            onPaneClick={() => setSelection("")}
            onNodeDragStop={(_, n) =>
              !n.id.startsWith("branch:") &&
              graphEdit({
                type: "move",
                nodeId: n.id,
                x: n.position.x / 1.35,
                y: n.position.y / 1.45,
              })
            }
            onNodesChange={(changes) =>
              setGraphNodes((ns) => applyNodeChanges(changes, ns))
            }
            onConnect={(c) => {
              if (c.source && c.target) {
                const from = s.nodes.find((n) => n.id === c.source),
                  to = s.nodes.find((n) => n.id === c.target);
                const buffer =
                  from?.kind === "stage" && to?.kind === "stage"
                    ? s.edges.find(
                        (e) =>
                          e.source === from.id &&
                          s.nodes.find((n) => n.id === e.target)?.kind ===
                            "buffer",
                      )
                    : null;
                graphEdit({
                  type: "connect",
                  source: buffer?.target || c.source,
                  target: c.target,
                });
              }
            }}
            onEdgeDoubleClick={(_, e) =>
              modal.confirm({
                title: "移除这条交接关系？",
                content: "历史批次和数据记录会保留。",
                onOk: () => {
                  if (!e.id.startsWith("branch-link:"))
                    graphEdit({ type: "disconnect", edgeId: e.id });
                },
              })
            }
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData(
                "application/pmc-node",
              ) as ONode["kind"];
              if (!kind) return;
              const p = flow.current!.screenToFlowPosition({
                x: e.clientX,
                y: e.clientY,
              });
              setAddKind(kind);
              setAddName(kinds[kind]);
              setAddPosition({ x: p.x / 1.35, y: p.y / 1.45 });
              setAdd(true);
            }}
          >
            <Background gap={24} size={1} color="#dce1e8" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                (n.data.node as ONode | undefined)?.kind === "delivery"
                  ? "#cfdfd4"
                  : (n.data.node as ONode | undefined)?.kind === "buffer"
                    ? "#dce7f3"
                    : "#e5e9ee"
              }
              maskColor="rgba(247,249,251,.65)"
            />
          </ReactFlow>
          <div className="o-node-legend">
            <span>
              <DatabaseOutlined aria-hidden="true" />
              资源储备池
            </span>
            <span>
              <InboxOutlined aria-hidden="true" />
              缓冲池
            </span>
            <span>
              <ApartmentOutlined aria-hidden="true" />
              生产工序
            </span>
            <span>
              <BranchesOutlined aria-hidden="true" />
              分支放行
            </span>
            <span>
              <CheckCircleOutlined aria-hidden="true" />
              交付池
            </span>
          </div>
          <div className="o-plane-caption">
            拖动节点 · 从圆点连线 · 双击连线移除 · 数据始终单向流转
          </div>
        </div>
        {selected && (
          <aside className="o-inspector">
            <header>
              <div>
                <span>{kinds[selected.kind]}</span>
                <h3>{selected.label}</h3>
              </div>
              <Button
                type="text"
                aria-label="关闭节点详情"
                icon={<CloseOutlined aria-hidden="true" />}
                onClick={() => setSelection("")}
              />
            </header>
            <Tabs
              size="small"
              activeKey={inspectorTab}
              onChange={setInspectorTab}
              items={[
                { key: "operation", label: "操作" },
                { key: "data", label: `数据 ${selectedRows.length}` },
                { key: "settings", label: "配置" },
              ]}
            />
            <div className="o-inspector-content">
              {inspectorTab === "operation" && (
                <NodeOperations
                  node={selected}
                  s={s}
                  run={run}
                  disabled={readOnly || busy || dirty}
                  onGraphEdit={graphEdit}
                  openExport={openExport}
                  openReturn={openReturn}
                  retain={() => {
                    setRetainCids(allDelivery.map((c) => c.id));
                    setReason("");
                    setRetentionOpen(true);
                  }}
                />
              )}
              {inspectorTab === "data" && (
                <>
                  <p className="o-muted">
                    按原始 rowkey + tos_path 追溯。同源产物的来源字段会保留。
                  </p>
                  <Table
                    size="small"
                    rowKey={rowKey}
                    pagination={{ pageSize: 5, size: "small" }}
                    scroll={{ x: 560 }}
                    dataSource={selectedRows}
                    columns={[
                      { title: "rowkey", dataIndex: "rowkey", width: 120 },
                      { title: "CID", dataIndex: "cid", width: 70 },
                      {
                        title: "状态",
                        width: 110,
                        render: (_, r: ORow) =>
                          isLocked(s, r) ? "离线处理中" : stateNames[r.status],
                      },
                      {
                        title: "原始地址",
                        dataIndex: "tos_path",
                        ellipsis: true,
                        width: 200,
                      },
                      {
                        title: "结果 / 原因",
                        render: (_, r: ORow) =>
                          r.reason || String(r.values.caption || "—"),
                        width: 140,
                      },
                    ]}
                  />
                </>
              )}
              {inspectorTab === "settings" && (
                <NodeSettings
                  key={selected.id + ":" + s.revision}
                  node={selected}
                  s={s}
                  disabled={readOnly}
                  onSave={graphEdit}
                />
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="o-statusbar">
        <span>
          {s.nodes.length} 个节点 · {s.edges.length} 条交接关系
        </span>
        <span>
          {s.exports.filter((e) => e.status === "processing").length}{" "}
          批离线处理中 · {allDelivery.length} 个交付 CID
        </span>
        <span>工序单平台 · 系统建立输出缓冲池 · 禁止循环</span>
      </footer>
      <Modal
        title="添加编排节点"
        open={add}
        onCancel={() => setAdd(false)}
        okText="添加到画布"
        cancelText="取消"
        onOk={() => {
          if (!addName.trim()) {
            message.error("请输入节点名称");
            return;
          }
          graphEdit({
            type: "addNode",
            kind: addKind,
            label: addName,
            platform: addKind === "stage" ? addPlatform : undefined,
            x: addPosition.x,
            y: addPosition.y,
          });
          setAdd(false);
          setPalette(false);
        }}
      >
        <Form layout="vertical">
          <Form.Item label="节点类型">
            <Select
              value={addKind}
              options={Object.entries(kinds).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={setAddKind}
            />
          </Form.Item>
          <Form.Item label="名称" required>
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              maxLength={50}
            />
          </Form.Item>
          {addKind === "stage" && (
            <Form.Item label="生产平台" required>
              <Select
                value={addPlatform}
                onChange={setAddPlatform}
                options={Object.entries(platforms).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          )}
          <p className="o-muted">
            新增工序时，系统会同时建立输出缓冲池。保存后再绑定批次和放行数据。
          </p>
        </Form>
      </Modal>
      <Modal
        title="导出并登记离线处理范围"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        okText="登记范围并下载 CSV"
        cancelText="取消"
        onOk={async () => {
          try {
            const next = transition(s, {
              type: "export",
              cidId: exportCid,
              start,
              end,
            });
            await act({ type: "export", cidId: exportCid, start, end });
            const exp = next.exports.at(-1)!;
            downloadCSV(
              `${exp.id}-${exp.cidId}.csv`,
              exp.snapshot.map(rowValues),
            );
            setExportOpen(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Form layout="vertical">
          <Form.Item label="原 CID">
            <Select
              value={exportCid}
              onChange={(id) => {
                setExportCid(id);
                setStart(1);
                setEnd(s.cids.find((c) => c.id === id)?.rows.length || 1);
              }}
              options={nodeCids(s, selection)
                .filter((c) => c.rows.length)
                .map((c) => ({
                  value: c.id,
                  label: `${c.id} · ${c.rows.length} 条`,
                }))}
            />
          </Form.Item>
          <div className="o-form-pair">
            <Form.Item label="开始位置（含）">
              <InputNumber
                min={1}
                value={start}
                onChange={(v) => setStart(v || 1)}
              />
            </Form.Item>
            <Form.Item label="结束位置（含）">
              <InputNumber
                min={1}
                value={end}
                onChange={(v) => setEnd(v || 1)}
              />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            message={`本次 ${Math.max(0, end - start + 1)} 条；按 CID 数据顺序选取，记录下载时的范围。`}
            description="登记后暂停这批数据向下游放行；新增入池数据可继续处理。回传按原始 rowkey + tos_path 覆盖原 CID 的本次范围。历史范围在节点记录中可查，默认从上次范围后接续新增。"
          />
        </Form>
      </Modal>
      <Modal
        title="回传离线结果 · 覆盖原 CID 的本次范围"
        open={!!returnId}
        width={760}
        onCancel={() => {
          setReturnId("");
          setUploadRows(null);
        }}
        okText="确认覆盖本次范围"
        cancelText="取消"
        okButtonProps={{ disabled: !uploadRows || readOnly }}
        onOk={async () => {
          if (uploadRows)
            try {
              await act({
                type: "return",
                exportId: returnId,
                rows: uploadRows,
              });
              setReturnId("");
              message.success("已覆盖原 CID 本次范围，原版本已留存");
            } catch {}
        }}
      >
        {(() => {
          const exp = s.exports.find((e) => e.id === returnId);
          return (
            <>
              <p>
                <strong>
                  {exp?.id} → {exp?.cidId}
                </strong>{" "}
                · 原导出 {exp?.snapshot.length} 条
                {uploadRows && ` → 回传 ${uploadRows.length} 条`}
              </p>
              <Alert
                type="warning"
                showIcon
                message="原始 rowkey 和 tos_path 必须原样保留"
                description="加工后的素材地址请放在 processed_tos_path。可减少本次数据；未知来源、重复血缘、已领取或已变更的数据会整批拒绝覆盖。"
              />
              <Upload
                accept=".csv"
                maxCount={1}
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    const text = await file.text();
                    const sheet = XLSX.read(text, {
                      type: "string",
                      raw: true,
                    }).Sheets;
                    const rows = XLSX.utils.sheet_to_json<
                      Record<string, unknown>
                    >(sheet[Object.keys(sheet)[0]], { defval: "" });
                    transition(s, { type: "return", exportId: returnId, rows });
                    setUploadRows(rows);
                    setUploadName(file.name);
                    message.success("血缘与范围校验通过，请核对后确认");
                  } catch (e) {
                    setUploadRows(null);
                    message.error((e as Error).message);
                  }
                  return false;
                }}
              >
                <Button
                  icon={<UploadOutlined aria-hidden="true" />}
                  style={{ margin: "16px 0" }}
                >
                  选择回传 CSV
                </Button>
              </Upload>
              {uploadName && <p>{uploadName}</p>}
              {uploadRows && (
                <Table
                  size="small"
                  rowKey={(_, i) => String(i)}
                  dataSource={uploadRows.slice(0, 5)}
                  pagination={false}
                  scroll={{ x: 640 }}
                  columns={Object.keys(uploadRows[0] || {}).map((k) => ({
                    title: k,
                    dataIndex: k,
                    width: 140,
                    ellipsis: true,
                    render: (v: unknown) => String(v ?? ""),
                  }))}
                />
              )}
            </>
          );
        })()}
      </Modal>
      <Modal
        title="发起结项 · 选择交付 CID 留存范围"
        open={retentionOpen}
        onCancel={() => setRetentionOpen(false)}
        okText="提交留存任务"
        cancelText="取消"
        onOk={async () => {
          try {
            await act({ type: "retain", cidIds: retainCids, reason });
            setRetentionOpen(false);
          } catch {}
        }}
      >
        <p>
          仅从交付池选择，CID 身份保持一致。留存任务单独跟踪，不阻断项目结项。
        </p>
        <Space>
          <Button
            size="small"
            onClick={() => setRetainCids(allDelivery.map((c) => c.id))}
          >
            全选
          </Button>
          <Button size="small" onClick={() => setRetainCids([])}>
            全不选
          </Button>
        </Space>
        <div className="o-delivery-cids">
          {allDelivery.map((c) => (
            <Checkbox
              key={c.id}
              checked={retainCids.includes(c.id)}
              onChange={(e) =>
                setRetainCids((v) =>
                  e.target.checked
                    ? [...v, c.id]
                    : v.filter((id) => id !== c.id),
                )
              }
            >
              <strong>{c.id}</strong>
              <span>{c.rows.length} 条</span>
            </Checkbox>
          ))}
        </div>
        {retainCids.length < allDelivery.length && (
          <Form.Item label="未留存 CID 的统一原因" required>
            <Input.TextArea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </Form.Item>
        )}
        <Alert
          type="info"
          message="透传留存：移除项目扩展字段，映射原始地址、结果地址、描述及来源 CID。"
        />
      </Modal>
      <Modal
        title="生产编排操作记录"
        open={historyOpen}
        width={850}
        footer={null}
        onCancel={() => setHistoryOpen(false)}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={[...s.audit].reverse()}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: "时间",
              dataIndex: "at",
              width: 140,
              render: (v) => new Date(v).toLocaleString("zh-CN"),
            },
            { title: "操作", dataIndex: "action", width: 180 },
            { title: "数据范围与结果", dataIndex: "detail" },
          ]}
        />
        {s.history.length > 0 && (
          <p>已保留 {s.history.length} 份离线覆盖前的原 CID 版本。</p>
        )}
      </Modal>
    </div>
  );
}

type OpsProps = {
  node: ONode;
  s: OState;
  run: (a: OAction) => void;
  disabled: boolean;
  onGraphEdit: (a: OAction) => void;
  openExport: (id?: string) => void;
  openReturn: (id: string) => void;
  retain: () => void;
};
function NodeOperations({
  node: n,
  s,
  run,
  disabled,
  onGraphEdit,
  openExport,
  openReturn,
  retain,
}: OpsProps) {
  const [formatOpen, setFormatOpen] = useState(false),
    [template, setTemplate] = useState(
      '{\n  \"video\": \"\",\n  \"text\": \"\"\n}',
    ),
    [templateVersion, setTemplateVersion] = useState("v1"),
    [mapping, setMapping] = useState<Record<string, string>>({
      video: "tos_path",
      text: "caption",
    });
  const [alloc, setAlloc] = useState<Record<string, number>>({}),
    [discardOpen, setDiscardOpen] = useState(false),
    [discardReason, setDiscardReason] = useState("");
  const [quantity, setQuantity] = useState(1),
    [target, setTarget] = useState(""),
    [picked, setPicked] = useState<string[]>([]),
    [bucket, setBucket] = useState(n.bucket || ""),
    [binding, setBinding] = useState(false),
    [batch, setBatch] = useState(n.batchId || ""),
    [queues, setQueues] = useState(
      n.queues || [
        { id: "input-1", name: "标注入口队列", quantity: 0, terminal: true },
      ],
    ),
    [route, setRoute] = useState<"compress" | "human" | "parallel" | "">("");
  const rows = stateRows(s, n.id),
    available = availableRows(s, n.id),
    failed = rows.filter((r) => r.status === "failed" && !isLocked(s, r));
  const targets = s.edges
    .filter((e) => e.source === n.id)
    .map((e) => s.nodes.find((x) => x.id === e.target)!)
    .filter(Boolean);
  const stageTargets = targets.filter((x) => x.kind === "stage"),
    deliveryTargets = targets.filter((x) => x.kind === "delivery");
  const runs = s.runs.filter((r) => r.stageId === n.id),
    waiting = runs.filter((r) => r.status === "queued"),
    reports = runs.filter((r) => r.status === "awaiting-report");
  const cids = nodeCids(s, n.id);
  const exports = s.exports.filter((e) => cids.some((c) => c.id === e.cidId));
  useEffect(() => {
    setBucket(n.bucket || "");
    setTarget("");
    setQuantity(1);
    setPicked([]);
  }, [n.id]);
  const to = s.nodes.find((x) => x.id === (target || stageTargets[0]?.id));
  const selectedFailed = failed.filter(
    (r) => !picked.length || picked.includes(r.rowkey),
  );
  return (
    <div className="o-operations">
      {n.kind === "source" && (
        <>
          <p>
            填写一个 TOS
            桶或目录。开始后持续发现素材，自动登记唯一标识并追加来源 CID。
          </p>
          <label>TOS 桶 / 目录</label>
          <Input
            aria-label="TOS桶地址"
            value={bucket}
            placeholder="tos://bucket/prefix/"
            onChange={(e) => setBucket(e.target.value)}
          />
          <Button
            disabled={disabled || bucket === n.bucket}
            onClick={() =>
              onGraphEdit({
                type: "configure",
                nodeId: n.id,
                patch: { bucket },
              })
            }
          >
            保存地址到编排
          </Button>
          <div className="o-keyvalues">
            <span>接收状态</span>
            <strong>
              {n.paused ? "已暂停" : n.scanCount ? "持续接收中" : "等待开始"}
            </strong>
            <span>已完成扫描</span>
            <strong>{n.scanCount || 0} 次</strong>
          </div>
          <Button
            type="primary"
            icon={<PlayCircleOutlined aria-hidden="true" />}
            disabled={disabled || n.paused}
            onClick={() => run({ type: "scan", sourceId: n.id })}
          >
            {n.scanCount ? "模拟新素材到达" : "开始持续接入"}
          </Button>
          <Button
            disabled={disabled}
            icon={
              n.paused ? (
                <PlayCircleOutlined aria-hidden="true" />
              ) : (
                <PauseOutlined aria-hidden="true" />
              )
            }
            onClick={() =>
              onGraphEdit({
                type: "configure",
                nodeId: n.id,
                patch: { paused: !n.paused },
              })
            }
          >
            {n.paused ? "恢复接收" : "暂停接收"}
          </Button>
          <p className="o-muted">
            本地每次发现 12 条示例素材，含 2 条超大视频。演示自动扫描每 30
            秒追加一次；不会访问真实 TOS。
          </p>
        </>
      )}
      {n.kind === "stage" && (
        <>
          <div className="o-keyvalues">
            <span>绑定平台</span>
            <strong>{platforms[n.platform!]}</strong>
            <span>批次 / 队列</span>
            <strong>{n.batchId || "未绑定"}</strong>
            <span>待生产</span>
            <strong>
              {waiting.reduce((a, r) => a + r.inputs.length, 0)} 条
            </strong>
            <span>待 PM 上报</span>
            <strong>
              {reports.reduce((a, r) => a + r.outputs.length, 0)} 条
            </strong>
          </div>
          <Button
            disabled={disabled}
            onClick={() => {
              setBatch(n.batchId || "");
              setQueues(
                n.queues || [
                  {
                    id: "input-1",
                    name: "人工标注入口",
                    quantity: 0,
                    terminal: true,
                  },
                ],
              );
              setBinding(true);
            }}
          >
            {n.batchId ? "查看 / 调整批次绑定" : "去标注 · 创建并绑定批次"}
          </Button>
          {n.platform === "human" && (
            <Alert
              type="info"
              message="终端队列由 PM 手动上报"
              description="人工平台内的中间流转不计产出；完成标注后仍需确认终端结果，才进入缓冲池。"
            />
          )}
          {n.requiresFormat && !n.formatReady && (
            <Alert
              type="warning"
              message="人工模板尚未转换"
              description="请在上游缓冲池确认队列模板并开启格式转换，再放行本次数据。"
            />
          )}
          <Button
            type="primary"
            disabled={disabled || !waiting.length}
            icon={<PlayCircleOutlined aria-hidden="true" />}
            onClick={() => run({ type: "execute", stageId: n.id })}
          >
            执行本地生产
          </Button>
          {n.platform === "human" && (
            <Button
              disabled={disabled || !reports.length}
              onClick={() => run({ type: "report", stageId: n.id })}
            >
              上报终端队列结果至缓冲池
            </Button>
          )}
          {runs.length > 0 && (
            <div>
              <h4>已绑定的生产记录</h4>
              {[...runs]
                .reverse()
                .slice(0, 6)
                .map((r) => (
                  <div className="o-run" key={r.id}>
                    <strong>{r.id}</strong>
                    <span>
                      {r.inputs.length} 条 → {r.outputs.length} 条
                    </span>
                    <small>
                      {r.batchId} ·{" "}
                      {
                        {
                          queued: "待生产",
                          "awaiting-report": "待 PM 上报",
                          completed: "已进入缓冲池",
                        }[r.status]
                      }
                    </small>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
      {(n.kind === "sourcePool" || n.kind === "buffer") && (
        <>
          <div className="o-quantity-strip">
            <span>
              可放行<b>{available.length}</b>
            </span>
            <span>
              失败待处理
              <b className={failed.length ? "o-failure" : ""}>
                {failed.length}
              </b>
            </span>
            <span>
              已交接<b>{rows.filter((r) => r.status === "consumed").length}</b>
            </span>
          </div>
          <h4>向下游放行</h4>
          {!targets.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="尚未连接下游，先在画布上连接工序"
            />
          ) : (
            <>
              {stageTargets.length > 0 && (
                <>
                  <label>目标工序</label>
                  <Select
                    aria-label="目标工序"
                    value={to?.id}
                    onChange={setTarget}
                    options={stageTargets.map((x) => ({
                      value: x.id,
                      label: x.label,
                    }))}
                  />
                  <label>本次放行数量</label>
                  <InputNumber
                    aria-label="本次放行数量"
                    min={1}
                    precision={0}
                    value={quantity}
                    onChange={(v) => setQuantity(v || 1)}
                  />
                  <p className="o-muted">
                    仅领取未放行且不在离线处理中的数据。历史已放行数据不可撤回。
                  </p>
                  {to?.platform === "human" && (
                    <div className="o-format-action">
                      <p>
                        人工模板：{to.batchId || "待绑定队列"} ·{" "}
                        {to.formatReady
                          ? "已转换，等待 PM 放行"
                          : "等待 PM 开启转换"}
                      </p>
                      <Button
                        disabled={disabled || !to.batchId || to.formatReady}
                        onClick={() => setFormatOpen(true)}
                      >
                        确认模板并开启格式转换
                      </Button>
                    </div>
                  )}
                  {to?.platform === "human" &&
                    to.queues &&
                    to.queues.length > 1 && (
                      <div>
                        <h4>本次各入口队列分配量</h4>
                        {to.queues.map((q) => (
                          <Form.Item key={q.id} label={q.name}>
                            <InputNumber
                              min={0}
                              precision={0}
                              value={alloc[q.id] || 0}
                              onChange={(v) =>
                                setAlloc((old) => ({ ...old, [q.id]: v || 0 }))
                              }
                            />
                          </Form.Item>
                        ))}
                        <p className="o-muted">
                          合计 {Object.values(alloc).reduce((a, v) => a + v, 0)}{" "}
                          / {quantity} 条，须与放行量相等。
                        </p>
                      </div>
                    )}
                  <Button
                    type="primary"
                    disabled={
                      disabled ||
                      !to?.batchId ||
                      !!(to?.requiresFormat && !to.formatReady)
                    }
                    onClick={() =>
                      run({
                        type: "release",
                        fromId: n.id,
                        toId: to!.id,
                        quantity,
                        fields: n.fields,
                        queueAllocations:
                          to?.platform === "human" ? alloc : undefined,
                      })
                    }
                  >
                    确认放行给下游
                  </Button>
                  {!to?.batchId && (
                    <p className="o-muted">
                      先点击目标工序，创建或绑定平台批次。
                    </p>
                  )}
                </>
              )}
              {deliveryTargets.map((d) => (
                <Button
                  key={d.id}
                  disabled={disabled || !available.length}
                  onClick={() =>
                    run({ type: "deliver", fromId: n.id, toId: d.id })
                  }
                >
                  确认交付规则 · 汇入{d.label}
                </Button>
              ))}
            </>
          )}
          {failed.length > 0 && (
            <section className="o-failure-section">
              <h4>失败数据 · 接出新线路</h4>
              <Table
                size="small"
                rowKey="rowkey"
                pagination={false}
                dataSource={failed.slice(0, 12)}
                rowSelection={{
                  selectedRowKeys: picked,
                  onChange: (keys) => setPicked(keys as string[]),
                }}
                columns={[
                  { title: "原始记录", dataIndex: "rowkey", width: 96 },
                  { title: "失败原因", dataIndex: "reason" },
                ]}
              />
              <Space wrap>
                <Button
                  disabled={disabled}
                  onClick={() => setRoute("compress")}
                >
                  视频过大 → 压缩新线路
                </Button>
                <Button disabled={disabled} onClick={() => setRoute("human")}>
                  配置失败 → 人工新线路
                </Button>
              </Space>
              <p className="o-muted">
                {picked.length
                  ? `已选 ${picked.length} 条`
                  : "未勾选时选择本池全部失败数据"}
                。新线路不会回连原工序，原始资源地址保留。
              </p>
              <Button
                danger
                disabled={disabled || !picked.length}
                onClick={() => setDiscardOpen(true)}
              >
                丢弃选中失败数据
              </Button>
              {stageTargets.length > 0 && (
                <Button
                  disabled={disabled || !picked.length}
                  onClick={() =>
                    run({
                      type: "release",
                      fromId: n.id,
                      toId: to!.id,
                      quantity: picked.length,
                      fields: n.fields,
                      rowKeys: picked,
                      includeFailed: true,
                    })
                  }
                >
                  将选中失败范围放行至 {to?.label}
                </Button>
              )}
            </section>
          )}
          {n.kind === "sourcePool" && (
            <section>
              <h4>单线产量不足</h4>
              <p>
                增加独立生产线，从尚未领取的素材开始。每道工序仍只绑定一个平台。
              </p>
              <Button
                disabled={disabled || !available.length}
                icon={<BranchesOutlined aria-hidden="true" />}
                onClick={() => setRoute("parallel")}
              >
                新增并行生产线
              </Button>
            </section>
          )}
          <section>
            <h4>离线处理与回传</h4>
            <Button
              disabled={disabled || !rows.length}
              icon={<DownloadOutlined aria-hidden="true" />}
              onClick={() => openExport()}
            >
              登记并下载处理集合
            </Button>
            {exports.length === 0 && (
              <p className="o-muted">
                导出时冻结范围；回传会覆盖原 CID 的本次集合，期间新增数据保留。
              </p>
            )}
            {[...exports].reverse().map((e) => (
              <div className="o-export-record" key={e.id}>
                <strong>
                  {e.id} · {e.cidId}
                </strong>
                <p>
                  第 {e.start}–{e.end} 条 · {e.snapshot.length} 条
                </p>
                <span>
                  {
                    {
                      processing: "离线处理中",
                      returned: `已回传 ${e.returnedCount} 条`,
                      cancelled: "已取消",
                    }[e.status]
                  }
                </span>
                <Space wrap>
                  <Button
                    size="small"
                    icon={<DownloadOutlined aria-hidden="true" />}
                    onClick={() =>
                      downloadCSV(
                        `${e.id}-${e.cidId}.csv`,
                        e.snapshot.map(rowValues),
                      )
                    }
                  >
                    下载原批次
                  </Button>
                  {e.status === "processing" && (
                    <>
                      <Button
                        size="small"
                        disabled={disabled}
                        onClick={() => openReturn(e.id)}
                      >
                        上传回传
                      </Button>
                      <Button
                        size="small"
                        disabled={disabled}
                        onClick={() =>
                          run({ type: "cancelExport", exportId: e.id })
                        }
                      >
                        取消处理
                      </Button>
                    </>
                  )}
                </Space>
              </div>
            ))}
          </section>
        </>
      )}
      {n.kind === "delivery" && (
        <>
          <p>
            汇集各线路满足交付规则的 CID，按项目内原始血缘去重。CID
            身份保留到留存选择。
          </p>
          <div className="o-delivery-cids">
            {cids
              .filter((c) => c.rows.length)
              .map((c) => (
                <div key={c.id}>
                  <strong>{c.id}</strong>
                  <span>{c.rows.length} 条</span>
                  <small>{c.label}</small>
                </div>
              ))}
          </div>
          {!rows.length && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="等待结果缓冲池确认汇入"
            />
          )}
          <Button
            type="primary"
            disabled={disabled || !rows.length || !!s.retention.length}
            onClick={retain}
          >
            发起结项 · 选择留存 CID
          </Button>
          {s.retention.map((t) => (
            <Alert
              key={t.id}
              type="success"
              message={`留存任务 ${t.id} 已排队`}
              description={`选中 ${t.cidIds.join("、") || "无"}；未留存 ${t.omittedCidIds.join("、") || "无"}。${t.reason} 任务独立跟踪，不改变当前项目结项状态。`}
            />
          ))}
        </>
      )}
      <Modal
        title="丢弃选中失败数据"
        open={discardOpen}
        onCancel={() => setDiscardOpen(false)}
        okText="确认丢弃"
        cancelText="取消"
        onOk={() => {
          run({
            type: "discard",
            nodeId: n.id,
            rowKeys: picked,
            reason: discardReason,
          });
          setDiscardOpen(false);
        }}
      >
        <p>本次 {picked.length} 条数据将停止向下游流转，历史血缘和原因保留。</p>
        <Input.TextArea
          value={discardReason}
          onChange={(e) => setDiscardReason(e.target.value)}
          placeholder="填写丢弃原因"
        />
      </Modal>
      <Modal
        title="人工标注模板 · 字段映射与转换"
        open={formatOpen}
        onCancel={() => setFormatOpen(false)}
        okText="校验并执行本地转换"
        cancelText="取消"
        onOk={() => {
          if (!to) return;
          try {
            transition(s, {
              type: "format",
              fromId: n.id,
              toId: to.id,
              template,
              version: templateVersion,
              mapping,
            });
            run({
              type: "format",
              fromId: n.id,
              toId: to.id,
              template,
              version: templateVersion,
              mapping,
            });
            setFormatOpen(false);
          } catch (e) {
            Modal.error({
              title: "格式转换未完成",
              content: (e as Error).message,
            });
          }
        }}
      >
        <p>
          上游：{n.label} → 下游：{to?.label}
          。先确认模板和来源字段；转换成功后仍需 PM 放行。
        </p>
        <Form layout="vertical">
          <Form.Item label="队列模板版本" required>
            <Input
              value={templateVersion}
              onChange={(e) => setTemplateVersion(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="目标 JSON 样例" required>
            <Input.TextArea
              rows={5}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </Form.Item>
          {(() => {
            try {
              return Object.keys(JSON.parse(template)).map((f) => (
                <Form.Item key={f} label={`${f} ← 来源字段`}>
                  <Select
                    value={mapping[f]}
                    onChange={(v) => setMapping((old) => ({ ...old, [f]: v }))}
                    options={fieldOptions(rows).map((k) => ({
                      value: k,
                      label: k,
                    }))}
                  />
                </Form.Item>
              ));
            } catch {
              return <Alert type="error" message="请先输入有效 JSON 对象" />;
            }
          })()}
        </Form>
        <p className="o-muted">
          本地按字段映射模拟转换，真实 AI 转换服务待对接。
        </p>
      </Modal>
      <Modal
        title="去标注 · 创建或绑定平台生产批次"
        open={binding}
        onCancel={() => setBinding(false)}
        okText="确认绑定"
        cancelText="取消"
        onOk={() => {
          run({
            type: "bind",
            stageId: n.id,
            batchId: batch,
            queues: n.platform === "human" ? queues : undefined,
          });
          setBinding(false);
        }}
      >
        <p>平台：{platforms[n.platform!]}</p>
        <Form layout="vertical">
          <Form.Item label="平台已有批次 / 执行器 ID（留空则新建演示批次）">
            <Input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="输入现有 ID，或留空新建"
            />
          </Form.Item>
          {n.platform === "human" && (
            <>
              <p>入口队列按条数手动分配，必须指定终端输出队列。</p>
              {queues.map((q, i) => (
                <div className="o-queue-edit" key={i}>
                  <Input
                    aria-label={`队列${i + 1}名称`}
                    value={q.name}
                    onChange={(e) =>
                      setQueues((v) =>
                        v.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <InputNumber
                    aria-label={`队列${i + 1}分配量`}
                    min={0}
                    precision={0}
                    value={q.quantity}
                    onChange={(v) =>
                      setQueues((old) =>
                        old.map((x, j) =>
                          j === i ? { ...x, quantity: v || 0 } : x,
                        ),
                      )
                    }
                  />
                  <Checkbox
                    checked={q.terminal}
                    onChange={(e) =>
                      setQueues((v) =>
                        v.map((x, j) =>
                          j === i ? { ...x, terminal: e.target.checked } : x,
                        ),
                      )
                    }
                  >
                    终端
                  </Checkbox>
                </div>
              ))}
              <Button
                onClick={() =>
                  setQueues((v) => [
                    ...v,
                    {
                      id: `input-${v.length + 1}`,
                      name: `入口队列 ${v.length + 1}`,
                      quantity: 0,
                      terminal: false,
                    },
                  ])
                }
              >
                添加入口队列
              </Button>
            </>
          )}
        </Form>
        <p className="o-muted">
          本地演示创建并保存关联，不调用真实平台。后续放行、产出均关联此批次。
        </p>
      </Modal>
      <Modal
        title={
          {
            compress: "为视频过大数据建立压缩新线路",
            human: "为 Agent 失败数据建立人工新线路",
            parallel: "增加一条独立生产线",
          }[route || "parallel"]
        }
        open={!!route}
        onCancel={() => setRoute("")}
        okText="创建新线路"
        cancelText="取消"
        onOk={() => {
          run({
            type: "reroute",
            fromId: n.id,
            mode: route as any,
            rowKeys: picked.length ? picked : undefined,
          });
          setRoute("");
        }}
      >
        <p>
          {route === "parallel"
            ? `来源池还有 ${available.length} 条未领取素材，可按数量放行给新生产线。`
            : `本次选择 ${selectedFailed.length} 条失败数据。原工序和历史产物保留，数据沿新线路向前处理。`}
        </p>
        <p>
          {route === "compress"
            ? "压缩工序 → 新缓冲池 → 新机器预标注工序 → Agent；加工后地址记录在新字段，原始 tos_path 不变。"
            : route === "human"
              ? "新人工标注工序 → 新缓冲池 → 交付池。绑定队列后，将选中失败数据放行给新工序。"
              : "新机器预标注工序 → 新缓冲池 → Agent。新工序需要单独绑定批次。"}
        </p>
      </Modal>
    </div>
  );
}

function NodeSettings({
  node: n,
  s,
  disabled,
  onSave,
}: {
  node: ONode;
  s: OState;
  disabled: boolean;
  onSave: (a: OAction) => void;
}) {
  const [label, setLabel] = useState(n.label),
    [fields, setFields] = useState(
      n.fields || ["rowkey", "tos_path", "caption"],
    ),
    [filterField, setFilterField] = useState(n.filter?.field || ""),
    [op, setOp] = useState(n.filter?.op || "eq"),
    [value, setValue] = useState(String(n.filter?.value ?? ""));
  const options = fieldOptions(stateRows(s, n.id));
  const cids = nodeCids(s, n.id);
  return (
    <Form
      layout="vertical"
      onFinish={() =>
        onSave({
          type: "configure",
          nodeId: n.id,
          patch: {
            label,
            fields,
            filter: filterField ? { field: filterField, op, value } : undefined,
          },
        })
      }
    >
      <Form.Item label="节点名称" required>
        <Input
          value={label}
          disabled={disabled}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Form.Item>
      {(n.kind === "sourcePool" || n.kind === "buffer") && (
        <>
          <h4>CID 合并与字段选择</h4>
          <p className="o-muted">
            {cids.map((c) => c.id).join(" + ") || "本池 CID"}{" "}
            按记录汇成宽表。为下游勾选需要的字段，不改写来源表，也不把两条记录拼成一条。
          </p>
          <Checkbox.Group
            className="o-field-grid"
            value={fields}
            options={options.map((f) => ({
              label: f,
              value: f,
              disabled: f === "rowkey" || f === "tos_path" || disabled,
            }))}
            onChange={(v) => setFields(v as string[])}
          />
          <p className="o-muted">
            原始 rowkey、tos_path 始终保留。复杂转换通过离线处理，人工模板转换由
            PM 确认。
          </p>
          <Form.Item label="准入筛选字段（可选）">
            <Select
              allowClear
              value={filterField || undefined}
              onChange={(v) => setFilterField(v || "")}
              options={options.map((f) => ({ value: f, label: f }))}
            />
          </Form.Item>
          {filterField && (
            <div className="o-form-pair">
              <Select
                value={op}
                onChange={setOp}
                options={[
                  ["eq", "等于"],
                  ["ne", "不等于"],
                  ["gt", "大于"],
                  ["gte", "不小于"],
                  ["lt", "小于"],
                  ["lte", "不大于"],
                  ["contains", "包含"],
                ].map(([value, label]) => ({ value, label }))}
              />
              <Input
                aria-label="准入筛选值"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </>
      )}
      <Button htmlType="submit" disabled={disabled} type="primary">
        保存配置到草稿
      </Button>
      <p className="o-muted">编辑后点击画布上的“保存编排”，再执行数据操作。</p>
      <Button
        danger
        icon={<DeleteOutlined aria-hidden="true" />}
        disabled={disabled}
        onClick={() => onSave({ type: "removeNode", nodeId: n.id })}
      >
        删除空节点
      </Button>
    </Form>
  );
}
