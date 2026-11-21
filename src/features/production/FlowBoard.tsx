import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  AimOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DownOutlined,
  ExpandOutlined,
  FolderOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  ReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Background,
  Controls,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
  applyNodeChanges,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePMC } from "../../api";
import {
  latest,
  platforms,
  money,
  processUnitCapacity,
  type Chain,
  type ProductionNode,
  type ProductionVersion,
  type ProductionData,
} from "../../../shared/production";
import {
  flowQuantity,
  pipeRows,
  processUnitPullAllowance,
  outputFields,
  unallocatedQuantity,
  claimedQuantity,
  validateFlowTopology,
  type FlowRule,
} from "../../../shared/pull-flow";
import { day } from "../../../shared/types";
import {
  nodeMeasure,
  quantity,
  type ExperienceSignal,
} from "./experience-model";
import { DataCapabilitiesPrototype } from "./DataCapabilitiesPrototype";
import { CanvasSummary, CanvasLedger, CanvasLineage } from "./CanvasInformation";
import "./canvas-workbench.css";
export type BoardSelection = {
  type: "node" | "edge" | "unit" | "group" | "signals";
  id: string;
};
type Props = {
  businessId: string;
  previewData?: ProductionData;
  chain: Chain;
  version: ProductionVersion;
  disabled: boolean;
  operational: boolean;
  dirty: boolean;
  onChange: (v: ProductionVersion) => void;
  selection: BoardSelection | null;
  onSelect: (s: BoardSelection | null) => void;
  signals: ExperienceSignal[];
  onIssue: (s: ExperienceSignal) => void;
};
const icons: Record<string, React.ReactNode> = {
  RESOURCE: <DatabaseOutlined />,
  COLLECTION: <FolderOutlined />,
  MACHINE_LABELING: <RobotOutlined />,
  AGENT_LABELING: <RobotOutlined />,
  MANUAL_LABELING: <TeamOutlined />,
  FLOW: <NodeIndexOutlined />,
};
const ops = {
  eq: "等于",
  ne: "不等于",
  gt: "大于",
  gte: "不小于",
  lt: "小于",
  lte: "不大于",
  contains: "包含",
};
function CanvasNode({ data, selected }: any) {
  const [dismissed, setDismissed] = useState(false),
    [hoverOpen, setHoverOpen] = useState(false);
  const tooltipId = React.useId();
  useEffect(() => {
    if (selected) setHoverOpen(false);
  }, [selected]);
  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent).detail !== tooltipId) setHoverOpen(false);
    };
    document.addEventListener("pmc:node-preview", closeOther);
    return () => document.removeEventListener("pmc:node-preview", closeOther);
  }, [tooltipId]);
  useEffect(() => {
    if (!hoverOpen || selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDismissed(true);
        setHoverOpen(false);
      }
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [hoverOpen, selected]);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Tooltip
        title={data.preview}
        open={selected || dismissed ? false : hoverOpen}
        onOpenChange={(open) => {
          if (open)
            document.dispatchEvent(
              new CustomEvent("pmc:node-preview", { detail: tooltipId }),
            );
          setHoverOpen(open);
        }}
        color="#fff"
        placement="bottom"
        trigger={["hover"]}
        overlayClassName="experience-node-tooltip"
      >
        <div
          className={`experience-node ${data.risk ? "has-risk" : ""}`}
          tabIndex={0}
          onMouseEnter={() => setDismissed(false)}
          onFocus={() => {
            if (!selected) {
              document.dispatchEvent(
                new CustomEvent("pmc:node-preview", { detail: tooltipId }),
              );
              setDismissed(false);
              setHoverOpen(true);
            }
          }}
          onBlur={() => setHoverOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDismissed(true);
          }}
        >
          <div className="experience-node-type">
            <span>
              {icons[data.platform] || <DatabaseOutlined />} {data.kind}
            </span>
            {data.risk && <WarningOutlined />}
          </div>
          <strong>{data.title}</strong>
          <div className="canvas-node-reference" title={data.reference}>{data.reference}</div>
          <div className="canvas-node-numbers">
            <div><span>{data.inputLabel}</span><b>{data.inputText}</b></div>
            <ArrowRightOutlined />
            <div><span>{data.label}</span><b>{data.known ? quantity(data.output) : "待回传"}<small>{data.unit}</small></b></div>
          </div>
          <div className="canvas-node-facts"><span>{data.isPool ? "未被领取" : "计划日产"}<b>{quantity(data.isPool ? data.remaining : data.dailyPlan)}<small>{data.unit}{data.isPool ? "" : "/天"}</small></b></span><span>{data.isPool ? "已领取" : "已登记成本"}<b>{data.isPool ? quantity(data.claimed) : money(data.cost)}</b></span></div>
          <div className={`canvas-node-status ${data.risk ? "is-warning" : ""}`}><span>{data.risk ? <WarningOutlined /> : <CheckCircleOutlined />}{data.statusText}</span><small>{data.lastAt ? data.lastAt.slice(5,16).replace("T", " ") : "等待数据"}</small></div>
        </div>
      </Tooltip>
      <div className="canvas-node-actions nodrag nopan" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseEnter={() => {setDismissed(true);setHoverOpen(false);}}>
        <button onClick={e => {e.stopPropagation();data.onInspect();}}>{data.isDelivery ? "交付候选" : data.isPool ? "查看池与规则" : "平台与执行范围"}<ArrowRightOutlined /></button>
        <button aria-label={`${data.title}数据追溯`} onClick={e => {e.stopPropagation();data.onData();}}>数据</button>
        {data.onCapability && <button aria-label={`${data.title}数据处理`} onClick={e => {e.stopPropagation();data.onCapability(data.isSource ? "sources" : "adapt");}}>处理</button>}
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
function AdaptationEdge(props: any) {
  const [path, x, y] = getSmoothStepPath(props);
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <button
          className="dc-canvas-adapt nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            props.data.onAdapt();
          }}
        >
          <span className={props.data.open ? "canvas-edge-dot" : "canvas-edge-dot is-closed"} />
          <span>{props.data.label}</span><small>可取 {quantity(props.data.quantity)}</small>
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
const capabilityEdgeTypes = { adaptation: AdaptationEdge };
function AnnotationNode({ data, selected }: any) {
  return (
    <>
      <NodeResizer
        isVisible={selected && !data.disabled}
        minWidth={180}
        minHeight={130}
        onResizeEnd={(_, p) => data.onResize(p)}
      />
      <div className="experience-annotation-label">
        <FolderOutlined /> {data.name}
        <small>{data.note}</small>
      </div>
    </>
  );
}
function UnitNode({ data }: any) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="experience-unit-node">
        <div>
          <TeamOutlined /> 生产环节 · {data.count} 个步骤
        </div>
        <strong>{data.name}</strong>
        <b>
          {quantity(data.capacity)} <small>{data.unit} / 天</small>
        </b>
        <span>
          {data.bottleneck ? "短板：" + data.bottleneck : "产能待补充"}
        </span>
        <button className="nodrag" onClick={data.expand}>
          展开内部步骤 <DownOutlined />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
