import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  ConfigProvider,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  applyNodeChanges,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { usePMC } from "../../api";
import {
  platforms,
  latest,
  type Chain,
  type ProductionNode,
  type ProductionVersion,
} from "../../../shared/production";
import {
  assertDag,
  validateFlowTopology,
  outputFields,
  pipeRows,
  defaultStages,
  type FlowRule,
  type PullReceipt,
} from "../../../shared/pull-flow";
import "./pull-flow.css";
const ops = {
  eq: "等于",
  ne: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  contains: "包含",
};
export function PullCanvas({
  businessId,
  chain,
  version: v,
  disabled,
  dirty,
  onChange,
  onPublished,
  onCopy,
  onVoid,
}: {
  businessId: string;
  chain: Chain;
  version: ProductionVersion;
  disabled: boolean;
  dirty: boolean;
  onChange: (v: ProductionVersion) => void;
  onPublished: (id: string) => void;
  onCopy: () => void;
  onVoid: () => void;
}) {
  const { state, command, busy } = usePMC(),
    { message, modal } = App.useApp();
  const p = state.production[businessId],
    b = state.businesses.find((b) => b.id === businessId)!;
  const [expanded, setExpanded] = useState(false);
  const [level, setLevel] = useState("execution"),
    [selected, setSelected] = useState(""),
    [edgeId, setEdgeId] = useState(""),
    [stagesOpen, setStagesOpen] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null),
    [nodes, setNodes] = useState<Node[]>([]),
    [count, setCount] = useState<number>(1),
    [picked, setPicked] = useState<React.Key[]>([]);
  const [edgeSelection, setEdgeSelection] = useState("");
  const [query, setQuery] = useState("");
  const [onlyRetained, setOnlyRetained] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false),
    [feedbackName, setFeedbackName] = useState("客户反馈"),
    [feedbackQuantity, setFeedbackQuantity] = useState(0),
    [feedbackText, setFeedbackText] = useState("");
  const fittedView = useRef("");
  const requestId = useRef(crypto.randomUUID()),
    current = useRef(v);
  current.current = v;
  const editable = !disabled && !busy;
  const operational =
    editable &&
    !dirty &&
    !chain.draft &&
    !!v.confirmedAt &&
    v.id === latest(chain).id;
  const target = v.nodes.find((n) => n.id === selected);
  const edge = v.edges.find((e) => `${e.from}:${e.to}` === edgeId);
  const candidates = edge ? pipeRows(p, chain.id, v, edge.from, edge.to) : null;
  const setGraph = (next: ProductionVersion) => {
    try {
      validateFlowTopology(next);
      onChange(next);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const changeNode = (patch: Partial<ProductionNode>) =>
    target &&
    setGraph({
      ...v,
      nodes: v.nodes.map((n) => (n.id === target.id ? { ...n, ...patch } : n)),
    });
  const call = (action: string, extra: object = {}) =>
    command(`production.flow.${action}`, {
      businessId,
      chainId: chain.id,
      versionId: v.id,
      ...extra,
    });
  useEffect(() => {
    setSelected("");
    setEdgeId("");
    setPicked([]);
  }, [v.id, chain.id]);
  const takenFor = (id: string) =>
    new Set(
      (p.pullReceipts || [])
        .filter((r) => r.chainId === chain.id && r.from === id)
        .flatMap((r) => r.resultIds),
    );
  const visibleNodes = useMemo(() => {
    if (level === "business")
      return (v.stages || defaultStages()).map((s, i) => {
        const group = v.nodes.filter((n) => n.stageId === s.id);
        const left = new Set(
          group.flatMap((n) =>
            (n.flowResults || [])
              .filter((r) => !takenFor(n.id).has(r.id))
              .map((r) => r.id),
          ),
        );
        return {
          id: s.id,
          position: { x: i * 330, y: 100 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: { width: 270 },
          data: {
            label: (
              <Tooltip
                title={`${s.name} · ${group.length} 个执行环节 · ${left.size} 项留存结果`}
              >
                <div className="pull-stage">
                  <small>业务阶段</small>
                  <strong>{s.name}</strong>
                  <span>
                    {group.length} 个环节 · {left.size} 项留存结果
                  </span>
                  <Button
                    size="small"
                    onClick={() => {
                      setLevel("execution");
                      flow?.fitView();
                    }}
                  >
                    展开执行环节
                  </Button>
                </div>
              </Tooltip>
            ),
          },
        };
      });
    const cards: Node[] = v.nodes.map((n) => {
      const rows = n.flowResults || [],
        taken = takenFor(n.id),
        remaining = rows.filter((r) => !taken.has(r.id)).length;
      return {
        id: n.id,
        position: n.position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: n.kind === "router" ? "pull-router-card" : "pull-platform-card",
        style: { width: 244 },
        data: {
          label: (
            <Tooltip
              title={
                <>
                  <b>{n.title}</b>
                  <div>
                    {n.kind === "router" ? "筛选与分配" : platforms[n.platform]}{" "}
                    · {v.stages?.find((s) => s.id === n.stageId)?.name}
                  </div>
                  <div>
                    已登记 {rows.length} {n.flowUnit} · 尚未向下游领取{" "}
                    {remaining}
                  </div>
                  <div>
                    {n.id === v.output
                      ? "正式交付汇总入口"
                      : v.edges.some((e) => e.from === n.id)
                        ? "下游按需取数"
                        : "留存结果，可按需接线"}
                  </div>
                </>
              }
            >
              <div className="pull-node">
                <div>
                  <Tag color={n.kind === "router" ? "purple" : "blue"}>
                    {n.kind === "router" ? "流转判断" : platforms[n.platform]}
                  </Tag>
                  {n.id === v.output && <Tag color="green">交付入口</Tag>}
                </div>
                <strong>{n.title}</strong>
                <small>{v.stages?.find((s) => s.id === n.stageId)?.name}</small>
                <div className="pull-node-counts">
                  <span>
                    {n.kind === "router" ? "输入" : "平台产出"} <b>{rows.length}</b>
                  </span>
                  <span>
                    未领取 <b>{remaining}</b>
                  </span>
                </div>
                {n.routingMode && n.routingMode !== "demand" && <small>已分配 {(p.flowAssignments || []).filter(a => a.chainId === chain.id && a.nodeId === n.id).length} · {n.routingMode === "ratio" ? "持续比例" : "赋值条件"}</small>}
                <small>
                  {v.edges.some((e) => e.from === n.id)
                    ? "下游主动领取"
                    : "结果留存 · 不强制继续处理"}
                </small>
              </div>
            </Tooltip>
          ),
        },
      };
    });
    const groups: Node[] = (v.stages || []).filter(stage => !v.nodes.length || v.nodes.some(n => n.stageId === stage.id && n.kind !== "router")).map((stage, i) => {
      const members = v.nodes.filter(n => n.stageId === stage.id && n.kind !== "router");
      const x = members.length ? Math.min(...members.map(n => n.position.x)) - 24 : i * 330;
      const y = members.length ? Math.min(...members.map(n => n.position.y)) - 55 : -100;
      const right = members.length ? Math.max(...members.map(n => n.position.x)) + 268 : x + 290;
      const bottom = members.length ? Math.max(...members.map(n => n.position.y)) + 260 : y + 180;
      return { id: `group:${stage.id}`, type: "group", position: { x,y }, selectable: false, draggable: editable, connectable: false, zIndex: -1, style: { width: right-x, height: bottom-y }, data: { label: stage.name }, ariaLabel: `业务分组：${stage.name}` };
    });
    // Group labels use the default renderer; handles are disabled above.
    return [...groups.map(g => ({...g, type: "default", className: "pull-business-group", data: { label: <strong>{(v.stages || []).find(s => g.id === `group:${s.id}`)?.name}</strong> }})), ...cards];
  }, [v, p.pullReceipts, p.flowAssignments, level]);
  useEffect(() => {
    setNodes(visibleNodes);
  }, [visibleNodes]);
  useEffect(() => {
    const key = `${level}:${expanded}:${chain.id}:${v.id}:${v.nodes.length}`;
    if (
      !flow ||
      fittedView.current === key ||
      !nodes.length ||
      nodes.some((n) => !n.measured?.width || !n.measured?.height) ||
      nodes.some((n) => !visibleNodes.some((x) => x.id === n.id))
    )
      return;
    const frame = requestAnimationFrame(() => {
      flow.fitView({ padding: 0.12, maxZoom: 1 });
      fittedView.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    flow,
    level,
    expanded,
    chain.id,
    v.id,
    v.nodes.length,
    nodes,
    visibleNodes,
  ]);
  const edges =
    level === "business"
      ? v.edges
          .map((e) => ({
            from: v.nodes.find((n) => n.id === e.from)?.stageId,
            to: v.nodes.find((n) => n.id === e.to)?.stageId,
          }))
          .filter(
            (e, i, a) =>
              e.from &&
              e.to &&
              e.from !== e.to &&
              a.findIndex((z) => z.from === e.from && z.to === e.to) === i,
          )
          .map((e) => ({
            id: `${e.from}:${e.to}`,
            source: e.from!,
            target: e.to!,
            markerEnd: { type: MarkerType.ArrowClosed },
          }))
      : v.edges.map((e) => {
          const stats = pipeRows(p, chain.id, v, e.from, e.to);
          return {
            id: `${e.from}:${e.to}`,
            source: e.from,
            target: e.to,
            markerEnd: { type: MarkerType.ArrowClosed },
            selected: edgeSelection === `${e.from}:${e.to}`,
            style: {
              stroke: stats.open ? "#557b98" : "#b2b8be",
              strokeWidth: 2,
            },
            label: `${stats.open ? "开放" : "关闭"} · 可取 ${stats.available.length}`,
            labelStyle: { fontSize: 12 },
            interactionWidth: 28,
          };
        });
  const add = (platform: string, position?: { x: number; y: number }) => {
    if (!editable) return;
    const id = crypto.randomUUID(),
      router = platform === "FLOW";
    const n: ProductionNode = {
      id,
      title: platforms[platform],
      platform,
      kind: router ? "router" : "platform",
      stageId: router
        ? "process"
        : platform === "RESOURCE" ||
            platform === "INTERNAL_SELECTION" ||
            platform === "COLLECTION"
          ? "source"
          : "process",
      platformRef: router ? "" : `模拟${platforms[platform]}项目`,
      flowUnit: b.unit,
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
      position: position || { x: v.nodes.length * 290, y: 80 },
      reports: [],
      reportHistory: [],
      corrections: {},
      batches: [],
      finalConfirmed: false,
      scopeVersion: 0,
    };
    if (!v.stages?.some((s) => s.id === n.stageId))
      n.stageId = v.stages?.[0]?.id;
    setGraph({ ...v, nodes: [...v.nodes, n] });
  };
  const deleteEdge = (id: string) => {
    const found = v.edges.find((e) => `${e.from}:${e.to}` === id);
    if (!found) return;
    setGraph({ ...v, edges: v.edges.filter((e) => e !== found) });
    setEdgeId("");
    setEdgeSelection("");
  };
  const editEdge = (patch: Partial<NonNullable<typeof edge>>) =>
    edge &&
    setGraph({
      ...v,
      edges: v.edges.map((e) => (e === edge ? { ...e, ...patch } : e)),
    });
  const save = () => call("save", { value: v });
  const platformUrl = (id: string) =>
    `/#/platform-results?businessId=${encodeURIComponent(businessId)}&chainId=${encodeURIComponent(chain.id)}&nodeId=${encodeURIComponent(id)}`;
  return (
    <ConfigProvider theme={{ components: { Select: { zIndexPopup: 1500 } } }}>
      <div className={`pull-workspace ${expanded ? "is-expanded" : ""}`}>
        <div className="pull-toolbar">
          <Space wrap>
            <strong>
              {chain.name} · R{v.revision}
            </strong>
            <Tag
              color={
                dirty || chain.draft
                  ? "gold"
                  : v.status === "RUNNING"
                    ? "green"
                    : "blue"
              }
            >
              {dirty || chain.draft
                ? "配置草稿"
                : v.status === "RUNNING"
                  ? "生产中"
                  : v.confirmedAt
                    ? "已发布"
                    : "待发布"}
            </Tag>
            <Button disabled={!editable} onClick={() => setStagesOpen(true)}>
              管理业务分组
            </Button>
            <Button
              onClick={() => flow?.fitView({ padding: 0.12, maxZoom: 1 })}
            >
              适应画布
            </Button>
            <Button onClick={() => setExpanded(!expanded)}>
              {expanded ? "退出全屏画布" : "全屏画布"}
            </Button>
          </Space>
          <Space wrap>
            <Button disabled={!editable || dirty} onClick={onCopy}>
              复制独立链路
            </Button>
            <Button disabled={!editable} danger onClick={onVoid}>
              作废链路
            </Button>
            <Button
              disabled={!editable || !dirty}
              onClick={async () => {
                await save();
                onPublished(v.id);
              }}
            >
              保存草稿
            </Button>
            <Button
              type="primary"
              disabled={
                !editable || (!dirty && !chain.draft && !!v.confirmedAt)
              }
              onClick={async () => {
                if (dirty) await save();
                const r = await command("production.publish", {
                  businessId,
                  chainId: chain.id,
                });
                onPublished(r.versionId);
              }}
            >
              发布编排
            </Button>
            <Button
              disabled={!operational}
              onClick={() =>
                command("production.control", {
                  businessId,
                  chainId: chain.id,
                  control: v.status === "RUNNING" ? "pause" : "start",
                })
              }
            >
              {v.status === "RUNNING" ? "暂停生产" : "开始 / 恢复生产"}
            </Button>
            {chain.draft && (
              <Button
                disabled={!editable}
                onClick={() =>
                  modal.confirm({
                    zIndex: 1400,
                    title: "放弃当前草稿？",
                    onOk: async () => {
                      await command("production.discard", {
                        businessId,
                        chainId: chain.id,
                      });
                      onPublished(v.id);
                    },
                  })
                }
              >
                放弃草稿
              </Button>
            )}
          </Space>
        </div>
        <p className="pull-help">
          {level === "business"
            ? "只展示业务阶段，展开可查看执行环节。所有层级均保持向前。"
            : "连线表示允许取数。下游主动领取，平台负责生产与赋值，未流转结果可以继续留存。"}
        </p>
        <div className="pull-canvas-row">
          {level === "execution" && (
            <aside className="pull-palette">
              <strong>添加环节</strong>
              <small>点击或拖入；放下后按需配置与接线</small>
              {Object.entries(platforms).map(([key, label]) => (
                <Button
                  key={key}
                  disabled={!editable}
                  draggable={editable}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/pmc-flow-platform", key)
                  }
                  onClick={() => add(key)}
                >
                  {label}
                </Button>
              ))}
            </aside>
          )}
          <div className="pull-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onInit={setFlow}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
              zoomOnScroll={false}
              panOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={level === "execution" && editable}
              nodesConnectable={level === "execution" && editable}
              deleteKeyCode={null}
              onNodesChange={(changes) =>
                setNodes((ns) => applyNodeChanges(changes, ns))
              }
              onNodeDragStop={(_, n) => {
                const now = current.current;
                if (n.id.startsWith("group:")) {
                  const before = visibleNodes.find(x=>x.id===n.id);
                  if (!before) return;
                  const dx=n.position.x-before.position.x, dy=n.position.y-before.position.y;
                  setGraph({...now,nodes:now.nodes.map(x=>x.stageId===n.id.slice(6) && x.kind!=="router" ? {...x,position:{x:x.position.x+dx,y:x.position.y+dy}} : x)});
                  return;
                }
                setGraph({
                  ...now,
                  nodes: now.nodes.map((x) =>
                    x.id === n.id ? { ...x, position: n.position } : x,
                  ),
                });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const platform = e.dataTransfer.getData(
                  "application/pmc-flow-platform",
                );
                if (platforms[platform])
                  add(
                    platform,
                    flow?.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                  );
              }}
              onNodeClick={(_, n) => {
                if (n.id.startsWith("group:")) { if (editable) setStagesOpen(true); return; }
                if (level === "business") {
                  setLevel("execution");
                  return;
                }
                setSelected(n.id);
                setEdgeId("");
              }}
              onEdgeClick={(_, e) => {
                if (level === "execution") {
                  setEdgeId(e.id);
                  setEdgeSelection(e.id);
                  setSelected("");
                  setPicked([]);
                  requestId.current = crypto.randomUUID();
                }
              }}
              onConnect={(c) => {
                if (!editable || !c.source || !c.target) return;
                setGraph({
                  ...v,
                  nodes: v.nodes.map(n => n.id === c.source && n.routingMode === "ratio" ? {...n, branchWeights:{...n.branchWeights,[c.target!]:1}} : n),
                  edges: [
                    ...v.edges,
                    {
                      from: c.source,
                      to: c.target,
                      rules: [],
                      initiallyOpen: true,
                    },
                  ],
                });
              }}
            >
              <Background gap={20} color="#d5e1eb" />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>
        {level === "execution" && (
          <Space className="pull-footer" wrap>
            <span>
              {v.nodes.length} 个环节 · {v.edges.length} 条管道
            </span>
            <span>
              点击节点查看记录与配置；点击连线查看池子统计、筛选及开关。
            </span>
            {edgeSelection && (
              <Button
                danger
                disabled={!editable}
                onClick={() => deleteEdge(edgeSelection)}
              >
                删除所选连线
              </Button>
            )}
          </Space>
        )}
        <Drawer
          zIndex={1300}
          width={600}
          title={target?.title || "节点详情"}
          open={!!target}
          onClose={() => setSelected("")}
        >
          {target && (
            <>
              <Descriptions
                size="small"
                column={2}
                items={[
                  {
                    key: "type",
                    label: "类型",
                    children:
                      target.kind === "router"
                        ? "流转判断"
                        : platforms[target.platform],
                  },
                  { key: "unit", label: "单位", children: target.flowUnit },
                  {
                    key: "count",
                    label: target.kind === "router" ? "输入结果" : "平台实际产出",
                    children: target.flowResults?.length || 0,
                  },
                  {
                    key: "delivery",
                    label: "角色",
                    children:
                      target.id === v.output ? "正式交付汇总入口" : "业务环节",
                  },
                ]}
              />
              {target.kind === "platform" && <Alert type="info" showIcon message="真实执行平台未接入" description="本地入口用于配置关联和模拟执行；不创建真实外部执行器。" />}
              {target.kind === "router" && <section className="pull-routing-settings">
                <h4>分流方式</h4>
                <Select style={{ width: "100%" }} disabled={!editable} value={target.routingMode || "demand"} options={[{value:"demand",label:"按需取数 · 下游主动领取"},{value:"ratio",label:"持续比例分配 · 规则待确认"},{value:"condition",label:"按上游赋值条件分配"}]} onChange={routingMode => changeNode({routingMode, branchWeights: Object.fromEntries(v.edges.filter(e => e.from === target.id).map(e => [e.to,target.branchWeights?.[e.to] || 1]))})} />
                {target.routingMode === "ratio" && <>
                  <p>多个上游先汇入同一缓冲池。池内序列、批次边界与余数策略待确认；本配置仅可保存草稿，暂不能发布或运行。</p>
                  {v.edges.filter(e => e.from === target.id).map(e => <label key={e.to} className="pull-weight">{v.nodes.find(n=>n.id===e.to)?.title}<InputNumber min={1} max={10000} precision={0} disabled={!editable} value={target.branchWeights?.[e.to] || 1} onChange={weight => changeNode({branchWeights:{...target.branchWeights,[e.to]:weight || 1}})} /></label>)}
                </>}
                {target.routingMode === "condition" && <p>点击出边设置赋值条件。仅命中一条支路时分配；缺字段、无命中或多支命中均留存，不加工数据。</p>}
                <p>分配不等于领取或产出；支路繁忙或关闭不改派份额。</p>
              </section>}
              <div className="pull-form">
                <label>
                  环节名称
                  <Input
                    disabled={!editable}
                    value={target.title}
                    onChange={(e) => changeNode({ title: e.target.value })}
                  />
                </label>
                <label>
                  业务阶段
                  <Select
                    disabled={!editable}
                    value={target.stageId}
                    options={v.stages?.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    onChange={(stageId) => changeNode({ stageId })}
                  />
                </label>
                {target.kind === "platform" && (
                  <label>
                    关联下游项目
                    <Input
                      disabled={!editable || !!target.flowResults?.length}
                      value={target.platformRef}
                      onChange={(e) =>
                        changeNode({ platformRef: e.target.value })
                      }
                    />
                  </label>
                )}
                {target.kind === "platform" && (
                  <label>
                    平台取数单位
                    <Input
                      disabled={!editable}
                      value={target.inputUnit || target.flowUnit}
                      onChange={(e) =>
                        changeNode({ inputUnit: e.target.value })
                      }
                    />
                  </label>
                )}
                <label>
                  结果单位
                  <Input
                    disabled={!editable || !!target.flowResults?.length}
                    value={target.flowUnit}
                    onChange={(e) => changeNode({ flowUnit: e.target.value })}
                  />
                </label>
                <label>
                  取数准入：必要字段
                  <Select
                    mode="multiple"
                    disabled={!editable}
                    value={target.requiredFields || []}
                    options={[
                      ...new Set([
                        ...(target.resultFields || []).map((f) => f.key),
                        ...v.edges
                          .filter((e) => e.to === target.id)
                          .flatMap((e) =>
                            outputFields(v, e.from).map((f) => f.key),
                          ),
                      ]),
                    ].map((key) => ({ value: key, label: key }))}
                    onChange={(requiredFields) =>
                      changeNode({ requiredFields })
                    }
                  />
                </label>
                <Checkbox
                  disabled={
                    !editable ||
                    target.kind !== "router" ||
                    !!v.edges.find((e) => e.from === target.id)
                  }
                  checked={v.output === target.id}
                  onChange={(e) =>
                    setGraph({
                      ...v,
                      output: e.target.checked ? target.id : "",
                    })
                  }
                >
                  设为正式交付汇总入口
                </Checkbox>
              </div>
              <Space wrap>
                {target.kind === "platform" && (
                  <Button
                    disabled={!v.confirmedAt || dirty || !!chain.draft}
                    href={platformUrl(target.id)}
                    target="_blank"
                  >
                    打开本地下游平台
                  </Button>
                )}
                <Button
                  danger
                  disabled={!editable}
                  onClick={() =>
                    modal.confirm({
                      zIndex: 1400,
                      title: "移除此环节及关联连线？",
                      content: "已保存的历史结果与领取记录继续保留。",
                      onOk: () => {
                        setGraph({
                          ...v,
                          nodes: v.nodes.filter((n) => n.id !== target.id),
                          edges: v.edges.filter(
                            (e) => e.from !== target.id && e.to !== target.id,
                          ),
                          output: v.output === target.id ? "" : v.output,
                        });
                        setSelected("");
                      },
                    })
                  }
                >
                  移除节点
                </Button>
              </Space>
              <h4>下游向上游取数</h4>
              {v.edges
                .filter((e) => e.to === target.id)
                .map((e) => (
                  <Button
                    key={e.from}
                    onClick={() => {
                      setEdgeId(`${e.from}:${e.to}`);
                      setSelected("");
                      setPicked([]);
                    }}
                  >
                    从 {v.nodes.find((n) => n.id === e.from)?.title} 取数
                  </Button>
                ))}
              <h4>池子概况</h4>
              <Space wrap>
                <Tag>{target.kind === "router" ? "输入结果" : "平台实际产出"} {target.flowResults?.length || 0}</Tag>
                <Tag color="purple">已分配 {(p.flowAssignments || []).filter(a => a.chainId === chain.id && a.nodeId === target.id).length}</Tag>
                <Tag color="blue">待领取 {(p.flowAssignments || []).filter(a => a.chainId === chain.id && a.nodeId === target.id && !takenFor(target.id).has(a.resultId)).length}</Tag>
                <Tag color="green">已领取 {takenFor(target.id).size}</Tag>
              </Space>
              <details className="pull-result-query"><summary>查询逐条结果与留存原因</summary>
              <Space style={{ marginBottom: 12 }}>
                <Input.Search
                  placeholder="搜索结果标识或平台赋值"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Checkbox
                  checked={onlyRetained}
                  onChange={(e) => setOnlyRetained(e.target.checked)}
                >
                  只看留存
                </Checkbox>
              </Space>
              <Table
                size="small"
                rowKey="id"
                dataSource={(target.flowResults || []).filter(
                  (r) =>
                    (!onlyRetained || !takenFor(target.id).has(r.id)) &&
                    JSON.stringify([r.externalId, r.fields])
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )}
                pagination={{ pageSize: 6 }}
                columns={[
                  { title: "平台结果", dataIndex: "externalId" },
                  { title: "赋值", render: (_, r) => JSON.stringify(r.fields) },
                  {
                    title: "流转状态",
                    render: (_, r) =>
                      takenFor(target.id).has(r.id)
                        ? "已向下游领取"
                        : (p.flowAssignments || []).some(a => a.chainId === chain.id && a.nodeId === target.id && a.resultId === r.id) ? "已分配 · 待下游领取"
                        : target.id === v.output
                          ? "交付准入"
                          : "留存",
                  },
                  {
                    title: "来源",
                    render: (_, r) =>
                      r.sourceIds.length
                        ? `${r.sourceIds.length} 条输入`
                        : "平台来源",
                  },
                ]}
              />
              </details>
              {target.id === v.output && (
                <Button
                  disabled={!operational}
                  onClick={() => setFeedbackOpen(true)}
                >
                  登记客户反馈批次
                </Button>
              )}
              <h4>领取报告 · 不代表平台已产出</h4>
              <Table<PullReceipt>
                size="small"
                rowKey="id"
                dataSource={(p.pullReceipts || []).filter(
                  (r) =>
                    r.chainId === chain.id &&
                    (r.to === target.id || r.from === target.id),
                )}
                pagination={{ pageSize: 5 }}
                columns={[
                  { title: "时间", dataIndex: "at" },
                  {
                    title: "流向",
                    render: (_, r) =>
                      `${v.nodes.find((n) => n.id === r.from)?.title || r.from} → ${v.nodes.find((n) => n.id === r.to)?.title || r.to}`,
                  },
                  { title: "数量", render: (_, r) => r.resultIds.length },
                ]}
              />
            </>
          )}
        </Drawer>
        <Drawer
          zIndex={1300}
          width={680}
          title="管道与池子统计"
          open={!!edge}
          onClose={() => setEdgeId("")}
        >
          {edge && candidates && (
            <>
              <p>
                <b>
                  {v.nodes.find((n) => n.id === edge.from)?.title} →{" "}
                  {v.nodes.find((n) => n.id === edge.to)?.title}
                </b>
              </p>
              <Space>
                <Tag>{candidates.eligible.length} 条符合条件</Tag>
                <Tag color="blue">{candidates.available.length} 条尚可领取</Tag>
                <Tag>
                  {candidates.rows.filter((r) => r.taken).length} 条已被下游领取
                </Tag>
                <Tag color="orange">
                  {candidates.rows.filter((r) => !!r.reason).length}{" "}
                  条不满足本管道准入
                </Tag>
              </Space>
              <p>
                <Switch
                  checked={candidates.open}
                  disabled={!operational}
                  checkedChildren="管道开放"
                  unCheckedChildren="管道关闭"
                  onChange={(open) =>
                    call("gate", { from: edge.from, to: edge.to, open })
                  }
                />{" "}
                <small>关闭仅停止新取数，已领取批次继续执行。</small>
              </p>
              <h4>筛选条件（同时满足）</h4>
              {(edge.rules || []).map((rule, i) => {
                const field = outputFields(v, edge.from).find(
                  (f) => f.key === rule.field,
                );
                const update = (patch: Partial<FlowRule>) =>
                  editEdge({
                    rules: edge.rules!.map((r, j) =>
                      j === i ? { ...r, ...patch } : r,
                    ),
                  });
                return (
                  <Space className="pull-rule" key={i}>
                    <span>{rule.field}</span>
                    <Select
                      disabled={!editable}
                      value={rule.operator}
                      style={{ width: 110 }}
                      options={Object.entries(ops)
                        .filter(([op]) =>
                          field?.type === "number"
                            ? op !== "contains"
                            : [
                                "eq",
                                "ne",
                                ...(field?.type === "text" ? ["contains"] : []),
                              ].includes(op),
                        )
                        .map(([value, label]) => ({ value, label }))}
                      onChange={(operator) => update({ operator })}
                    />
                    {field?.type === "boolean" ? (
                      <Select
                        disabled={!editable}
                        value={rule.value as boolean}
                        options={
                          [
                            { value: true, label: "是" },
                            { value: false, label: "否" },
                          ] as any
                        }
                        onChange={(value) => update({ value })}
                      />
                    ) : field?.type === "number" ? (
                      <InputNumber
                        disabled={!editable}
                        value={Number(rule.value)}
                        onChange={(value) => update({ value: value ?? 0 })}
                      />
                    ) : (
                      <Input
                        disabled={!editable}
                        value={String(rule.value)}
                        onChange={(e) => update({ value: e.target.value })}
                      />
                    )}
                    <Button
                      disabled={!editable}
                      onClick={() =>
                        editEdge({
                          rules: edge.rules!.filter((_, j) => j !== i),
                        })
                      }
                    >
                      移除
                    </Button>
                  </Space>
                );
              })}
              <Select
                placeholder="添加平台已有字段条件"
                value={undefined}
                style={{ width: "100%" }}
                disabled={!editable}
                options={outputFields(v, edge.from).map((f) => ({
                  value: f.key,
                  label: f.key,
                }))}
                onChange={(field) => {
                  const f = outputFields(v, edge.from).find(
                    (f) => f.key === field,
                  )!;
                  editEdge({
                    rules: [
                      ...(edge.rules || []),
                      {
                        field,
                        operator: "eq",
                        value:
                          f.type === "number"
                            ? 0
                            : f.type === "boolean"
                              ? true
                              : "待设置",
                      },
                    ],
                  });
                }}
              />
              {(!v.confirmedAt ||
                !latest(chain).edges.some(
                  (e) => e.from === edge.from && e.to === edge.to,
                )) && (
                <p>
                  <Checkbox
                    disabled={!editable}
                    checked={edge.initiallyOpen !== false}
                    onChange={(e) =>
                      editEdge({ initiallyOpen: e.target.checked })
                    }
                  >
                    发布后允许按规则请求取数
                  </Checkbox>
                </p>
              )}
              <h4>可筛选、部分领取</h4>
              {(!operational || v.status !== "RUNNING") && (
                <Alert
                  type="info"
                  message="保存并发布编排、开始生产后，可在此模拟下游请求取数。"
                />
              )}
              <Table
                size="small"
                rowKey={(r) => r.row.id}
                dataSource={candidates.rows}
                pagination={{ pageSize: 8 }}
                rowSelection={{
                  selectedRowKeys: picked,
                  onChange: (keys) => {
                    setPicked(keys);
                    requestId.current = crypto.randomUUID();
                  },
                  getCheckboxProps: (r) => ({
                    disabled: !!r.reason || r.taken,
                  }),
                }}
                columns={[
                  { title: "结果标识", render: (_, r) => r.row.externalId },
                  {
                    title: "平台赋值",
                    render: (_, r) => JSON.stringify(r.row.fields),
                  },
                  {
                    title: "状态",
                    render: (_, r) =>
                      r.taken ? "已领取" : r.reason || "可领取",
                  },
                ]}
              />
              <Space wrap>
                <InputNumber
                  aria-label="取数数量"
                  min={1}
                  value={count}
                  onChange={(value) => {
                    setCount(value || 1);
                    requestId.current = crypto.randomUUID();
                  }}
                />
                <Button
                  type="primary"
                  disabled={
                    !operational ||
                    v.status !== "RUNNING" ||
                    !candidates.open ||
                    !candidates.available.length
                  }
                  onClick={async () => {
                    await call("pull", {
                      from: edge.from,
                      to: edge.to,
                      requestId: requestId.current,
                      ...(picked.length ? { resultIds: picked } : { count }),
                    });
                    requestId.current = crypto.randomUUID();
                    setPicked([]);
                    message.success("已记录下游领取，实际执行在下游平台完成");
                  }}
                >
                  {picked.length
                    ? `领取选中 ${picked.length} 条`
                    : "按数量领取"}
                </Button>
                <Button
                  danger
                  disabled={!editable}
                  onClick={() => deleteEdge(edgeId)}
                >
                  删除此连线
                </Button>
              </Space>
              <p className="pull-help">
                本池为连线结果的统计，不复制数据。不满足条件的记录仍留在上游，是否另接分支或再次处理由项目经理决定。
              </p>
            </>
          )}
        </Drawer>
        <Modal
          zIndex={1400}
          title="登记客户反馈批次"
          open={feedbackOpen}
          onCancel={() => setFeedbackOpen(false)}
          onOk={async () => {
            await call("feedback", {
              name: feedbackName,
              quantity: feedbackQuantity,
              feedback: feedbackText,
            });
            setFeedbackOpen(false);
          }}
        >
          <p>
            客户反馈与正式验收分别登记，正式验收仍需在“交付与客户验收”选择已交付来源。
          </p>
          <Input
            aria-label="客户反馈批次名称"
            value={feedbackName}
            onChange={(e) => setFeedbackName(e.target.value)}
          />
          <InputNumber
            aria-label="客户接受数量"
            min={0}
            value={feedbackQuantity}
            onChange={(x) => setFeedbackQuantity(x || 0)}
          />
          <Input.TextArea
            aria-label="客户反馈说明"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
        </Modal>
        <Modal
          zIndex={1400}
          title="业务分组"
          open={stagesOpen}
          onCancel={() => setStagesOpen(false)}
          onOk={() => setStagesOpen(false)}
        >
          <p>调整名称和归属不会改写平台批次。阶段汇总同样禁止循环。</p>
          {v.stages?.map((s) => (
            <Space className="pull-rule" key={s.id}>
              <Input
                disabled={!editable}
                aria-label="阶段名称"
                value={s.name}
                onChange={(e) =>
                  onChange({
                    ...v,
                    stages: v.stages!.map((a) =>
                      a.id === s.id ? { ...a, name: e.target.value } : a,
                    ),
                  })
                }
              />
              <Button
                disabled={!editable || v.nodes.some((n) => n.stageId === s.id)}
                onClick={() =>
                  setGraph({
                    ...v,
                    stages: v.stages!.filter((a) => a.id !== s.id),
                  })
                }
              >
                删除
              </Button>
            </Space>
          ))}
          <Button
            disabled={!editable}
            onClick={() =>
              setGraph({
                ...v,
                stages: [
                  ...(v.stages || []),
                  { id: crypto.randomUUID(), name: "新业务阶段" },
                ],
              })
            }
          >
            添加阶段
          </Button>
        </Modal>
      </div>
    </ConfigProvider>
  );
}