const nodeTypes = {
  production: CanvasNode,
  annotation: AnnotationNode,
  unit: UnitNode,
};
export function FlowBoard({
  businessId,
  previewData,
  chain,
  version: v,
  disabled,
  operational,
  dirty,
  onChange,
  selection,
  onSelect: selectObject,
  signals,
  onIssue,
}: Props) {
  const { state, command, busy } = usePMC(),
    { message, modal } = App.useApp();
  const p = previewData || state.production[businessId],
    b = state.businesses.find((x) => x.id === businessId)!;
  const [inspectorTab, setInspectorTab] = useState("runtime");
  const [capabilityPanels, setCapabilityPanels] = useState<Record<string, {section: string; source: string; target: string}>>({});
  const onSelect = (next: BoardSelection | null) => {
    selectObject(next);
    setInspectorTab("runtime");
  };
  const setCapabilityOpen = (open: boolean) => setInspectorTab(open ? "processing" : "runtime");
  const [capability, setCapability] = useState<{
    section: string;
    source: string;
    target: string;
    key: string;
  } | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null),
    [nodes, setNodes] = useState<Node[]>([]),
    [collapsed, setCollapsed] = useState<string[]>(previewData ? (v.processUnits || []).map(u => u.id) : []),
    [focusOnly, setFocusOnly] = useState(false),
    [showRetired, setShowRetired] = useState(false);
  const [dialog, setDialog] = useState(""),
    [newPlatform, setNewPlatform] = useState("RESOURCE"),
    [name, setName] = useState(""),
    [unitNodes, setUnitNodes] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false),
    [drawBox, setDrawBox] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null),
    boardRef = useRef<HTMLDivElement>(null),
    requestId = useRef(crypto.randomUUID());
  const [pendingRect, setPendingRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [pullCount, setPullCount] = useState(1),
    [externalId, setExternalId] = useState(""),
    [externalQuantity, setExternalQuantity] = useState(1),
    [externalCost, setExternalCost] = useState<number | null>(null),
    [externalReceipt, setExternalReceipt] = useState<string>(),
    [externalFields, setExternalFields] = useState<
      Record<string, string | number | boolean>
    >({ 合格: true, 分数: 90, 描述: "平台合格输出" });
  const [disposition, setDisposition] = useState<{
      resultId: string;
      action: "discard" | "recover";
    } | null>(null),
    [dispositionCount, setDispositionCount] = useState(1),
    [reason, setReason] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false),
    [feedbackName, setFeedbackName] = useState("客户反馈"),
    [feedbackCount, setFeedbackCount] = useState(0),
    [feedbackText, setFeedbackText] = useState("");
  const [depositRow, setDepositRow] = useState<string | null>(null),
    [libraryRef, setLibraryRef] = useState("");
  const [search, setSearch] = useState(""),
    [showAllSignals, setShowAllSignals] = useState(false);
  const target =
    selection?.type === "node"
      ? v.nodes.find((n) => n.id === selection.id)
      : undefined;
  const edge =
    selection?.type === "edge"
      ? v.edges.find((e) => `${e.from}:${e.to}` === selection.id)
      : undefined;
  const group =
    selection?.type === "group"
      ? v.annotationGroups?.find((g) => g.id === selection.id)
      : undefined;
  const unit =
    selection?.type === "unit"
      ? v.processUnits?.find((u) => u.id === selection.id)
      : undefined;
  const allowance = edge
    ? processUnitPullAllowance(p, chain.id, v, edge.to)
    : null;
  const stats = edge ? pipeRows(p, chain.id, v, edge.from, edge.to) : null;
  const receipts = (p.pullReceipts || []).filter(
    (r) => r.chainId === chain.id && r.to === target?.id,
  );
  const marker = target ? `PMC:${businessId}:${chain.id}:${target.id}` : "";
  const patch = (next: ProductionVersion) => {
    try {
      validateFlowTopology(next);
      onChange(next);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const changeNode = (value: Partial<ProductionNode>) =>
    target &&
    patch({
      ...v,
      nodes: v.nodes.map((n) => (n.id === target.id ? { ...n, ...value } : n)),
    });
  const changeEdge = (value: any) =>
    edge &&
    patch({
      ...v,
      edges: v.edges.map((e) => (e === edge ? { ...e, ...value } : e)),
    });
  const run = async (action: string, extra: any = {}) => {
    if (previewData) { message.info("方案示例不写入项目。请切换到当前链路执行真实登记。"); throw new Error("示例仅预览"); }
    return command(`production.flow.${action}`, {
      businessId,
      chainId: chain.id,
      versionId: v.id,
      ...extra,
    });
  };
  const perform = async (fn: () => Promise<any>) => {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  };
  const rawNodeId = (id: string) =>
    id.startsWith("unit:")
      ? v.processUnits?.find((u) => u.id === id.slice(5))?.nodeIds[0]
      : id;
  const nodePreview = (n: ProductionNode) => {
    const m = nodeMeasure(p, chain.id, v, n.id),
      input = v.edges.some((e) => e.to === n.id) ? m.input : null;
    const sameUnit = (n.inputUnit || n.flowUnit) === n.flowUnit;
    const todayOutput = flowQuantity(
      (n.flowResults || []).filter((r) => r.date === day()),
    );
    const dailyOutputPlan =
      v.processUnits
        ?.flatMap((u) => u.steps)
        .find((step) => step.nodeId === n.id)?.dailyCapacity ?? n.dailyPlan;
    return (
      <div className="experience-preview">
        <h4>基础信息</h4>
        <dl>
          <dt>节点名称</dt>
          <dd>{n.title}</dd>
          <dt>所属生产平台</dt>
          <dd>
            {n.kind === "router" ? "池与流转判断" : platforms[n.platform]}
          </dd>
          <dt>来自</dt>
          <dd>
            {v.edges
              .filter((e) => e.to === n.id)
              .map((e) => v.nodes.find((n) => n.id === e.from)?.title)
              .join("、") || "无（输入源头）"}
          </dd>
          <dt>流向</dt>
          <dd>
            {v.edges
              .filter((e) => e.from === n.id)
              .map((e) => v.nodes.find((n) => n.id === e.to)?.title)
              .join("、") || (n.id === v.output ? "交付候选" : "暂时留存")}
          </dd>
        </dl>
        <h4>数据信息</h4>
        <div className="experience-preview-values">
          <div>
            <span>输入</span>
            <b>{input == null ? "源头" : quantity(input)}</b>
          </div>
          <div>
            <span>{n.kind === "router" ? "已归拢" : "已输出"}</span>
            <b>{quantity(m.output)}</b>
          </div>
        </div>
        <div className="experience-preview-rate">
          <span>平台转化率</span>
          <b>
            {n.kind === "router" || input == null
              ? "不适用"
              : input > 0 && sameUnit
                ? ((m.output / input) * 100).toFixed(1) + "%"
                : "待核对"}
          </b>
        </div>
        <h4>编排已选范围</h4>
        <dl>
          <dt>累计产出</dt>
          <dd>
            <b>
              {quantity(m.output)} {n.flowUnit}
            </b>
          </dd>
          <dt>实际成本</dt>
          <dd>
            <b>{n.kind === "router" ? "不重复计入" : money(m.cost)}</b>
          </dd>
          <dt>今日产出 / 日计划</dt>
          <dd>
            {quantity(todayOutput)} /{" "}
            {dailyOutputPlan == null ? "未设置" : quantity(dailyOutputPlan)}
          </dd>
        </dl>
      </div>
    );
  };
  const rendered = useMemo(() => {
    const collapsedUnits = (v.processUnits || []).filter((u) =>
      collapsed.includes(u.id),
    );
    const hidden = new Set(collapsedUnits.flatMap((u) => u.nodeIds));
    const cards: Node[] = v.nodes
      .filter((n) => !hidden.has(n.id) && (showRetired || !n.retiredAt))
      .map((n) => {
        const m = nodeMeasure(p, chain.id, v, n.id),
          r = signals.some((s) => s.nodeId === n.id && s.kind !== "data");
        return {
          id: n.id,
          type: "production",
          position: n.position,
          selected: selection?.type === "node" && selection.id === n.id,
          className: `experience-flow-card platform-${n.platform.toLowerCase()} ${n.kind === "router" ? "is-pool" : ""} ${n.id === v.output ? "is-delivery" : ""} ${n.retiredAt ? "is-retired" : ""} ${focusOnly && !signals.some((s) => s.nodeId === n.id) ? "is-dimmed" : ""}`,
          style: { width: 280 },
          data: {
            title: n.title,
            reference: n.kind === "router" ? (n.note || `${v.edges.filter(e => e.to === n.id).length} 个来路 · ${n.routingMode === "ratio" ? "持续比例分配" : n.routingMode === "condition" ? "按条件分配" : "按需领取"}`) : n.platformRef || "待关联平台项目 / 执行范围",
            inputLabel: n.kind === "router" ? "已归拢" : "投入",
            inputText: v.edges.some(e => e.to === n.id) ? (m.known ? quantity(m.input) : "待回传") : "源头",
            known: m.known,
            remaining: m.remaining,
            claimed: m.claimed,
            cost: m.cost,
            lastAt: m.lastAt,
            dailyPlan: n.dailyPlan,
            isDelivery: n.id === v.output,
            isSource: !v.edges.some(e => e.to === n.id),
            statusText: n.retiredAt ? "已退场 · 保留历史" : r ? (signals.find(s => s.nodeId === n.id && s.kind !== "data")?.title || "需要核对") : n.id === v.output ? "候选与正式交付分开登记" : n.kind === "router" ? "留存与领取分别记账" : m.known ? "已有登记 · 查看范围" : "尚无平台产出",
            onInspect: () => onSelect({ type: "node", id: n.id }),
            onData: () => {onSelect({ type: "node", id: n.id });setInspectorTab("data");},
            platform: n.platform,
            kind:
              n.id === v.output
                ? "交付候选池"
                : n.kind === "router"
                  ? n.routingMode === "ratio"
                    ? "比例分配池"
                    : n.routingMode === "condition"
                      ? "条件分流池"
                      : "共享缓冲池"
                  : platforms[n.platform],
            output: m.output,
            unit: n.flowUnit,
            label: n.kind === "router" ? "已归拢" : "已输出",
            risk: r,
            preview: nodePreview(n),
            isPool: n.kind === "router" || n.platform === "RESOURCE",
            onCapability: (section: string) => {
              onSelect({ type: "node", id: n.id });
              setCapabilityOpen(true);
              setCapability({
                section,
                source: n.title,
                target:
                  v.nodes.find(
                    (target) =>
                      v.edges.some(
                        (edge) => edge.from === n.id && edge.to === target.id,
                      ) && target.platform === "MANUAL_LABELING",
                  )?.title || "待选择目标标注环节",
                key: n.id,
              });
            },
          },
        };
      });
    const annotations: Node[] = (v.annotationGroups || []).map((g) => ({
      id: `annotation:${g.id}`,
      type: "annotation",
      position: g.position,
      selected: selection?.type === "group" && selection.id === g.id,
      draggable: !disabled,
      connectable: false,
      zIndex: -2,
      style: { width: g.width, height: g.height },
      className: "experience-annotation",
      data: {
        ...g,
        disabled,
        onResize: (r: any) =>
          patch({
            ...v,
            annotationGroups: v.annotationGroups?.map((a) =>
              a.id === g.id
                ? {
                    ...a,
                    position: { x: r.x, y: r.y },
                    width: r.width,
                    height: r.height,
                  }
                : a,
            ),
          }),
      },
    }));
    const unitCards: Node[] = collapsedUnits.map((u) => {
      const members = v.nodes.filter((n) => u.nodeIds.includes(n.id)),
        c = processUnitCapacity(u);
      return {
        id: `unit:${u.id}`,
        type: "unit",
        position: {
          x: Math.min(...members.map((n) => n.position.x)),
          y: Math.min(...members.map((n) => n.position.y)),
        },
        draggable: false,
        style: { width: 260 },
        selected: selection?.type === "unit" && selection.id === u.id,
        data: {
          name: u.name,
          count: u.nodeIds.length,
          capacity: c.dailyOutput,
          unit: u.outputUnit,
          bottleneck: v.nodes.find((n) => n.id === c.bottleneckNodeId)?.title,
          expand: () => setCollapsed((a) => a.filter((id) => id !== u.id)),
        },
      };
    });
    return [...annotations, ...cards, ...unitCards];
  }, [
    v,
    p,
    chain.id,
    collapsed,
    selection,
    signals,
    focusOnly,
    disabled,
    showRetired,
  ]);
  useEffect(() => setNodes(rendered), [rendered]);
  const nodeMap = (id: string) => {
    const u = v.processUnits?.find(
      (u) => collapsed.includes(u.id) && u.nodeIds.includes(id),
    );
    return u ? `unit:${u.id}` : id;
  };
  const renderedEdges = v.edges
    .filter(
      (e) =>
        nodeMap(e.from) !== nodeMap(e.to) &&
        (showRetired ||
          (!v.nodes.find((n) => n.id === e.from)?.retiredAt &&
            !v.nodes.find((n) => n.id === e.to)?.retiredAt)),
    )
    .map((e) => {
      const s = pipeRows(p, chain.id, v, e.from, e.to),
        selected =
          selection?.type === "edge" && selection.id === `${e.from}:${e.to}`;
      return {
        id: `${e.from}:${e.to}`,
        source: nodeMap(e.from),
        target: nodeMap(e.to),
        selected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: s.open ? "#9aafbf" : "#c4ccd3",
        },
        type: "adaptation",
        data: {
          open: s.open,
          label: !s.open ? "已关闭新取数" : v.nodes.find(n => n.id === e.to)?.platform === "MANUAL_LABELING" ? "标注格式适配" : e.rules?.length ? `${e.rules.length} 项准入条件` : "按需领取",
          quantity: s.availableQuantity,
          onAdapt: () => {
            onSelect({ type: "edge", id: `${e.from}:${e.to}` });
            if (v.nodes.find(n => n.id === e.to)?.platform === "MANUAL_LABELING") setCapabilityOpen(true);
            setCapability({
              section: "adapt",
              source: v.nodes.find((n) => n.id === e.from)?.title || e.from,
              target: v.nodes.find((n) => n.id === e.to)?.title || e.to,
              key: `${e.from}:${e.to}`,
            });
          },
        },
        style: {
          stroke: selected ? "#286b8d" : s.open ? "#a2b5c3" : "#c9d0d7",
          strokeWidth: selected ? 2.4 : 1.5,
          strokeDasharray: s.open ? undefined : "5 4",
        },
        label: selected
          ? `可取 ${quantity(s.availableQuantity)}`
          : !s.open
            ? "已关闭"
            : undefined,
        labelStyle: { fontSize: 12, fill: "#476579" },
        interactionWidth: 24,
      };
    });
  useEffect(() => {
    if (!flow || !selection) return;
    const id =
      selection.type === "node"
        ? nodeMap(selection.id)
        : selection.type === "unit"
          ? `unit:${selection.id}`
          : null;
    if (!id) return;
    // Wait for the fixed inspector to take its width, then frame the node in the remaining canvas.
    const timer = window.setTimeout(() => {
      const node = flow.getNode(id);
      if (node)
        flow.setCenter(
          node.position.x + (node.measured?.width || 240) / 2,
          node.position.y + (node.measured?.height || 120) / 2,
          {
            zoom: Math.min(
              0.85,
              Math.max(0.45, (boardRef.current?.clientWidth || 500) / 650),
            ),
            duration: 200,
          },
        );
    }, 260);
    return () => window.clearTimeout(timer);
  }, [selection?.id, selection?.type, flow]);
  useEffect(() => {
    if (flow) {
      const t = setTimeout(
        () => flow.fitView({ padding: 0.15, maxZoom: 0.9 }),
        150,
      );
      return () => clearTimeout(t);
    }
  }, [chain.id, v.id, flow, collapsed.length]);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
    setPullCount(1);
    setSearch("");
  }, [selection?.id]);
  const addNode = () => {
    const id = crypto.randomUUID(),
      router = newPlatform === "FLOW";
    const anchor = target || v.nodes.at(-1);
    const pos = anchor
      ? { x: anchor.position.x + 400, y: anchor.position.y }
      : { x: 40, y: 180 };
    // Place beside the current object in graph coordinates, independent of camera movement.
    while (
      v.nodes.some(
        (n) =>
          Math.abs(n.position.x - pos.x) < 330 &&
          Math.abs(n.position.y - pos.y) < 290,
      )
    )
      pos.y += 340;
    const n: ProductionNode = {
      id,
      title: name.trim() || (router ? "共享缓冲池" : platforms[newPlatform]),
      platform: newPlatform,
      kind: router ? "router" : "platform",
      routingMode: router ? "demand" : undefined,
      platformRef: "",
      flowUnit: b.unit,
      inputUnit: b.unit,
      resultFields: router
        ? []
        : [
            { key: "合格", type: "boolean" },
            { key: "分数", type: "number" },
            { key: "描述", type: "text" },
          ],
      requiredFields: [],
      flowResults: [],
      note: "",
      taskId: "",
      selected: [],
      dailyPlan: null,
      position: pos,
      reports: [],
      reportHistory: [],
      corrections: {},
      batches: [],
      finalConfirmed: false,
      scopeVersion: 0,
    };
    patch({ ...v, nodes: [...v.nodes, n] });
    onSelect({ type: "node", id });
    setDialog("");
  };
  const finishRect = (e: React.PointerEvent) => {
    if (!origin.current || !flow) return;
    const a = flow.screenToFlowPosition(origin.current),
      z = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    origin.current = null;
    setDrawing(false);
    setDrawBox(null);
    if (Math.abs(z.x - a.x) < 100 || Math.abs(z.y - a.y) < 80) {
      message.info("请拖出一个能容纳节点的范围");
      return;
    }
    setPendingRect({
      x: Math.min(a.x, z.x),
      y: Math.min(a.y, z.y),
      width: Math.abs(z.x - a.x),
      height: Math.abs(z.y - a.y),
    });
    setName("");
    setDialog("annotation");
  };
  const createAnnotation = () => {
    if (!pendingRect) return;
    const id = crypto.randomUUID(),
      r = pendingRect;
    patch({
      ...v,
      annotationGroups: [
        ...(v.annotationGroups || []),
        {
          id,
          name: name.trim() || "范围备注",
          nodeIds: v.nodes
            .filter(
              (n) =>
                n.position.x >= r.x &&
                n.position.x <= r.x + r.width &&
                n.position.y >= r.y &&
                n.position.y <= r.y + r.height,
            )
            .map((n) => n.id),
          position: { x: r.x, y: r.y },
          width: r.width,
          height: r.height,
        },
      ],
    });
    onSelect({ type: "group", id });
    setDialog("");
  };
  const createUnit = () => {
    const id = crypto.randomUUID();
    patch({
      ...v,
      processUnits: [
        ...(v.processUnits || []),
        {
          id,
          name: name.trim() || "生产环节",
          nodeIds: unitNodes,
          outputUnit: b.unit,
          bufferPercent: 0,
          steps: unitNodes.map((nodeId) => ({
            nodeId,
            dailyCapacity: null,
            outputPerInput: 1,
          })),
        },
      ],
    });
    onSelect({ type: "unit", id });
    setDialog("");
  };
  const latestReview = (key: string) =>
    (p.flowReviews || [])
      .filter((r) => r.chainId === chain.id && r.issueKey === key)
      .at(-1);
  useEffect(() => {
    if (capability) setCapabilityPanels(previous => ({...previous, [capability.key]: capability}));
  }, [capability]);
  const panel = selection && (
    <aside className="experience-inspector" aria-label="当前对象详情">
      <header>
        <div>
          <small>
            {target
              ? "节点"
              : edge
                ? "管道与池"
                : unit
                  ? "生产环节"
                  : group
                    ? "辅助范围"
                    : "关注事项"}
          </small>
          <h3>
            {target?.title ||
              unit?.name ||
              group?.name ||
              (edge ? "准入与取数" : "全部关注事项")}
          </h3>
        </div>
        <Button
          type="text"
          aria-label="关闭对象详情"
          icon={<CloseOutlined />}
          onClick={() => onSelect(null)}
        />
      </header>
      {(target || edge) && <nav className="canvas-inspector-tabs" aria-label="当前对象信息分类">{[["runtime", "运行与规则"], ["data", "数据追溯"], ["processing", "数据处理"]].map(([key, label]) => <button key={key} aria-selected={inspectorTab === key} onClick={() => {
        setInspectorTab(key);
        if (key === "processing") setCapability({section: target && !v.edges.some(e => e.to === target.id) ? "sources" : "adapt", source: target?.title || v.nodes.find(n => n.id === edge?.from)?.title || "上游", target: edge ? v.nodes.find(n => n.id === edge.to)?.title || "下游" : v.nodes.find(n => v.edges.some(e => e.from === target?.id && e.to === n.id))?.title || "待选择目标", key: selection.id});
      }}>{label}</button>)}</nav>}
      <div className="experience-inspector-body">
        {inspectorTab === "data" && (target || edge) && <CanvasLineage p={p} chain={chain} version={v} nodeId={target?.id || edge!.to} onSelect={id => {onSelect({type: "node", id});setInspectorTab("data");}} />}
        <div hidden={inspectorTab !== "processing" || !(target || edge)}>{Object.entries(capabilityPanels).map(([key, context]) => <div key={key} hidden={key !== capability?.key}><DataCapabilitiesPrototype initialSection={context.section} sourceLabel={context.source} targetLabel={context.target} /></div>)}</div>
        <div hidden={inspectorTab !== "runtime" && !!(target || edge)}>
        {target &&
          (() => {
            const m = nodeMeasure(p, chain.id, v, target.id),
              incoming = v.edges.filter((e) => e.to === target.id),
              outgoing = v.edges.filter((e) => e.from === target.id);
            return (
              <>
                <div className="experience-object-result">
                  <div>
                    <span>
                      {target.id === v.output
                        ? "可交付候选"
                        : target.kind === "router"
                          ? "已归拢"
                          : "平台已输出"}
                    </span>
                    <strong>
                      {quantity(m.output)} <small>{target.flowUnit}</small>
                    </strong>
                  </div>
                  <div>
                    <span>尚未向下游取走</span>
                    <b>{quantity(m.remaining)}</b>
                  </div>
                </div>
                {signals
                  .filter((s) => s.nodeId === target.id)
                  .map((s) => (
                    <div className="experience-object-signal" key={s.key}>
                      <strong>{s.title}</strong>
                      <p>{s.detail}</p>
                      <Button
                        size="small"
                        disabled={
                          disabled || !v.confirmedAt || dirty || !!chain.draft
                        }
                        onClick={() => onIssue(s)}
                      >
                        处理与复查
                      </Button>
                    </div>
                  ))}
                {target.kind === "platform" ? (
                  <div className="experience-platform-entry">
                    <span>{platforms[target.platform]}</span>
                    <strong>{target.platformRef || "尚未关联项目"}</strong>
                    <Button
                      type="primary"
                      icon={<ArrowRightOutlined />}
                      disabled={!v.confirmedAt || dirty || !!chain.draft}
                      onClick={() => {
                        setExternalId("");
                        setExternalQuantity(1);
                        setExternalCost(null);
                        setExternalReceipt(receipts.at(-1)?.id);
                        setExternalFields({
                          合格: true,
                          分数: 90,
                          描述: "平台合格输出",
                        });
                        requestId.current = crypto.randomUUID();
                        setDialog("platform");
                      }}
                    >
                      进入平台与归拢输出
                    </Button>
                    <small>
                      {target.retiredAt
                        ? "此环节已退场，仍可归拢历史在途产出；新取数保持关闭。"
                        : "平台与通知仅作本地示意，关联标记随上下文传递。"}
                    </small>
                  </div>
                ) : (
                  <section className="experience-inspector-section">
                    <h4>池内整合与分配</h4>
                    <div className="experience-inline-note">
                      已向下游领取 {quantity(m.claimed)}；留存{" "}
                      {quantity(m.remaining)}。比例归属与实际领取分开记录。
                    </div>
                    {outgoing.map((e) => {
                      const balance = pipeRows(p, chain.id, v, e.from, e.to);
                      return (
                        <p key={e.to}>
                          {v.nodes.find((n) => n.id === e.to)?.title}：
                          {target.routingMode !== "demand" && (
                            <>
                              累计分配{" "}
                              {quantity(
                                (p.flowAssignments || [])
                                  .filter(
                                    (a) =>
                                      a.chainId === chain.id &&
                                      a.nodeId === target.id &&
                                      a.to === e.to,
                                  )
                                  .reduce(
                                    (sum, a) => sum + (a.quantity ?? 1),
                                    0,
                                  ),
                              )}{" "}
                              ·{" "}
                            </>
                          )}
                          可领 {quantity(balance.availableQuantity)} · 已领{" "}
                          {quantity(
                            claimedQuantity(
                              p,
                              chain.id,
                              target.id,
                              undefined,
                              e.to,
                            ),
                          )}
                        </p>
                      );
                    })}
                    <h4>分配设置</h4>
                    <label className="experience-field">
                      分配策略
                      <Select
                        disabled={disabled}
                        value={target.routingMode || "demand"}
                        options={[
                          { value: "demand", label: "按需取数" },
                          { value: "ratio", label: "持续比例分配" },
                          { value: "condition", label: "按赋值条件分流" },
                        ]}
                        onChange={(routingMode) =>
                          changeNode({
                            routingMode,
                            branchWeights: Object.fromEntries(
                              outgoing.map((e) => [
                                e.to,
                                target.branchWeights?.[e.to] || 1,
                              ]),
                            ),
                            ratioPolicy: target.ratioPolicy || {
                              order: outgoing.map((e) => e.to),
                              startBranch: outgoing[0]?.to || "",
                            },
                          })
                        }
                      />
                    </label>
                    {target.routingMode === "ratio" && (
                      <>
                        <p className="experience-small-note">
                          多个来源先汇入此池，跨来源、跨批次持续分配；下游忙碌不改派。
                        </p>
                        {outgoing.map((e) => (
                          <label className="experience-weight" key={e.to}>
                            <span>
                              {v.nodes.find((n) => n.id === e.to)?.title}
                            </span>
                            <InputNumber
                              aria-label={`${v.nodes.find((n) => n.id === e.to)?.title}分配权重`}
                              disabled={disabled}
                              min={1}
                              precision={0}
                              value={target.branchWeights?.[e.to] || 1}
                              onChange={(x) =>
                                changeNode({
                                  branchWeights: {
                                    ...target.branchWeights,
                                    [e.to]: x || 1,
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                        <label className="experience-field">
                          序列起始支路
                          <Select
                            disabled={disabled}
                            placeholder="请明确选择"
                            value={target.ratioPolicy?.startBranch || undefined}
                            options={outgoing.map((e) => ({
                              value: e.to,
                              label: v.nodes.find((n) => n.id === e.to)?.title,
                            }))}
                            onChange={(startBranch) =>
                              changeNode({
                                ratioPolicy: {
                                  order: outgoing.map((e) => e.to),
                                  startBranch,
                                },
                              })
                            }
                          />
                        </label>
                        <div className="experience-inline-note">
                          按画布出边顺序，每支连续分配对应权重数量，再进入下一支；不足一轮继续累计，不重置历史。
                        </div>
                      </>
                    )}
                    {target.routingMode === "condition" && (
                      <p className="experience-small-note">
                        在下方各支路设置条件；缺字段、无命中或多支命中都留存并说明原因。
                      </p>
                    )}
                    <label className="experience-field">
                      池的准入必要字段
                      <Select
                        mode="multiple"
                        disabled={disabled}
                        value={target.requiredFields || []}
                        options={outputFields(v, target.id).map((f) => ({
                          value: f.key,
                          label: f.key,
                        }))}
                        onChange={(requiredFields) =>
                          changeNode({ requiredFields })
                        }
                      />
                    </label>
                    <Checkbox
                      disabled={
                        disabled ||
                        !!outgoing.length ||
                        (!!v.output &&
                          v.output !== target.id &&
                          !!v.nodes.find((n) => n.id === v.output)?.flowResults
                            ?.length)
                      }
                      checked={v.output === target.id}
                      onChange={(e) =>
                        patch({
                          ...v,
                          output: e.target.checked ? target.id : "",
                        })
                      }
                    >
                      作为正式交付候选入口
                    </Checkbox>
                  </section>
                )}
                {target.id === v.output && (
                  <section className="experience-inspector-section">
                    <Button
                      disabled={
                        disabled || dirty || !!chain.draft || !v.confirmedAt
                      }
                      onClick={() => {
                        setFeedbackCount(0);
                        setFeedbackName("客户反馈");
                        setFeedbackText("");
                        setFeedbackOpen(true);
                      }}
                    >
                      登记客户反馈
                    </Button>
                    <p>
                      登记客户实际接受数量，之后在“交付与客户验收”选择该反馈完成正式验收。
                    </p>
                  </section>
                )}
                <section className="experience-inspector-section">
                  <h4>{incoming.length ? "从哪里取数" : "数据源头"}</h4>
                  {incoming.length ? (
                    incoming.map((e) => {
                      const s = pipeRows(p, chain.id, v, e.from, e.to);
                      return (
                        <button
                          className="experience-pipe-link"
                          key={e.from}
                          onClick={() =>
                            onSelect({ type: "edge", id: `${e.from}:${e.to}` })
                          }
                        >
                          <span>
                            {v.nodes.find((n) => n.id === e.from)?.title}
                          </span>
                          <b>可取 {quantity(s.availableQuantity)}</b>
                          <ArrowRightOutlined />
                        </button>
                      );
                    })
                  ) : (
                    <p>
                      此节点作为输入源头，归拢资源或外采结果；素材与生产批次留在平台。
                    </p>
                  )}
                  <h4>流向哪里</h4>
                  {outgoing.length ? (
                    outgoing.map((e) => (
                      <button
                        className="experience-pipe-link"
                        key={e.to}
                        onClick={() =>
                          onSelect({ type: "edge", id: `${e.from}:${e.to}` })
                        }
                      >
                        <span>{v.nodes.find((n) => n.id === e.to)?.title}</span>
                        <small>
                          {e.rules?.length
                            ? `${e.rules.length} 项准入条件`
                            : "按需取数"}
                        </small>
                        <ArrowRightOutlined />
                      </button>
                    ))
                  ) : (
                    <p>
                      {target.id === v.output
                        ? "进入交付与客户验收，选择来源并确认交付。"
                        : "暂无后续连接，结果继续留存。"}
                    </p>
                  )}
                </section>
                <details className="experience-evidence" open={!v.confirmedAt}>
                  <summary>
                    <SettingOutlined /> 节点配置
                  </summary>
                  <label className="experience-field">
                    名称
                    <Input
                      disabled={disabled}
                      value={target.title}
                      onChange={(e) => changeNode({ title: e.target.value })}
                    />
                  </label>
                  {target.kind === "platform" && (
                    <label className="experience-field">
                      关联平台项目
                      <Input
                        disabled={disabled || !!target.flowResults?.length}
                        value={target.platformRef}
                        placeholder="填写平台项目名或外部项目标识"
                        onChange={(e) =>
                          changeNode({ platformRef: e.target.value })
                        }
                      />
                    </label>
                  )}
                  <label className="experience-field">
                    输出单位
                    <Input
                      disabled={disabled || !!target.flowResults?.length}
                      value={target.flowUnit}
                      onChange={(e) => changeNode({ flowUnit: e.target.value })}
                    />
                  </label>
                  {target.kind === "platform" && (
                    <label className="experience-field">
                      计划日输出（供给 / 产能依据）
                      <InputNumber
                        aria-label="计划日输出"
                        disabled={disabled}
                        min={0}
                        value={target.dailyPlan}
                        placeholder="未承诺"
                        onChange={(x) =>
                          changeNode({
                            dailyPlan: x == null ? null : Number(x),
                          })
                        }
                      />
                      <small>
                        单位：{target.flowUnit}
                        /天。用于预测；实际产出以平台回传为准。成组必要步骤另按环节短板计算。
                      </small>
                    </label>
                  )}
                  <label className="experience-field">
                    备注
                    <Input.TextArea
                      disabled={disabled}
                      value={target.note}
                      onChange={(e) => changeNode({ note: e.target.value })}
                    />
                  </label>
                  {v.confirmedAt && (
                    <Button
                      disabled={
                        disabled ||
                        dirty ||
                        !!chain.draft ||
                        target.id === v.output
                      }
                      onClick={() => {
                        setReason("");
                        setDialog("retire");
                      }}
                    >
                      {target.retiredAt ? "恢复此环节" : "让此环节退场"}
                    </Button>
                  )}
                  {target.retiredAt && (
                    <p>
                      退场于 {target.retiredAt.slice(0, 10)}：
                      {target.retirementReason}
                      。产出与取数历史保留，恢复后需逐条核对管道开关。
                    </p>
                  )}
                  <Button
                    danger
                    disabled={disabled || !!target.flowResults?.length}
                    onClick={() =>
                      modal.confirm({
                        title: "移除此节点？",
                        content:
                          "只移除当前草稿中的关系。已有产出节点请停用路径并保留历史。",
                        onOk: () => {
                          patch({
                            ...v,
                            nodes: v.nodes.filter((n) => n.id !== target.id),
                            edges: v.edges.filter(
                              (e) => e.from !== target.id && e.to !== target.id,
                            ),
                            output: v.output === target.id ? "" : v.output,
                            annotationGroups: v.annotationGroups?.map((g) => ({
                              ...g,
                              nodeIds: g.nodeIds.filter(
                                (id) => id !== target.id,
                              ),
                            })),
                            processUnits: v.processUnits
                              ?.map((u) => ({
                                ...u,
                                nodeIds: u.nodeIds.filter(
                                  (id) => id !== target.id,
                                ),
                                steps: u.steps.filter(
                                  (s) => s.nodeId !== target.id,
                                ),
                              }))
                              .filter((u) => u.nodeIds.length),
                          });
                          onSelect(null);
                        },
                      })
                    }
                  >
                    移除空节点
                  </Button>
                </details>
                <details className="experience-evidence">
                  <summary>输出引用与取数证据</summary>
                  <Input.Search
                    aria-label="搜索输出引用"
                    placeholder="搜索平台结果标识"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Table
                    size="small"
                    rowKey="id"
                    dataSource={(target.flowResults || []).filter((r) =>
                      r.externalId.includes(search),
                    )}
                    pagination={{ pageSize: 4 }}
                    columns={[
                      { title: "平台引用", dataIndex: "externalId" },
                      {
                        title: "数量",
                        render: (_, r) => quantity(r.quantity ?? 1),
                      },
                      { title: "日期", dataIndex: "date" },
                      ...(target.id === v.output
                        ? [
                            {
                              title: "资源沉淀",
                              render: (_: any, r: any) => (
                                <Button
                                  size="small"
                                  disabled={
                                    disabled ||
                                    dirty ||
                                    !!chain.draft ||
                                    !v.confirmedAt
                                  }
                                  onClick={() => {
                                    setDepositRow(r.id);
                                    setDispositionCount(r.quantity ?? 1);
                                    setLibraryRef("");
                                    setReason("");
                                    requestId.current = crypto.randomUUID();
                                  }}
                                >
                                  登记沉淀
                                </Button>
                              ),
                            },
                          ]
                        : []),
                      {
                        title: "留存处置",
                        render: (_, r) => (
                          <Dropdown
                            disabled={
                              disabled ||
                              dirty ||
                              !!chain.draft ||
                              !v.confirmedAt ||
                              target.id === v.output ||
                              unallocatedQuantity(p, chain.id, target.id, r) <=
                                0
                            }
                            menu={{
                              items: [
                                { key: "recover", label: "标记回捞候选" },
                                {
                                  key: "discard",
                                  label: "登记丢弃",
                                  danger: true,
                                },
                              ],
                              onClick: ({ key }) => {
                                setDisposition({
                                  resultId: r.id,
                                  action: key as "recover" | "discard",
                                });
                                setDispositionCount(1);
                                setReason("");
                                requestId.current = crypto.randomUUID();
                              },
                            }}
                          >
                            <Button size="small">处置</Button>
                          </Dropdown>
                        ),
                      },
                    ]}
                  />
                  {(p.flowDeposits || [])
                    .filter(
                      (d) => d.chainId === chain.id && d.nodeId === target.id,
                    )
                    .map((d) => (
                      <p key={d.id}>
                        资源库关联：{d.libraryRef} · {quantity(d.quantity)} ·{" "}
                        {d.at.slice(0, 10)}（本地示意）
                      </p>
                    ))}
                  {(p.flowDispositions || [])
                    .filter(
                      (d) => d.chainId === chain.id && d.nodeId === target.id,
                    )
                    .map((d) => (
                      <p key={d.id}>
                        {d.at.slice(0, 10)} ·{" "}
                        {d.action === "discard" ? "丢弃" : "回捞候选"}{" "}
                        {quantity(d.quantity)} · {d.reason}
                      </p>
                    ))}
                  <p>
                    {receipts.length} 次输入领取 · 只计流转，不代表平台已产出。
                  </p>
                </details>
              </>
            );
          })()}
        {edge && stats && (
          <>
            <div className="experience-route-caption">
              {v.nodes.find((n) => n.id === edge.from)?.title}
              <ArrowRightOutlined />
              {v.nodes.find((n) => n.id === edge.to)?.title}
            </div>
            <div className="experience-pool-balance">
              <div>
                <span>符合准入且可领取</span>
                <strong>{quantity(stats.availableQuantity)}</strong>
              </div>
              <small>
                {v.nodes.find((n) => n.id === edge.from)?.flowUnit} ·
                这是同一份上游产出，不额外复制
              </small>
            </div>
            <label className="experience-field">
              计划准入率（仅用于投入估算）
              <InputNumber
                aria-label="计划准入率"
                disabled={disabled}
                min={0}
                max={100}
                value={
                  edge.planningAdmissionRate == null
                    ? null
                    : edge.planningAdmissionRate * 100
                }
                addonAfter="%"
                placeholder="未承诺"
                onChange={(x) =>
                  changeEdge({
                    planningAdmissionRate:
                      x == null ? undefined : Number(x) / 100,
                  })
                }
              />
              <small>
                不改变实际筛选。没有依据时留空，预测会说明缺失条件。
              </small>
            </label>
            <label className="experience-gate">
              <span>
                <b>允许新取数</b>
                <small>关闭后，已有领取继续保留</small>
              </span>
              <Switch
                aria-label="允许本管道新取数"
                checked={stats.open}
                disabled={!operational}
                onChange={(open) =>
                  perform(() =>
                    run("gate", { from: edge.from, to: edge.to, open }),
                  )
                }
              />
            </label>
            <section className="experience-inspector-section">
              <h4>准入条件</h4>
              {(edge.rules || []).length === 0 && (
                <p>未设字段筛选；仍须满足下游必要字段和单位。</p>
              )}
              {(edge.rules || []).map((rule, i) => {
                const schema = outputFields(v, edge.from).find(
                  (f) => f.key === rule.field,
                );
                const update = (value: Partial<FlowRule>) =>
                  changeEdge({
                    rules: edge.rules?.map((r, j) =>
                      i === j ? { ...r, ...value } : r,
                    ),
                  });
                return (
                  <div className="experience-rule" key={i}>
                    <strong>{rule.field}</strong>
                    <Select
                      aria-label="条件比较方式"
                      disabled={disabled}
                      value={rule.operator}
                      options={Object.entries(ops)
                        .filter(([op]) =>
                          schema?.type === "number"
                            ? op !== "contains"
                            : [
                                "eq",
                                "ne",
                                ...(schema?.type === "text"
                                  ? ["contains"]
                                  : []),
                              ].includes(op),
                        )
                        .map(([value, label]) => ({ value, label }))}
                      onChange={(operator) => update({ operator })}
                    />
                    {schema?.type === "boolean" ? (
                      <Select
                        aria-label="布尔条件值"
                        disabled={disabled}
                        value={rule.value as boolean}
                        options={
                          [
                            { value: true, label: "是" },
                            { value: false, label: "否" },
                          ] as any
                        }
                        onChange={(value) => update({ value })}
                      />
                    ) : schema?.type === "number" ? (
                      <InputNumber
                        disabled={disabled}
                        value={Number(rule.value)}
                        onChange={(value) => update({ value: value ?? 0 })}
                      />
                    ) : (
                      <Input
                        disabled={disabled}
                        value={String(rule.value)}
                        onChange={(e) => update({ value: e.target.value })}
                      />
                    )}
                    <Button
                      disabled={disabled}
                      type="text"
                      aria-label="删除此条件"
                      icon={<CloseOutlined />}
                      onClick={() =>
                        changeEdge({
                          rules: edge.rules?.filter((_, j) => j !== i),
                        })
                      }
                    />
                  </div>
                );
              })}
              <Select
                aria-label="添加准入条件"
                placeholder="添加上游赋值条件"
                value={undefined}
                disabled={disabled}
                style={{ width: "100%" }}
                options={outputFields(v, edge.from).map((f) => ({
                  value: f.key,
                  label: f.key,
                }))}
                onChange={(field) => {
                  const f = outputFields(v, edge.from).find(
                    (f) => f.key === field,
                  )!;
                  changeEdge({
                    rules: [
                      ...(edge.rules || []),
                      {
                        field,
                        operator: "eq",
                        value:
                          f.type === "boolean"
                            ? true
                            : f.type === "number"
                              ? 0
                              : "",
                      },
                    ],
                  });
                }}
              />
            </section>
            <section className="experience-inspector-section">
              <h4>请求取数</h4>
              <p>
                领取归属与平台执行分开。池中只放确定产出，已取走的份额不能由上游撤回。
              </p>
              {allowance?.unitId && (
                <Alert
                  type={allowance.unknown ? "warning" : "info"}
                  showIcon
                  message={
                    allowance.unknown
                      ? "当前未启用容量限制"
                      : `环节今日投入剩余额度 ${quantity(allowance.remaining)} / ${quantity(allowance.limit)}`
                  }
                  description={allowance.reason}
                />
              )}
              <label className="experience-field">
                本次领取数量
                <InputNumber
                  min={1}
                  precision={0}
                  max={
                    Math.min(
                      stats.availableQuantity,
                      allowance?.remaining ?? Infinity,
                    ) || 1
                  }
                  value={pullCount}
                  onChange={(x) => {
                    setPullCount(x || 1);
                    requestId.current = crypto.randomUUID();
                  }}
                />
              </label>
              <Button
                type="primary"
                block
                disabled={
                  !operational ||
                  !stats.open ||
                  !stats.availableQuantity ||
                  allowance?.remaining === 0 ||
                  pullCount >
                    Math.min(
                      stats.availableQuantity,
                      allowance?.remaining ?? Infinity,
                    )
                }
                onClick={() =>
                  perform(async () => {
                    await run("pull", {
                      from: edge.from,
                      to: edge.to,
                      count: pullCount,
                      requestId: requestId.current,
                    });
                    requestId.current = crypto.randomUUID();
                    message.success("已记录取数；平台产出需另行回传");
                  })
                }
              >
                领取 {quantity(pullCount)}{" "}
                {v.nodes.find((n) => n.id === edge.from)?.flowUnit}
              </Button>
              {!operational && (
                <small className="experience-disabled-reason">
                  请先保存并发布草稿，再开始生产。
                </small>
              )}
            </section>
            <details className="experience-evidence">
              <summary>查看留存与准入证据</summary>
              <Table
                size="small"
                rowKey={(r) => r.row.id}
                dataSource={stats.rows}
                pagination={{ pageSize: 5 }}
                columns={[
                  { title: "引用", render: (_, r) => r.row.externalId },
                  {
                    title: "可用余额",
                    render: (_, r) => quantity(r.remainingQuantity),
                  },
                  {
                    title: "当前判断",
                    render: (_, r) =>
                      r.reason || (r.taken ? "已领完" : "符合准入"),
                  },
                ]}
              />
            </details>
            <details className="experience-evidence">
              <summary>调整路径</summary>
              <Button
                danger
                disabled={disabled}
                onClick={() =>
                  modal.confirm({
                    title: "从草稿中移除此连线？",
                    content:
                      "已有领取不撤销。如只是暂时不走此路，请使用上方管道开关。",
                    onOk: () => {
                      patch({ ...v, edges: v.edges.filter((e) => e !== edge) });
                      onSelect(null);
                    },
                  })
                }
              >
                移除此连线
              </Button>
            </details>
          </>
        )}
        {group && (
          <>
            <p>此范围仅辅助阅读与备注，不改变节点归属、数据流转或产能。</p>
            <label className="experience-field">
              范围名称
              <Input
                disabled={disabled}
                value={group.name}
                onChange={(e) =>
                  patch({
                    ...v,
                    annotationGroups: v.annotationGroups?.map((g) =>
                      g.id === group.id ? { ...g, name: e.target.value } : g,
                    ),
                  })
                }
              />
            </label>
            <label className="experience-field">
              备注
              <Input.TextArea
                disabled={disabled}
                value={group.note}
                onChange={(e) =>
                  patch({
                    ...v,
                    annotationGroups: v.annotationGroups?.map((g) =>
                      g.id === group.id ? { ...g, note: e.target.value } : g,
                    ),
                  })
                }
              />
            </label>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                patch({
                  ...v,
                  annotationGroups: v.annotationGroups?.filter(
                    (g) => g.id !== group.id,
                  ),
                });
                onSelect(null);
              }}
            >
              删除辅助框，保留节点
            </Button>
          </>
        )}
        {unit &&
          (() => {
            const c = processUnitCapacity(unit);
            const update = (value: any) =>
              patch({
                ...v,
                processUnits: v.processUnits?.map((u) =>
                  u.id === unit.id ? { ...u, ...value } : u,
                ),
              });
            return (
              <>
                <div className="experience-pool-balance">
                  <div>
                    <span>整个环节的有效产能</span>
                    <strong>
                      {quantity(c.dailyOutput)}{" "}
                      <small>{unit.outputUnit} / 天</small>
                    </strong>
                  </div>
                  <small>
                    {c.unknown
                      ? "请补齐内部步骤产能，暂不推算"
                      : `受 ${v.nodes.find((n) => n.id === c.bottleneckNodeId)?.title || "内部短板"} 限制`}
                  </small>
                </div>
                <p>
                  下面这些步骤必须协同完成同一产物；按顺序换算到最终单位后取最小产能。
                </p>
                <label className="experience-field">
                  环节名称
                  <Input
                    disabled={disabled}
                    value={unit.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                {unit.steps.map((s, i) => (
                  <section className="experience-unit-step" key={s.nodeId}>
                    <header>
                      <b>
                        {i + 1}. {v.nodes.find((n) => n.id === s.nodeId)?.title}
                      </b>
                      {s.nodeId === c.bottleneckNodeId && (
                        <Tag color="orange">当前短板</Tag>
                      )}
                    </header>
                    <label className="experience-field">
                      此步骤每天可输出
                      <InputNumber
                        min={0}
                        disabled={disabled}
                        value={s.dailyCapacity}
                        onChange={(dailyCapacity) =>
                          update({
                            steps: unit.steps.map((x, j) =>
                              i === j ? { ...x, dailyCapacity } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="experience-field">
                      每 1 份上步输入可形成的输出
                      <InputNumber
                        min={0.0001}
                        precision={4}
                        disabled={disabled}
                        value={s.outputPerInput}
                        onChange={(outputPerInput) =>
                          update({
                            steps: unit.steps.map((x, j) =>
                              i === j
                                ? { ...x, outputPerInput: outputPerInput || 1 }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <small>
                      换算后{" "}
                      {quantity(
                        c.steps.find((x) => x.nodeId === s.nodeId)
                          ?.effectiveDailyOutput,
                      )}{" "}
                      {unit.outputUnit} / 天
                    </small>
                  </section>
                ))}
                <label className="experience-field">
                  最终产物单位
                  <Input
                    disabled={disabled}
                    value={unit.outputUnit}
                    onChange={(e) => update({ outputUnit: e.target.value })}
                  />
                </label>
                <label className="experience-field">
                  上游备量比例（%）
                  <InputNumber
                    min={0}
                    max={100}
                    disabled={disabled}
                    value={unit.bufferPercent || 0}
                    onChange={(bufferPercent) =>
                      update({ bufferPercent: bufferPercent || 0 })
                    }
                  />
                </label>
                <div className="experience-inline-note">
                  已知容量时，短板与备量决定串行环节首步的当日取数额度；不会自动触发平台生产。容量缺失时明确提示尚未启用限制。
                </div>
                <Button
                  onClick={() =>
                    setCollapsed((ids) =>
                      ids.includes(unit.id)
                        ? ids.filter((id) => id !== unit.id)
                        : [...ids, unit.id],
                    )
                  }
                >
                  {collapsed.includes(unit.id)
                    ? "展开内部步骤"
                    : "收起为一个生产环节"}
                </Button>
                <Button
                  danger
                  disabled={disabled}
                  onClick={() => {
                    patch({
                      ...v,
                      processUnits: v.processUnits?.filter(
                        (u) => u.id !== unit.id,
                      ),
                    });
                    onSelect(null);
                  }}
                >
                  解除环节组合，保留节点
                </Button>
              </>
            );
          })()}
        {selection.type === "signals" &&
          signals.map((s) => (
            <article className="experience-object-signal" key={s.key}>
              <strong>{s.title}</strong>
              <p>{s.detail}</p>
              <div>
                <Button
                  type="link"
                  onClick={() =>
                    s.nodeId && onSelect({ type: "node", id: s.nodeId })
                  }
                >
                  定位环节
                </Button>
                <Button
                  size="small"
                  disabled={
                    disabled || !v.confirmedAt || dirty || !!chain.draft
                  }
                  onClick={() => onIssue(s)}
                >
                  处理与复查
                </Button>
              </div>
              {latestReview(s.key) && (
                <small>上次处理：{latestReview(s.key)?.action}</small>
              )}
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
  return (
    <div className="experience-board canvas-workbench">
      <CanvasSummary p={p} chain={chain} version={v} />
      <div className="experience-board-toolbar">
        <div>
          <Button
            icon={<PlusOutlined />}
            disabled={disabled}
            onClick={() => {
              setName("");
              setNewPlatform("RESOURCE");
              setDialog("node");
            }}
          >
            添加节点
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              setDrawing(true);
              onSelect(null);
            }}
          >
            画范围备注
          </Button>
          <Button
            disabled={
              disabled ||
              v.nodes.filter((n) => n.kind === "platform").length < 2
            }
            onClick={() => {
              setUnitNodes([]);
              setName("");
              setDialog("unit");
            }}
          >
            组织生产环节
          </Button>
        </div>
        <div>
          {!!v.nodes.some((n) => n.retiredAt) && (
            <Button
              type={showRetired ? "primary" : "text"}
              onClick={() => setShowRetired(!showRetired)}
            >
              {showRetired ? "隐藏退场" : "显示退场"}
            </Button>
          )}
          <Select
            aria-label="查找生产节点"
            showSearch
            optionFilterProp="label"
            placeholder="查找节点"
            value={null}
            style={{ width: 154 }}
            options={v.nodes.map((n) => ({ value: n.id, label: n.title }))}
            onChange={(id) => onSelect({ type: "node", id })}
          />
          <Button
            type={focusOnly ? "primary" : "text"}
            icon={<WarningOutlined />}
            onClick={() => {
              setFocusOnly(!focusOnly);
              if (signals.length) onSelect({ type: "signals", id: "" });
            }}
          >
            关注 {signals.length}
          </Button>
          <Button type="text" disabled={!v.nodes.length || disabled} onClick={() => {
            const levels = new Map<string, number>();
            for (let i = 0; i < v.nodes.length; i++) for (const n of v.nodes) { const incoming = v.edges.filter(e => e.to === n.id); if (incoming.every(e => levels.has(e.from))) levels.set(n.id, incoming.length ? Math.max(...incoming.map(e => levels.get(e.from)!)) + 1 : 0); }
            const rows = new Map<number, number>();
            patch({...v, nodes: v.nodes.map(n => { const col = levels.get(n.id) || 0; const row = rows.get(col) || 0; rows.set(col, row + 1); return {...n, position: {x: col * 400, y: row * 360 + 80}}; })});
            setTimeout(() => flow?.fitView({padding: 0.15, maxZoom: 0.9, duration: 200}), 100);
          }}>整理布局</Button>
          <Button
            type="text"
            aria-label="适应完整生产图"
            icon={<AimOutlined />}
            onClick={() =>
              flow?.fitView({ padding: 0.15, maxZoom: 1, duration: 200 })
            }
          >
            全图
          </Button>
        </div>
      </div>
      {!!v.processUnits?.length && (
        <div className="experience-unit-strip">
          <span>必要串行环节</span>
          {v.processUnits.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect({ type: "unit", id: u.id })}
            >
              <span>{u.name}</span>
              <b>{quantity(processUnitCapacity(u).dailyOutput)}</b>
              <small>{u.outputUnit}/天</small>
            </button>
          ))}
        </div>
      )}
      <div className="experience-board-body">
        <div className="experience-board-canvas" ref={boardRef}>
          {!v.nodes.length && (
            <div className="experience-canvas-empty">
              <DatabaseOutlined />
              <h3>先放一个数据源</h3>
              <p>再加生产平台和缓冲池，用连线确定下一步。</p>
              <Button
                disabled={disabled}
                onClick={() => {
                  setName("原始资源");
                  setNewPlatform("RESOURCE");
                  setDialog("node");
                }}
              >
                添加数据源
              </Button>
            </div>
          )}
          <div className="canvas-legend"><span><i className="legend-platform" />执行平台</span><span><i className="legend-pool" />蓄水池 / 流转</span><span><i className="legend-delivery" />交付候选</span></div>
          <ReactFlow
            nodes={nodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={capabilityEdgeTypes}
            onInit={setFlow}
            fitView
            fitViewOptions={{ maxZoom: 0.9, padding: 0.15 }}
            minZoom={0.15}
            maxZoom={1.4}
            zoomOnScroll={false}
            panOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesDraggable={!disabled}
            nodesConnectable={!disabled}
            deleteKeyCode={null}
            onNodesChange={(c) => setNodes((ns) => applyNodeChanges(c, ns))}
            onNodeDragStop={(_, n) => {
              if (n.id.startsWith("annotation:"))
                patch({
                  ...v,
                  annotationGroups: v.annotationGroups?.map((g) =>
                    g.id === n.id.slice(11)
                      ? { ...g, position: n.position }
                      : g,
                  ),
                });
              else if (n.id.startsWith("unit:")) {
                const u = v.processUnits?.find((u) => u.id === n.id.slice(5));
                const first = v.nodes.find((x) => x.id === u?.nodeIds[0]);
                if (u && first) {
                  const dx = n.position.x - first.position.x,
                    dy = n.position.y - first.position.y;
                  patch({
                    ...v,
                    nodes: v.nodes.map((x) =>
                      u.nodeIds.includes(x.id)
                        ? {
                            ...x,
                            position: {
                              x: x.position.x + dx,
                              y: x.position.y + dy,
                            },
                          }
                        : x,
                    ),
                  });
                }
              } else
                patch({
                  ...v,
                  nodes: v.nodes.map((x) =>
                    x.id === n.id ? { ...x, position: n.position } : x,
                  ),
                });
            }}
            onNodeClick={(_, n) =>
              onSelect(
                n.id.startsWith("annotation:")
                  ? { type: "group", id: n.id.slice(11) }
                  : n.id.startsWith("unit:")
                    ? { type: "unit", id: n.id.slice(5) }
                    : { type: "node", id: n.id },
              )
            }
            onEdgeClick={(_, e) => onSelect({ type: "edge", id: e.id })}
            onPaneClick={() => onSelect(null)}
            onConnect={(c) => {
              if (
                disabled ||
                !c.source ||
                !c.target ||
                c.source.startsWith("unit:") ||
                c.target.startsWith("unit:")
              )
                return;
              const from = c.source,
                to = c.target;
              patch({
                ...v,
                nodes: v.nodes.map((n) =>
                  n.id === from && n.routingMode === "ratio"
                    ? {
                        ...n,
                        branchWeights: { ...n.branchWeights, [to]: 1 },
                        ratioPolicy: {
                          order: [
                            ...(n.ratioPolicy?.order ||
                              v.edges
                                .filter((e) => e.from === from)
                                .map((e) => e.to)),
                            to,
                          ],
                          startBranch: n.ratioPolicy?.startBranch || to,
                        },
                      }
                    : n,
                ),
                edges: [
                  ...v.edges,
                  { from, to, rules: [], initiallyOpen: true },
                ],
              });
            }}
          >
            <Background color="#d9e2e9" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {drawing && (
            <div
              className="experience-draw-overlay"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                origin.current = { x: e.clientX, y: e.clientY };
                const r = e.currentTarget.getBoundingClientRect();
                setDrawBox({
                  x: e.clientX - r.x,
                  y: e.clientY - r.y,
                  width: 0,
                  height: 0,
                });
              }}
              onPointerMove={(e) => {
                if (!origin.current) return;
                const r = e.currentTarget.getBoundingClientRect(),
                  a = origin.current;
                setDrawBox({
                  x: Math.min(a.x, e.clientX) - r.x,
                  y: Math.min(a.y, e.clientY) - r.y,
                  width: Math.abs(e.clientX - a.x),
                  height: Math.abs(e.clientY - a.y),
                });
              }}
              onPointerUp={finishRect}
            >
              <span>
                拖出辅助范围 · 不改变生产关系{" "}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    origin.current = null;
                    setDrawing(false);
                  }}
                >
                  取消
                </button>
              </span>
              {drawBox && (
                <div
                  className="experience-draw-box"
                  style={{
                    left: drawBox.x,
                    top: drawBox.y,
                    width: drawBox.width,
                    height: drawBox.height,
                  }}
                />
              )}
            </div>
          )}
        </div>
        {panel}
      </div>
      <CanvasLedger p={p} chain={chain} version={v} signals={signals} onSelect={id => {onSelect({type: "node", id});setInspectorTab("data");}} onIssue={onIssue} />
      <footer className="experience-board-footer">
        <span>
          {v.nodes.length} 个节点 · {v.edges.length} 条管道
        </span>
        <span>
          {dirty || chain.draft
            ? "修改仅在草稿中，发布后改变未来流转"
            : "连线允许取数；实际生产由平台完成"}
        </span>
        <span>滚动平移 · 捏合缩放</span>
      </footer>
      <Modal
        title="登记客户反馈"
        open={feedbackOpen}
        onCancel={() => setFeedbackOpen(false)}
        okText="保存反馈"
        okButtonProps={{
          disabled:
            !feedbackName.trim() ||
            (feedbackCount === 0 && !feedbackText.trim()) ||
            busy,
        }}
        onOk={() =>
          perform(async () => {
            await run("feedback", {
              name: feedbackName,
              quantity: feedbackCount,
              feedback: feedbackText,
            });
            setFeedbackOpen(false);
            message.success("反馈已保存，正式客户验收需另行确认");
          })
        }
      >
        <p>本次是客户反馈记录，不创建生产任务或批次，不自动完成正式验收。</p>
        <label className="experience-field">
          反馈名称
          <Input
            aria-label="客户反馈名称"
            value={feedbackName}
            onChange={(e) => setFeedbackName(e.target.value)}
          />
        </label>
        <label className="experience-field">
          客户接受数量
          <InputNumber
            aria-label="客户接受数量"
            min={0}
            precision={0}
            value={feedbackCount}
            onChange={(x) => setFeedbackCount(Number(x) || 0)}
          />
        </label>
        <Input.TextArea
          aria-label="客户反馈说明"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
        />
      </Modal>
      <Modal
        title="登记资源沉淀"
        open={!!depositRow}
        onCancel={() => setDepositRow(null)}
        okButtonProps={{
          disabled: !libraryRef.trim() || !reason.trim() || busy,
        }}
        onOk={() =>
          perform(async () => {
            await run("deposit", {
              nodeId: target?.id,
              resultId: depositRow,
              quantity: dispositionCount,
              libraryRef,
              note: reason,
              requestId: requestId.current,
            });
            setDepositRow(null);
          })
        }
      >
        <p>
          仅保存交付候选结果与资源库的关联示意，未执行外部写入。沉淀不另算产量、不减少可交付余额，可与交付复用同一结果。
        </p>
        <label className="experience-field">
          目标资源库
          <Input
            aria-label="沉淀资源库"
            value={libraryRef}
            onChange={(e) => setLibraryRef(e.target.value)}
            placeholder="资源库名称或标识"
          />
        </label>
        <label className="experience-field">
          数量
          <InputNumber
            aria-label="沉淀数量"
            min={1}
            precision={0}
            value={dispositionCount}
            onChange={(x) => setDispositionCount(Number(x) || 1)}
          />
        </label>
        <Input.TextArea
          aria-label="资源沉淀说明"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="说明用途与依据（本地关联示意）"
        />
      </Modal>
      <Modal
        title={target?.retiredAt ? "恢复环节" : "让环节退场"}
        open={dialog === "retire"}
        onCancel={() => setDialog("")}
        okButtonProps={{ disabled: !reason.trim() || busy }}
        onOk={() =>
          perform(async () => {
            await run("retire", {
              nodeId: target?.id,
              retired: !target?.retiredAt,
              reason,
            });
            setDialog("");
            setShowRetired(true);
          })
        }
      >
        <p>
          停止此环节的新取数，历史产出与领取保留。已有生产任务继续留在平台核对；恢复不会自动开启管道。
        </p>
        <Input.TextArea
          aria-label="环节退场或恢复原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="填写原因"
        />
      </Modal>
      <Modal
        title={disposition?.action === "discard" ? "登记丢弃" : "标记回捞候选"}
        open={!!disposition}
        onCancel={() => setDisposition(null)}
        okButtonProps={{ disabled: !reason.trim() || busy }}
        onOk={() =>
          perform(async () => {
            await run("disposition", {
              ...disposition,
              nodeId: target?.id,
              quantity: dispositionCount,
              reason,
              requestId: requestId.current,
            });
            setDisposition(null);
          })
        }
      >
        <p>
          {disposition?.action === "discard"
            ? "仅减少未领取且未分配的留存余额，已有凭证和平台结果不删除。"
            : "为留存结果标记待重新利用，再由你接入合适路径。不会回撤已取数或自动改派。"}
        </p>
        <label className="experience-field">
          数量
          <InputNumber
            aria-label="处置数量"
            min={1}
            precision={0}
            value={dispositionCount}
            onChange={(x) => setDispositionCount(Number(x) || 1)}
          />
        </label>
        <Input.TextArea
          aria-label="留存处置原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="填写原因"
        />
      </Modal>
      <Modal
        title="添加独立节点"
        open={dialog === "node"}
        onCancel={() => setDialog("")}
        okText="放入画布"
        onOk={addNode}
      >
        <label className="experience-field">
          节点角色
          <Select
            value={newPlatform}
            onChange={setNewPlatform}
            options={[
              { value: "RESOURCE", label: "数据资源录入" },
              { value: "MACHINE_LABELING", label: "机器标注平台" },
              { value: "AGENT_LABELING", label: "Agent 标注平台" },
              { value: "MANUAL_LABELING", label: "人工标注平台" },
              { value: "COLLECTION", label: "外采成品录入" },
              { value: "FLOW", label: "共享缓冲池 / 分流 / 交付候选" },
            ]}
          />
        </label>
        <label className="experience-field">
          节点名称
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="按业务用途命名"
          />
        </label>
        <p>节点独立存在，不自动生成分组。按需连线，之后再组织生产环节。</p>
      </Modal>
      <Modal
        title="给范围加个备注"
        open={dialog === "annotation"}
        onCancel={() => setDialog("")}
        okText="保留范围"
        onOk={createAnnotation}
      >
        <label className="experience-field">
          范围名称
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：待验证的替代方案"
          />
        </label>
        <p>仅用于沟通与阅读，不约束节点，不参与产能计算。</p>
      </Modal>
      <Modal
        title="组织一个生产环节"
        open={dialog === "unit"}
        onCancel={() => setDialog("")}
        okText="组合并设置短板"
        okButtonProps={{ disabled: unitNodes.length < 2 }}
        onOk={createUnit}
      >
        <label className="experience-field">
          环节名称
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：人物跟踪与人工标注"
          />
        </label>
        <label className="experience-field">
          按实际生产顺序选择必要步骤
          <Select
            mode="multiple"
            value={unitNodes}
            onChange={setUnitNodes}
            options={v.nodes
              .filter(
                (n) =>
                  n.kind === "platform" &&
                  !v.processUnits?.some((u) => u.nodeIds.includes(n.id)),
              )
              .map((n) => ({ value: n.id, label: n.title }))}
          />
        </label>
        <div className="experience-inline-note">
          只有这些步骤全部完成，才形成同一个标准产物。环节产能按木桶短板计算；辅助范围只作备注。
        </div>
      </Modal>
      <Modal
        title={
          dialog === "output" ? "模拟平台产出回传" : "进入生产平台（示意）"
        }
        open={dialog === "platform" || dialog === "output"}
        onCancel={() => setDialog("")}
        footer={
          dialog === "platform" ? (
            <Button
              type="primary"
              disabled={!operational}
              onClick={() => setDialog("output")}
            >
              模拟平台产出回传
            </Button>
          ) : (
            <>
              <Button onClick={() => setDialog("platform")}>
                返回平台关联
              </Button>
              <Button
                type="primary"
                loading={busy}
                disabled={
                  !operational || !externalId.trim() || externalQuantity < 1
                }
                onClick={() =>
                  perform(async () => {
                    await run("externalOutput", {
                      nodeId: target?.id,
                      requestId: requestId.current,
                      externalBatchId: externalId,
                      marker,
                      quantity: externalQuantity,
                      fields: externalFields,
                      cost:
                        externalCost == null
                          ? null
                          : Math.round(externalCost * 100),
                      date: day(),
                      ...(externalReceipt
                        ? { receiptId: externalReceipt }
                        : {}),
                    });
                    requestId.current = crypto.randomUUID();
                    setDialog("");
                    message.success(
                      "已按关联标记归拢平台产出；未在PMC创建生产批次",
                    );
                  })
                }
              >
                归拢输出引用
              </Button>
            </>
          )
        }
      >
        <div className="experience-platform-handoff">
          <div>
            <RobotOutlined />
            <span>{target?.platformRef || "尚未关联平台项目"}</span>
          </div>
          <label className="experience-field">
            随跳转传递的关联标记
            <Input
              readOnly
              value={marker}
              suffix={
                <Button
                  size="small"
                  type="text"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(marker)
                      .then(() => message.success("关联标记已复制"))
                  }
                >
                  复制
                </Button>
              }
            />
          </label>
          <p>
            批次、任务和最小生产单元在生产平台内收集；产出带此标记回传，PMC
            只汇总输出及来源引用。
          </p>
        </div>
        {dialog === "output" && (
          <>
            <label className="experience-field">
              平台输出引用 / 外部批次 ID
              <Input
                value={externalId}
                onChange={(e) => {
                  setExternalId(e.target.value);
                  requestId.current = crypto.randomUUID();
                }}
                placeholder="填写已有平台输出的标识"
              />
            </label>
            {receipts.length > 0 && (
              <label className="experience-field">
                对应的上游领取
                <Select
                  allowClear
                  value={externalReceipt}
                  onChange={setExternalReceipt}
                  options={receipts.map((r) => ({
                    value: r.id,
                    label: `${r.at.slice(5, 16)} · 输入 ${quantity(flowQuantity(r.results))} ${r.results[0]?.unit || ""}`,
                  }))}
                />
              </label>
            )}
            <div className="experience-two-fields">
              <label className="experience-field">
                本次输出数量
                <InputNumber
                  min={1}
                  precision={0}
                  value={externalQuantity}
                  onChange={(x) => setExternalQuantity(x || 1)}
                />
              </label>
              <label className="experience-field">
                本次实际成本（元）
                <InputNumber
                  min={0}
                  value={externalCost}
                  onChange={(x) =>
                    setExternalCost(x == null ? null : Number(x))
                  }
                />
              </label>
            </div>
            <h4>平台已赋值的结果</h4>
            {target?.resultFields?.map((f) => (
              <label className="experience-field" key={f.key}>
                {f.key}
                {f.type === "boolean" ? (
                  <Switch
                    checkedChildren="是"
                    unCheckedChildren="否"
                    checked={externalFields[f.key] === true}
                    onChange={(x) =>
                      setExternalFields((a) => ({ ...a, [f.key]: x }))
                    }
                  />
                ) : f.type === "number" ? (
                  <InputNumber
                    value={Number(externalFields[f.key] || 0)}
                    onChange={(x) =>
                      setExternalFields((a) => ({ ...a, [f.key]: x || 0 }))
                    }
                  />
                ) : (
                  <Input
                    value={String(externalFields[f.key] || "")}
                    onChange={(e) =>
                      setExternalFields((a) => ({
                        ...a,
                        [f.key]: e.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </>
        )}
        <div className="experience-inline-note">
          当前为本地示意，未调用真实平台。一个输出引用内的准入赋值必须一致；混合质量结果请在平台拆开回传。回传不代表下游产出或客户验收。
        </div>
      </Modal>
    </div>
  );
}
