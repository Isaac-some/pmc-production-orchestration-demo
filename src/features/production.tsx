/** F08–F12 engineering workspace; no embedded prototype or global patches. */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Dropdown,
  Tooltip,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from "antd";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  type Connection,
  type Node,
  applyNodeChanges,
  type ReactFlowInstance,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  DatabaseOutlined,
  AimOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  TeamOutlined,
  ApartmentOutlined,
  PlusOutlined,
  MinusOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CompressOutlined,
  CopyOutlined,
  PushpinOutlined,
  LeftOutlined,
  RightOutlined,
  UpOutlined,
  DownOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import "./production.css";
import { usePMC } from "../api";
import {
  platforms,
  productionData,
  productionFacts,
  latest,
  money,
  dynamicPlan,
  scopeKey,
  type ProductionVersion,
  type ProductionNode,
} from "../../shared/production";
import { day } from "../../shared/types";
import { PullCanvas } from "./production/PullCanvas";
import { ProductionExperience } from "./production/Experience";
import { NodeEditor } from "./production/NodeEditor";
import { DeliveryPanel } from "./production/Delivery";
import { PlatformTasks } from "./production/Tasks";
import {
  BaselinePanel,
  BaselinePreview,
  previewProductionBaseline,
} from "./production/Baseline";
import { ProductionHistory } from "./production/History";
export function ProductionPanel({
  businessId,
  embedded = false,
  onProjectNavigate,
}: {
  businessId: string;
  embedded?: boolean;
  onProjectNavigate?: (key: string) => void;
}) {
  return (
    <ProductionExperience
      businessId={businessId}
      embedded={embedded}
      onProjectNavigate={onProjectNavigate}
      legacy={<LegacyProductionPanel businessId={businessId} />}
    />
  );
}
function LegacyProductionPanel({ businessId }: { businessId: string }) {
  const { state, command, user } = usePMC(),
    { modal: confirm } = App.useApp(),
    b = state.businesses.find((b) => b.id === businessId)!,
    p = productionData(state, businessId),
    facts = useMemo(
      () => productionFacts(state, businessId),
      [state, businessId],
    );
  const [chainId, setChainId] = useState(
      p.chains.find(
        (ch) =>
          ch.id ===
          new URLSearchParams(window.location.hash.split("?")[1]).get(
            "chainId",
          ),
      )?.id ||
        p.chains.find((ch) => !ch.voided)?.id ||
        p.chains[0]?.id ||
        "",
    ),
    [versionId, setVersionId] = useState(""),
    [view, setView] = useState("canvas"),
    [selected, setSelected] = useState(""),
    [editing, setEditing] = useState(false),
    [local, setLocal] = useState<ProductionVersion | null>(null),
    [dialog, setDialog] = useState(""),
    [form] = Form.useForm(),
    [budgetChain, setBudgetChain] = useState(""),
    [deepLinkWarning, setDeepLinkWarning] = useState("");
  const [baselinePreview, setBaselinePreview] = useState<any>(null);
  const previewBaseline = () => {
    try {
      if (v)
        setBaselinePreview({ ...previewProductionBaseline(v), unit: b.unit });
    } catch (e: any) {
      confirm.error({ title: "无法预览基线", content: e.message });
    }
  };
  const [paletteOpen, setPaletteOpen] = useState(true),
    [palettePinned, setPalettePinned] = useState(true),
    [expanded, setExpanded] = useState(false),
    [flow, setFlow] = useState<ReactFlowInstance | null>(null),
    [zoom, setZoom] = useState(1);
  const [legacyNodes, setLegacyNodes] = useState<Node[]>([]);
  const [legacyEdges, setLegacyEdges] = useState<string[]>([]);
  const [params] = useSearchParams(),
    link = params.toString();
  const ch = p.chains.find((ch) => ch.id === chainId),
    persisted =
      ch && (ch.versions.find((v) => v.id === versionId) || latest(ch)),
    base = ch?.draft && persisted?.id === latest(ch).id ? ch.draft : persisted,
    v = local || base;
  const disabled =
    b.completed ||
    b.stage === "LOST" ||
    (user.role !== "pm" && user.role !== "approver") ||
    (user.role === "pm" && user.id !== b.ownerId) ||
    !!ch?.voided ||
    (!!persisted && persisted.id !== latest(ch!).id);
  const dirty = !!local && JSON.stringify(local) !== JSON.stringify(base);
  useEffect(() => {
    if (!p.chains.some((ch) => ch.id === chainId))
      setChainId(
        p.chains.find((ch) => !ch.voided)?.id || p.chains[0]?.id || "",
      );
    setLocal(null);
  }, [chainId, versionId, businessId]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const selectNode = v?.nodes.find((n) => n.id === selected);
  const guard = (fn: () => void) => {
    if (dirty)
      confirm.confirm({
        title: "当前编排有未保存修改",
        content: "切换前可先保存草稿；确认放弃本次尚未保存的修改？",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: () => {
          setLocal(null);
          setSelected("");
          fn();
        },
      });
    else {
      setSelected("");
      fn();
    }
  };
  useEffect(() => {
    const query = new URLSearchParams(link),
      pid = query.get("pid"),
      nodeId = query.get("nodeId");
    if (!nodeId || (pid && pid !== businessId && pid !== String(b.pid))) return;
    const requestedChain = query.get("chainId"),
      requestedVersion = query.get("versionId");
    const targetChain = p.chains.find((ch) =>
      requestedChain
        ? ch.id === requestedChain
        : ch.versions.some(
            (v) =>
              (!requestedVersion || v.id === requestedVersion) &&
              v.nodes.some((n) => n.id === nodeId),
          ),
    );
    const targetVersion =
      targetChain &&
      (requestedVersion
        ? targetChain.versions.find((v) => v.id === requestedVersion)
        : latest(targetChain));
    const targetNode = targetVersion?.nodes.find((n) => n.id === nodeId);
    if (!targetChain || !targetVersion || !targetNode) {
      setDeepLinkWarning(
        "风险所引用的生产链路、修订或节点已失效，请在版本与审计中核对原来源。",
      );
      return;
    }
    const source = query.get("scopeKey"),
      warnings: string[] = [];
    if (targetChain.voided)
      warnings.push("该生产链路已作废，当前仅展示只读记录。");
    if (targetVersion.id !== latest(targetChain).id)
      warnings.push(
        "风险引用历史修订，当前以只读方式打开；请切换最新修订后编辑。",
      );
    if (source && source !== scopeKey(targetChain.id, targetNode))
      warnings.push(
        "风险引用的节点生产范围已变化，请核对当前范围及风险原始证据。",
      );
    guard(() => {
      setChainId(targetChain.id);
      setVersionId(targetVersion.id);
      setSelected(nodeId);
      setEditing(true);
      setView("canvas");
      setDeepLinkWarning(warnings.join(" "));
    });
  }, [link, businessId]);
  const save = async (value = v!) => {
    await command(
      value.mode === "pull" ? "production.flow.save" : "production.draft",
      {
        businessId,
        chainId,
        versionId: persisted!.id,
        value,
      },
    );
    setLocal(null);
  };
  const open = (type: string, values: any = {}) => {
    form.resetFields();
    form.setFieldsValue(values);
    setDialog(type);
  };
  const patch = (value: ProductionVersion) => setLocal(value);
  function add(platform: string, position?: { x: number; y: number }) {
    if (!v) return;
    if (!palettePinned) setPaletteOpen(false);
    const n: ProductionNode = {
      id: crypto.randomUUID(),
      title:
        platforms[platform] +
        " " +
        (v.nodes.filter((n) => n.platform === platform).length + 1),
      platform,
      note: "",
      taskId: "",
      selected: [],
      dailyPlan: null,
      position: position ?? { x: 50 + v.nodes.length * 300, y: 80 },
      reports: [],
      reportHistory: [],
      corrections: {},
      batches: [],
      finalConfirmed: false,
      scopeVersion: 0,
    };

    patch({
      ...v,
      nodes: [...v.nodes, n],
      edges: v.edges,
      inputs: v.inputs.length
        ? v.inputs
        : platform !== "COLLECTION"
          ? [n.id]
          : [],
      output: v.output,
    });
    setSelected(n.id);
    setEditing(false);
  }
  const fmt = (n: number | null | undefined) =>
    n == null ? "待回传" : n.toLocaleString("zh-CN");
  const status = ch?.voided
    ? "已作废"
    : dirty || ch?.draft
      ? "配置草稿"
      : v
        ? {
            DRAFT: "待配置",
            CONFIRMED: "已确认",
            RUNNING: "生产中",
            PAUSED: "已暂停",
          }[v.status]
        : "待配置";
  const activeChains = p.chains.filter((c) => !c.voided);
  const chainFacts = (id: string) =>
    facts.nodes.filter((n) => n.chainId === id);
  const chainCost = (id: string): number | null =>
    !chainFacts(id).length
      ? null
      : chainFacts(id).reduce(
          (sum: number | null, n: any) =>
            sum == null || n.cost == null ? null : sum + n.cost,
          0,
        );
  const sumKnown = (values: (number | null | undefined)[]): number | null =>
    values.length && values.every((x) => x != null)
      ? values.reduce<number>((sum, x) => sum + x!, 0)
      : null;
  const chainOutput = (id: string) =>
    sumKnown(
      chainFacts(id)
        .filter((n) => n.terminal)
        .map((n) => n.output),
    );
  const projectOutput = sumKnown(
    facts.nodes.filter((n) => n.terminal).map((n) => n.output),
  );
  const reports = (n: ProductionNode) =>
    n.reports.filter(
      (r) =>
        r.kind === "production" &&
        [...r.selected].sort().join("|") === [...n.selected].sort().join("|"),
    );
  const sumReports = (
    n: ProductionNode,
    field: "input" | "processing" | "eliminated",
  ) =>
    reports(n).length ? reports(n).reduce((sum, r) => sum + r[field], 0) : null;
  const currentInput =
    v?.mode === "pull"
      ? v.nodes
          .filter(
            (n) => n.kind === "platform" && !v.edges.some((e) => e.to === n.id),
          )
          .every(
            (n) =>
              n.flowUnit ===
              state.businesses.find((b) => b.id === businessId)?.unit,
          )
        ? v.nodes
            .filter(
              (n) =>
                n.kind === "platform" && !v.edges.some((e) => e.to === n.id),
            )
            .reduce((sum, n) => sum + (n.flowResults?.length || 0), 0)
        : null
      : v
        ? sumKnown(
            v.nodes
              .filter((n) => v.inputs.includes(n.id))
              .map((n) => sumReports(n, "input")),
          )
        : null;
  const currentOutput =
    v?.mode === "pull"
      ? (v.nodes.find((n) => n.id === v.output)?.flowResults?.length ?? 0)
      : v
        ? (facts.nodes.find(
            (n) =>
              n.chainId === ch?.id &&
              n.id === v.output &&
              n.scopeKey ===
                scopeKey(
                  ch!.id,
                  v.nodes.find((n) => n.id === v.output)!,
                ),
          )?.output ?? null)
        : null;
  const icons: Record<string, React.ReactNode> = {
    RESOURCE: <DatabaseOutlined />,
    INTERNAL_SELECTION: <AimOutlined />,
    COLLECTION: <FolderOpenOutlined />,
    MACHINE_LABELING: <RobotOutlined />,
    AGENT_LABELING: <RobotOutlined />,
    MANUAL_LABELING: <TeamOutlined />,
    CROWDSOURCING: <ApartmentOutlined />,
  };
  const progress = (
    value: number | null,
    target: number | null,
    label: string,
  ) => (
    <div
      className="production-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={
        target && value != null ? Math.min(100, (value / target) * 100) : 0
      }
    >
      <span
        style={{
          width: `${target && value != null ? Math.min(100, (value / target) * 100) : 0}%`,
        }}
      />
    </div>
  );
  const moveSelected = (x: number, y: number) => {
    if (disabled || !v || !selected) return;
    patch({
      ...v,
      nodes: v.nodes.map((n) =>
        n.id === selected
          ? { ...n, position: { x: n.position.x + x, y: n.position.y + y } }
          : n,
      ),
    });
  };
  const flowNodes = useMemo(
    () =>
      v?.nodes.map((n) => {
        const fact = facts.nodes.find(
          (f) =>
            f.chainId === ch?.id &&
            f.id === n.id &&
            f.scopeKey === scopeKey(ch!.id, n),
        );
        const input = sumReports(n, "input"),
          output = fact?.output ?? null;
        const today = fact?.daily.find((d: any) => d.date === day())?.quantity;
        const plan =
          v.baseline?.rows.find((r: any) => r.nodeId === n.id)?.dailyOutput ??
          n.dailyPlan;
        const rate = today != null && plan ? (today / plan) * 100 : null;
        return {
          id: n.id,
          width: 232,
          height: 168,
          position: n.position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: `production-flow-node ${n.taskId && n.selected.length ? "is-ready" : ""}`,
          data: {
            label: (
              <Tooltip
                title={`${n.title} · ${platforms[n.platform]} · 输入 ${fmt(input)} · 产出 ${fmt(output)} · ${n.selected.length} 项范围`}
              >
                <div
                  className="production-node"
                  title={`${n.title} · ${platforms[n.platform]} · ${n.selected.length} 项范围`}
                >
                  <div className="production-node-heading">
                    <span className="production-node-icon">
                      {icons[n.platform]}
                    </span>
                    <span>
                      <strong>{n.title}</strong>
                      <small>
                        {v.inputs.includes(n.id)
                          ? "输入源头"
                          : v.output === n.id
                            ? "最终输出"
                            : "中间节点"}
                      </small>
                    </span>
                    <span className="production-node-status">
                      {n.platform === "COLLECTION"
                        ? "仅展示"
                        : n.taskId && n.selected.length
                          ? "配置就绪"
                          : "待配置"}
                    </span>
                  </div>
                  <div className="production-node-metrics">
                    {[
                      ["输入", input, ""],
                      [
                        v.output === n.id ? "末端输出" : "已分配",
                        output,
                        "output",
                      ],
                      ["处理中", sumReports(n, "processing"), "processing"],
                      ["已淘汰", sumReports(n, "eliminated"), ""],
                    ].map(([label, value, color]) => (
                      <span className={String(color)} key={String(label)}>
                        <small>{label}</small>
                        <b>{fmt(value as number | null)}</b>
                      </span>
                    ))}
                  </div>
                  <div className="production-node-bottom">
                    <span
                      className={rate != null && rate >= 100 ? "is-good" : ""}
                    >
                      ● 日达标 {rate == null ? "待核对" : rate.toFixed(1) + "%"}
                    </span>
                    <span title="输出率 = 当前节点总输入 ÷ 已向下游分配量；最终输出节点以末端实际输出为出口量。">
                      输出率{" "}
                      <b>
                        {input && output
                          ? ((input / output) * 100).toFixed(1) + "%"
                          : "—"}
                      </b>
                    </span>
                  </div>
                </div>
              </Tooltip>
            ),
          },
          selected: n.id === selected,
          style: { width: 232, height: 168 },
        };
      }) || [],
    [v, selected, facts.nodes, ch?.id],
  );
  useEffect(() => setLegacyNodes(flowNodes), [flowNodes]);
  const removeEdges = (ids: string[]) => {
    if (!v || disabled) return;
    const removed = v.edges.filter((e) => ids.includes(e.from + "-" + e.to));
    patch({
      ...v,
      edges: v.edges.filter((e) => !removed.includes(e)),
      allocations: Object.fromEntries(
        Object.entries(v.allocations).map(([id, a]) => [
          id,
          removed.some((e) => e.from === id)
            ? {
                ...a,
                confirmed: false,
                values: Object.fromEntries(
                  Object.entries(a.values).filter(
                    ([to]) =>
                      !removed.some((e) => e.from === id && e.to === to),
                  ),
                ),
                conditions: Object.fromEntries(
                  Object.entries(a.conditions).filter(
                    ([to]) =>
                      !removed.some((e) => e.from === id && e.to === to),
                  ),
                ),
              }
            : a,
        ]),
      ),
    });
    setLegacyEdges([]);
  };
  const removeSelected = () => {
    if (!v) return;
    confirm.confirm({
      title: "移除节点及相关连线？",
      content: "历史任务和已发布修订保留。",
      onOk: () => {
        const incoming = v.edges.filter((e) => e.to === selected),
          outgoing = v.edges.filter((e) => e.from === selected),
          linear = v.edges.length === v.nodes.length - 1;
        patch({
          ...v,
          nodes: v.nodes.filter((n) => n.id !== selected),
          edges: [
            ...v.edges.filter((e) => e.from !== selected && e.to !== selected),
            ...(linear
              ? incoming.flatMap((a) =>
                  outgoing.map((z) => ({ from: a.from, to: z.to })),
                )
              : []),
          ],
          inputs: v.inputs.filter((id) => id !== selected),
          output: v.output === selected ? "" : v.output,
          allocations: {},
        });
        setSelected("");
        setEditing(false);
      },
    });
  };
  const contextToolbar = (
    <div className="production-context-toolbar">
      <div className="production-context-selectors">
        <label>生产链路</label>
        <Select
          aria-label="生产链路"
          style={{ width: 102 }}
          placeholder="请先新建链路"
          value={chainId || undefined}
          onChange={(id) =>
            guard(() => {
              setChainId(id);
              setVersionId("");
            })
          }
          options={p.chains.map((ch) => ({
            value: ch.id,
            label: ch.name + (ch.voided ? " · 已作废" : ""),
          }))}
        />
        {ch && (
          <>
            <label>编排版本</label>
            <Select
              style={{ width: 184 }}
              aria-label="编排修订"
              value={persisted?.id}
              onChange={(id) => guard(() => setVersionId(id))}
              options={[...ch.versions].reverse().map((v) => ({
                value: v.id,
                label: `R${v.revision}${v.id === latest(ch).id ? " · 最新" : " · 历史"}${ch.draft && v.id === latest(ch).id ? "（草稿）" : ""}`,
              }))}
            />
          </>
        )}
        <Button
          disabled={
            b.completed ||
            b.stage === "LOST" ||
            !["pm", "approver"].includes(user.role) ||
            (user.role === "pm" && user.id !== b.ownerId)
          }
          onClick={() =>
            guard(() =>
              open("create", {
                name: "生产链路 " + (p.chains.length + 1),
              }),
            )
          }
        >
          新建独立链路
        </Button>
      </div>
      <div className="production-context-actions">
        {v && ch && v.mode !== "pull" && (
          <>
            <Button
              disabled={
                disabled ||
                dirty ||
                !!ch.draft ||
                !v.confirmedAt ||
                (v.status !== "RUNNING" &&
                  (v.deadline < day() || (!!v.prepEnd && v.prepEnd > day())))
              }
              onClick={() =>
                command("production.control", {
                  businessId,
                  chainId,
                  versionId: v.id,
                  control: v.status === "RUNNING" ? "pause" : "start",
                })
              }
            >
              {v.status === "RUNNING"
                ? "暂停生产"
                : v.startedAt
                  ? "恢复生产"
                  : "开始生产"}
            </Button>
            <Button
              disabled={disabled || dirty || !!ch.draft || !v.confirmedAt}
              onClick={previewBaseline}
            >
              基线倒推预览
            </Button>
          </>
        )}
      </div>
    </div>
  );
  return (
    <div
      className="production-workspace"
      data-feature="F08-F12"
      data-production-dirty={dirty ? "true" : "false"}
    >
      {deepLinkWarning && (
        <Alert
          type="warning"
          showIcon
          closable
          message={deepLinkWarning}
          onClose={() => setDeepLinkWarning("")}
        />
      )}
      <header className="production-header">
        <div>
          <h2>生产编排</h2>
          <span className="production-permission">
            {disabled ? "只读 · 业务授权" : "最高权限 · 业务授权"}
          </span>
        </div>
        <span className="production-status">● {status}</span>
      </header>
      <details className="production-goal-overview" open>
        <summary aria-label="折叠或展开项目目标与生产链路计划">
          <div>
            <h3>项目目标与生产链路计划</h3>
            <p>
              {activeChains.length} 条有效链路 ·{" "}
              {p.chains.length - activeChains.length} 条已作废 ·{" "}
              {p.chains.reduce((sum, c) => sum + c.versions.length, 0)}{" "}
              个编排版本
            </p>
            <div className="production-collapsed-metrics">
              验收 / 总目标{" "}
              <b>
                {fmt(facts.accepted)} / {fmt(b.target)} {b.unit}
              </b>
              <span>
                产出 / 总目标{" "}
                <b>
                  {fmt(projectOutput)} / {fmt(b.target)} {b.unit}
                </b>
              </span>
            </div>
          </div>
          <div className="production-commitments">
            <div>
              <small>客户最终交付数量（含单位）</small>
              <strong>
                {fmt(b.target)} {b.unit}
              </strong>
            </div>
            <div>
              <small>正式交付截止时间</small>
              <strong>{b.deadline || "未填写"}</strong>
            </div>
          </div>
          <span className="production-overview-context">
            {ch ? `当前：${ch.name} · R${v?.revision}` : "暂无生产链路"}
            <DownOutlined />
          </span>
        </summary>
        <div className="production-overview-body">
          <div className="production-goal-metrics">
            <section>
              <small>所有生产链路版本客户验收汇总 / 项目目标</small>
              <div className="production-fraction">
                <strong>{fmt(facts.accepted)}</strong>
                <span>
                  / {fmt(b.target)} {b.unit}
                </span>
              </div>
              {progress(facts.accepted, b.target, "客户验收占项目目标")}
              <div className="production-project-meta">
                <span>
                  有效链路已验收 {fmt(facts.accepted)} {b.unit}
                </span>
                <b>
                  剩余目标 {fmt(Math.max(0, b.target - facts.accepted))}{" "}
                  {b.unit}
                </b>
              </div>
              <p className="production-source-note">
                目标来源：流程与提交正式交付规模；验收取已保存的最终输出节点明细，按范围去重；已作废链路不计入
              </p>
            </section>
            <section>
              <small>所有生产链路版本实际生产数量 / 项目目标</small>
              <div className="production-fraction">
                <strong>{fmt(projectOutput)}</strong>
                <span>
                  / {fmt(b.target)} {b.unit}
                </span>
              </div>
              {progress(projectOutput, b.target, "实际生产占项目目标")}
              <div className="production-project-meta">
                {activeChains.length} 条有效链路 ·{" "}
                {facts.nodes.filter((n) => n.terminal).length} 个末端任务
              </div>
              <div className="production-project-meta">
                正式交付截止 {b.deadline || "未填写"}
              </div>
              <p className="production-source-note">
                产出取已保存末端明细或对应节点范围的正式汇总；编排草稿不遮蔽已发生的数据，正式交付来源仍需确认编排
              </p>
            </section>
            <section className="production-cost-overview">
              <small>实际成本 / 生产总预算</small>
              <Button
                size="small"
                disabled={disabled}
                onClick={() => {
                  setBudgetChain("");
                  open("budget", { amount: b.budget / 100 });
                }}
              >
                调整预算
              </Button>
              <div className="production-fraction">
                <strong>
                  {money(facts.cost)} / {money(b.budget)}
                </strong>
              </div>
              {progress(facts.cost, b.budget, "项目成本预算使用率")}
              <p>
                生产预算已使用{" "}
                {facts.cost == null
                  ? "待回传"
                  : b.budget
                    ? ((facts.cost / b.budget) * 100).toFixed(0) + "%"
                    : "—"}{" "}
                · 按编排所选范围核算
              </p>
              {ch && (
                <div className="production-cost-chain">
                  {ch.name}：{money(chainCost(ch.id))} / {money(ch.budget)}
                  <Button
                    type="link"
                    size="small"
                    disabled={disabled}
                    onClick={() => {
                      setBudgetChain(ch.id);
                      open("budget", { amount: (ch.budget ?? 0) / 100 });
                    }}
                  >
                    调整预算
                  </Button>
                </div>
              )}
            </section>
          </div>
          <section className="production-funnel">
            <header>
              <div>
                <h3>当前版本生产链路漏斗</h3>
                <p>
                  {ch
                    ? `${ch.name} · R${v?.revision} · ${status} · ${v?.nodes.length} 个节点`
                    : "暂无生产链路"}
                </p>
              </div>
              <Button
                onClick={() =>
                  document
                    .querySelector<HTMLElement>('[aria-label="生产链路"]')
                    ?.focus()
                }
              >
                切换生产链路版本
              </Button>
            </header>
            {p.chains.map((c) => (
              <div
                key={c.id}
                className={`production-chain-row ${c.voided ? "is-voided" : ""}`}
              >
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {c.versions.length} 个修订
                    {c.id === chainId ? " · 当前查看" : ""}
                  </small>
                </div>
                <div>
                  <small>
                    当前链路版本实际产出 / 当前链路版本目标 · R
                    {latest(c).revision}
                  </small>
                  <strong>
                    {fmt(chainOutput(c.id))} / {fmt(latest(c).target)} {b.unit}
                  </strong>
                  {progress(
                    chainOutput(c.id),
                    latest(c).target,
                    `${c.name}产出目标`,
                  )}
                </div>
                <div>
                  <small>实际成本 / 链路预算</small>
                  <strong>
                    {money(chainCost(c.id))} / {money(c.budget)}
                  </strong>
                  {progress(chainCost(c.id), c.budget, `${c.name}成本预算`)}
                </div>
                <Tag>
                  {c.voided ? "已作废" : `有效 · R${latest(c).revision}`}
                </Tag>
                <div className="production-chain-actions">
                  <Button
                    type="link"
                    size="small"
                    disabled={c.id === chainId}
                    onClick={() =>
                      guard(() => {
                        setChainId(c.id);
                        setVersionId("");
                      })
                    }
                  >
                    {c.id === chainId ? "当前链路" : "切换到链路"}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={disabled || c.voided}
                    onClick={() => {
                      setBudgetChain(c.id);
                      open("budget", { amount: (c.budget ?? 0) / 100 });
                    }}
                  >
                    调整预算
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    disabled={disabled || c.voided}
                    onClick={() =>
                      guard(() => {
                        setChainId(c.id);
                        open("void");
                      })
                    }
                  >
                    作废
                  </Button>
                </div>
              </div>
            ))}
            <div className="production-funnel-metrics">
              {[
                [
                  v?.mode === "pull" ? "来源已登记" : "输入源累计输入",
                  currentInput,
                  v?.mode === "pull"
                    ? "仅同单位来源计数；不同单位不相加"
                    : "按输入源汇总，未跨源去重",
                ],
                [
                  v?.mode === "pull" ? "交付准入" : "末端有效产出",
                  currentOutput,
                  v?.mode === "pull"
                    ? "进入指定交付入口，不等于正式交付"
                    : "当前节点所选范围",
                ],
                [
                  v?.mode === "pull" ? "待产出领取批次" : "节点处理中合计",
                  v?.mode === "pull"
                    ? (state.production[businessId]?.pullReceipts || [])
                        .filter(
                          (r) =>
                            r.chainId === ch?.id &&
                            v.nodes.some(
                              (n) => n.id === r.to && n.kind === "platform",
                            ),
                        )
                        .filter((r) =>
                          r.resultIds.some(
                            (id) =>
                              !v.nodes
                                .find((n) => n.id === r.to)
                                ?.flowResults?.some((row) =>
                                  row.sourceIds.includes(id),
                                ),
                          ),
                        ).length
                    : v
                      ? sumKnown(
                          v.nodes
                            .filter((n) => n.platform !== "COLLECTION")
                            .map((n) => sumReports(n, "processing")),
                        )
                      : null,
                  v?.mode === "pull"
                    ? "仍有输入未关联产出，进度以下游平台为准"
                    : "日报字段累计，与画布口径一致",
                ],
                [
                  "末端客户已接受",
                  v?.nodes
                    .find((n) => n.id === v.output)
                    ?.batches.reduce((sum, r) => sum + r.quantity, 0) ?? 0,
                  "复用已保存的客户验收批次",
                ],
              ].map(([label, value, note]) => (
                <div key={String(label)}>
                  <small>{label}</small>
                  <strong>{fmt(value as number | null)}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <p className="production-source-note">
              {v?.mode === "pull"
                ? "各环节留存、领取和拦截原因在画布中查看；执行进度在下游平台查看。"
                : "节点输入、已分配与输出率直接在编排画布中查看。"}
            </p>
          </section>
          <p className="production-plan-footnote">
            汇总按已保存的实际生产与验收范围统计，修订复用相同明细只计一次。正式交付仍需选择已确认版本；已提交批次和作废审计保留。
          </p>
        </div>
      </details>
      <details className="production-notices">
        <summary>
          <strong>提醒与数据核对</strong>
          <span>
            {facts.issues.length
              ? `${facts.issues.length} 项需查看`
              : "当前无待处理"}
          </span>
          <small>差异、逾期、只读状态与目标来源</small>
        </summary>
        <div>
          {facts.issues.length ? (
            facts.issues.map((i) => (
              <Alert key={i} type="warning" message={i} />
            ))
          ) : (
            <p>暂无需要处理的状态提醒。</p>
          )}
          <p>
            项目目标 {fmt(b.target)} {b.unit} · 正式截止 {b.deadline} ·
            当前版本目标 {fmt(v?.target)} {b.unit}
          </p>
          {disabled && <p>当前内容只读，可查看历史生产事实与审计。</p>}
        </div>
      </details>
      <Tabs
        className="production-workspace-tabs"
        tabBarExtraContent={
          <Dropdown
            menu={{
              items: [
                { key: "platform", label: "模拟平台任务" },
                { key: "delivery", label: "交付与客户验收" },
                { key: "cost", label: "成本核算" },
              ],
              onClick: ({ key }) => guard(() => setView(key)),
            }}
          >
            <Button
              type="text"
              aria-label="更多生产功能"
              icon={<MoreOutlined />}
            />
          </Dropdown>
        }
        activeKey={view}
        onChange={(key) => guard(() => setView(key))}
        items={[
          {
            key: "canvas",
            label: "编排画布",
            children: (
              <>
                {contextToolbar}
                {v && ch && v.mode !== "pull" && (
                  <Alert
                    type="info"
                    showIcon
                    message="当前为历史编排口径"
                    action={
                      <Button
                        disabled={disabled || dirty || !!ch.draft}
                        onClick={() =>
                          command("production.flow.upgrade", {
                            businessId,
                            chainId,
                          })
                        }
                      >
                        转换为按需取数草稿
                      </Button>
                    }
                    description="转换仅复用流程配置，原有日报和交付记录继续保留。"
                  />
                )}
                {v && ch && v.mode === "pull" ? (
                  <PullCanvas
                    onCopy={() => open("copy", { name: `${ch.name} 副本` })}
                    onVoid={() => open("void")}
                    businessId={businessId}
                    chain={ch}
                    version={v}
                    disabled={disabled}
                    dirty={dirty}
                    onChange={patch}
                    onPublished={(id) => {
                      setLocal(null);
                      setVersionId(id);
                    }}
                  />
                ) : v && ch ? (
                  <>
                    <div
                      className={`production-canvas ${expanded ? "is-expanded" : ""}`}
                    >
                      <div className="production-canvas-heading">
                        <div className="production-canvas-title">
                          <strong>
                            {ch.name} · R{v.revision}
                          </strong>
                          <Tag>
                            {v.edges.length === v.nodes.length - 1
                              ? "串行"
                              : "并行"}
                          </Tag>
                          <small>
                            {v.nodes.length} 个节点 · {v.edges.length} 条连线
                          </small>
                        </div>
                        <Space className="production-canvas-tools" wrap>
                          <Tag
                            color={
                              dirty || ch.draft
                                ? "gold"
                                : v.status === "RUNNING"
                                  ? "green"
                                  : "blue"
                            }
                          >
                            {ch.voided
                              ? "已作废"
                              : dirty || ch.draft
                                ? "配置草稿"
                                : {
                                    DRAFT: "待配置",
                                    CONFIRMED: "已确认",
                                    RUNNING: "生产中",
                                    PAUSED: "已暂停",
                                  }[v.status]}
                          </Tag>
                          <Button
                            style={{ display: dirty ? undefined : "none" }}
                            disabled={disabled || !dirty}
                            onClick={() => save()}
                          >
                            保存草稿
                          </Button>
                          <Button
                            type="primary"
                            disabled={
                              disabled ||
                              (!dirty && !ch.draft && !!v.confirmedAt)
                            }
                            onClick={async () => {
                              if (dirty) await save();
                              const result = await command(
                                "production.publish",
                                {
                                  businessId,
                                  chainId,
                                },
                              );
                              setVersionId(result.versionId);
                            }}
                          >
                            发布编排
                          </Button>
                          {ch.draft && (
                            <Button
                              disabled={disabled}
                              onClick={() =>
                                confirm.confirm({
                                  title: "放弃当前草稿？",
                                  onOk: async () => {
                                    await command("production.discard", {
                                      businessId,
                                      chainId,
                                    });
                                    setLocal(null);
                                  },
                                })
                              }
                            >
                              放弃草稿
                            </Button>
                          )}
                          <Button
                            danger
                            disabled={disabled}
                            onClick={() => open("void")}
                          >
                            作废链路
                          </Button>
                          {ch && (
                            <Button
                              disabled={disabled}
                              onClick={() =>
                                guard(() =>
                                  open("copy", { name: ch.name + " 副本" }),
                                )
                              }
                            >
                              一键复制
                            </Button>
                          )}
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              patch({
                                ...v,
                                nodes: v.nodes.map((n, i) => ({
                                  ...n,
                                  position: { x: 50 + i * 300, y: 100 },
                                })),
                              })
                            }
                          >
                            自动整理
                          </Button>
                          <Button
                            aria-label="添加节点"
                            icon={<PlusOutlined />}
                            onClick={() => setPaletteOpen(!paletteOpen)}
                          >
                            添加节点
                          </Button>
                          <Button
                            aria-label="缩小画布"
                            type="text"
                            icon={<MinusOutlined />}
                            onClick={() => flow?.zoomOut()}
                          />
                          <span className="production-zoom">
                            {Math.round(zoom * 100)}%
                          </span>
                          <Button
                            aria-label="放大画布"
                            type="text"
                            icon={<PlusOutlined />}
                            onClick={() => flow?.zoomIn()}
                          />
                          <Button
                            aria-label="适应画布"
                            type="text"
                            icon={<CompressOutlined />}
                            onClick={() =>
                              flow?.fitView({ padding: 0.1, maxZoom: 1 })
                            }
                          />
                          <Button
                            aria-label={expanded ? "退出全屏画布" : "全屏画布"}
                            type="text"
                            icon={
                              expanded ? (
                                <FullscreenExitOutlined />
                              ) : (
                                <FullscreenOutlined />
                              )
                            }
                            onClick={() => setExpanded(!expanded)}
                          />
                        </Space>
                      </div>
                      <div className="production-canvas-instructions">
                        <span>
                          拖动节点调整位置 · 拖动两侧端点连线 · 点击节点打开详情
                        </span>
                        <span>
                          空白处拖动平移，连线选中后按 Delete
                          删除；配置与历史数据分别保留。
                        </span>
                      </div>
                      <div className="production-canvas-body">
                        {paletteOpen && (
                          <div
                            className={`production-node-palette ${palettePinned ? "is-pinned" : "is-unpinned"}`}
                          >
                            <div className="production-palette-heading">
                              <strong>添加节点</strong>
                              <Button
                                type="text"
                                size="small"
                                aria-label={
                                  palettePinned
                                    ? "取消固定节点抽屉"
                                    : "固定节点抽屉"
                                }
                                aria-pressed={palettePinned}
                                icon={
                                  <PushpinOutlined
                                    rotate={palettePinned ? -35 : 0}
                                  />
                                }
                                onClick={() => setPalettePinned(!palettePinned)}
                              />
                              <Button
                                type="text"
                                size="small"
                                aria-label="收起节点池"
                                icon={<LeftOutlined />}
                                onClick={() => setPaletteOpen(false)}
                              />
                            </div>
                            <p>点击添加，或拖入画布</p>
                            <div className="production-palette-list">
                              {Object.entries(platforms)
                                .filter(([key]) => key !== "FLOW")
                                .map(([key, label]) => (
                                  <Button
                                    key={key}
                                    draggable={!disabled}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "application/pmc-platform",
                                        key,
                                      );
                                      e.dataTransfer.effectAllowed = "copy";
                                    }}
                                    disabled={disabled}
                                    className="production-palette-button"
                                    icon={icons[key]}
                                    onClick={() => add(key)}
                                  >
                                    {label}
                                    {key === "COLLECTION" && (
                                      <small>仅展示</small>
                                    )}
                                  </Button>
                                ))}
                            </div>
                          </div>
                        )}
                        <ReactFlow<Node>
                          onInit={setFlow}
                          deleteKeyCode={["Backspace", "Delete"]}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const platform = e.dataTransfer.getData(
                              "application/pmc-platform",
                            );
                            if (!disabled && platforms[platform])
                              add(
                                platform,
                                flow?.screenToFlowPosition({
                                  x: e.clientX,
                                  y: e.clientY,
                                }),
                              );
                          }}
                          fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
                          nodes={legacyNodes}
                          edges={v.edges.map((e, i) => ({
                            id: e.from + "-" + e.to,
                            selected: legacyEdges.includes(e.from + "-" + e.to),
                            source: e.from,
                            target: e.to,
                            animated: v.status === "RUNNING",
                            label:
                              v.allocations[e.from]?.mode === "condition"
                                ? "条件"
                                : v.allocations[e.from]?.values[e.to] != null
                                  ? v.allocations[e.from].mode === "percent"
                                    ? v.allocations[e.from].values[e.to] / 100 +
                                      "%"
                                    : String(v.allocations[e.from].values[e.to])
                                  : "",
                          }))}
                          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                          zoomOnScroll={false}
                          preventScrolling={false}
                          onMove={(_, viewport) => setZoom(viewport.zoom)}
                          minZoom={0.2}
                          maxZoom={1.5}
                          nodesDraggable={!disabled}
                          nodesConnectable={!disabled}
                          elementsSelectable
                          onNodeClick={(_, n) => {
                            setSelected(n.id);
                            setEditing(true);
                          }}
                          onNodeDoubleClick={(_, n) => {
                            setSelected(n.id);
                            setEditing(true);
                          }}
                          onNodesChange={(changes) =>
                            setLegacyNodes((ns) =>
                              applyNodeChanges(changes, ns),
                            )
                          }
                          onNodeDragStop={(_, moved) => {
                            if (!disabled)
                              patch({
                                ...v,
                                nodes: v.nodes.map((n) =>
                                  n.id === moved.id
                                    ? { ...n, position: moved.position }
                                    : n,
                                ),
                              });
                          }}
                          onEdgesChange={(changes) =>
                            setLegacyEdges((ids) => {
                              let next = [...ids];
                              for (const change of changes)
                                if (change.type === "select")
                                  next = change.selected
                                    ? [...new Set([...next, change.id])]
                                    : next.filter((id) => id !== change.id);
                              return next;
                            })
                          }
                          onConnect={(connection: Connection) => {
                            if (
                              !disabled &&
                              connection.source !== connection.target &&
                              !v.edges.some(
                                (e) =>
                                  e.from === connection.source &&
                                  e.to === connection.target,
                              )
                            )
                              patch({
                                ...v,
                                edges: [
                                  ...v.edges,
                                  {
                                    from: connection.source!,
                                    to: connection.target!,
                                  },
                                ],
                                inputs:
                                  v.nodes.find(
                                    (n) => n.id === connection.source,
                                  )?.platform === "COLLECTION"
                                    ? v.inputs
                                    : v.inputs.filter(
                                        (id) => id !== connection.target,
                                      ),
                                output:
                                  v.output === connection.source
                                    ? ""
                                    : v.output,
                              });
                          }}
                          onEdgesDelete={(edges) =>
                            removeEdges(edges.map((e) => e.id))
                          }
                        >
                          <Background gap={18} size={1} color="#d3e0eb" />
                          <MiniMap
                            pannable
                            zoomable
                            nodeColor="#8fa8bd"
                            maskColor="#e9f0f7aa"
                          />
                        </ReactFlow>
                      </div>
                      <div className="production-canvas-footer">
                        <span>
                          源头输入 <b>{fmt(currentInput)}</b> → 最终输出{" "}
                          <b>{fmt(currentOutput)}</b> · 整体转化率{" "}
                          <b>
                            {currentInput && currentOutput != null
                              ? ((currentOutput / currentInput) * 100).toFixed(
                                  1,
                                ) + "%"
                              : "—"}
                          </b>
                        </span>
                        <span>
                          悬浮查看节点信息，点击打开详情抽屉；位置与连线保留为草稿
                        </span>
                      </div>
                      {!!legacyEdges.length && (
                        <Button
                          disabled={disabled}
                          danger
                          onClick={() => removeEdges(legacyEdges)}
                        >
                          删除所选连线
                        </Button>
                      )}
                      {selected && (
                        <Space className="production-selection-bar">
                          <span>已选节点：{selectNode?.title}</span>
                          <Button
                            disabled={disabled}
                            aria-label="向左移动节点"
                            icon={<LeftOutlined />}
                            onClick={() => moveSelected(-20, 0)}
                          />
                          <Button
                            disabled={disabled}
                            aria-label="向上移动节点"
                            icon={<UpOutlined />}
                            onClick={() => moveSelected(0, -20)}
                          />
                          <Button
                            disabled={disabled}
                            aria-label="向下移动节点"
                            icon={<DownOutlined />}
                            onClick={() => moveSelected(0, 20)}
                          />
                          <Button
                            disabled={disabled}
                            aria-label="向右移动节点"
                            icon={<RightOutlined />}
                            onClick={() => moveSelected(20, 0)}
                          />
                          <Button onClick={() => setEditing(true)}>
                            查看 / 编辑节点详情
                          </Button>
                          <Button disabled={disabled} onClick={removeSelected}>
                            移除所选节点
                          </Button>
                        </Space>
                      )}
                    </div>
                  </>
                ) : (
                  <Card>
                    尚未创建生产链路。新建后配置节点、任务与生产范围。
                  </Card>
                )}
              </>
            ),
          },
          {
            key: "baseline",
            label: "基线与进度",
            children:
              v && ch && v.mode !== "pull" ? (
                <>
                  {contextToolbar}
                  <BaselinePanel
                    version={v}
                    chain={ch}
                    p={p}
                    b={b}
                    disabled={disabled}
                    dirty={dirty}
                    onChange={patch}
                    onSave={() => save()}
                    onPreview={previewBaseline}
                    onNode={(id) => {
                      setSelected(id);
                      setEditing(true);
                    }}
                  />
                </>
              ) : (
                <Alert
                  message={
                    v?.mode === "pull"
                      ? "按需取数的技术批次计划在下游平台维护；本期保留既有基线功能供历史编排使用。"
                      : "请先创建生产链路"
                  }
                />
              ),
          },
          {
            key: "platform",
            label: "模拟平台任务",
            children: <PlatformTasks businessId={businessId} />,
          },
          {
            key: "delivery",
            label: "交付与客户验收",
            children: <DeliveryPanel businessId={businessId} />,
          },
          {
            key: "cost",
            label: "成本核算",
            children: (
              <>
                <Space>
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      setBudgetChain("");
                      open("budget", { amount: b.budget / 100 });
                    }}
                  >
                    调整生产总预算
                  </Button>
                  <Button
                    disabled={
                      b.completed ||
                      b.stage === "LOST" ||
                      !["finance", "approver"].includes(user.role)
                    }
                    onClick={() => open("confirmCost")}
                  >
                    {p.costConfirmed ? "成本已核对" : "确认成本核对"}
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={p.chains}
                  columns={[
                    { title: "链路", dataIndex: "name" },
                    {
                      title: "状态",
                      render: (_, ch) => (ch.voided ? "已作废" : "有效"),
                    },
                    { title: "链路预算", dataIndex: "budget", render: money },
                    {
                      title: "实际成本",
                      render: (_, ch) =>
                        money(
                          facts.nodes
                            .filter((n) => n.chainId === ch.id)
                            .reduce(
                              (sum, n) =>
                                n.cost == null
                                  ? null
                                  : sum == null
                                    ? null
                                    : sum + n.cost,
                              0,
                            ),
                        ),
                    },
                    {
                      title: "操作",
                      render: (_, ch) => (
                        <Button
                          disabled={disabled || ch.voided}
                          onClick={() => {
                            setBudgetChain(ch.id);
                            open("budget", { amount: (ch.budget || 0) / 100 });
                          }}
                        >
                          分配 / 调整预算
                        </Button>
                      ),
                    },
                  ]}
                />
                <Alert
                  message={
                    "有效链路已分配 " +
                    money(facts.allocated) +
                    "；未分配 " +
                    money(b.budget - facts.allocated)
                  }
                  type="info"
                />
                <Table
                  rowKey="id"
                  dataSource={facts.nodes}
                  columns={[
                    { title: "节点", dataIndex: "title" },
                    { title: "链路", dataIndex: "chainName" },
                    { title: "实际成本", dataIndex: "cost", render: money },
                    {
                      title: "已输出",
                      dataIndex: "output",
                      render: (x) => x ?? "待回传",
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "history",
            label: "版本与审计",
            children: (
              <ProductionHistory
                p={p}
                unit={b.unit}
                cost={facts.cost}
                onChoose={(id, revision) =>
                  guard(() => {
                    setChainId(id);
                    setVersionId(revision || "");
                    setView("canvas");
                  })
                }
              />
            ),
          },
        ].filter((item) =>
          ["canvas", "baseline", "history", view].includes(item.key),
        )}
      />
      <BaselinePreview
        value={baselinePreview}
        onClose={() => setBaselinePreview(null)}
        onPublish={() =>
          command("production.baseline", {
            businessId,
            chainId,
            versionId: v!.id,
          })
        }
      />
      {editing && selected && selectNode && v && ch && v.mode !== "pull" && (
        <NodeEditor
          businessId={businessId}
          chain={ch}
          version={v}
          node={selectNode}
          onChange={patch}
          disabled={disabled}
          configurationDirty={dirty || !!ch.draft}
          onPreview={() =>
            guard(() => {
              setEditing(false);
              setView("baseline");
            })
          }
          onDelete={removeSelected}
          saveDraft={save}
          onClose={() =>
            guard(() => {
              setSelected("");
              setEditing(false);
            })
          }
        />
      )}
      <Modal
        title={
          dialog === "plan"
            ? "版本计划与基线策略"
            : dialog === "budget"
              ? "调整预算（金额以元输入）"
              : dialog === "void"
                ? "作废链路"
                : dialog === "confirmCost"
                  ? "确认成本核对"
                  : dialog === "copy"
                    ? "复制独立生产链路"
                    : "新建独立生产链路"
        }
        open={!!dialog}
        onCancel={() => setDialog("")}
        onOk={() => form.submit()}
      >
        <Form
          layout="vertical"
          form={form}
          onFinish={async (values) => {
            if (dialog === "create" || dialog === "copy") {
              const result = await command("production.createChain", {
                businessId,
                name: values.name,
                copyId: dialog === "copy" ? chainId : undefined,
                mode: dialog === "create" ? "pull" : undefined,
              });
              setChainId(result.chainId);
              setVersionId("");
            } else if (dialog === "plan") {
              patch({ ...v!, ...values });
              await save({ ...v!, ...values });
            } else if (dialog === "budget")
              await command("production.budget", {
                businessId,
                chainId: budgetChain || undefined,
                amount: Math.round(values.amount * 100),
                reason: values.reason,
              });
            else if (dialog === "confirmCost")
              await command("production.confirmCost", {
                businessId,
                reason: values.reason,
              });
            else if (dialog === "void")
              await command("production.void", {
                businessId,
                chainId,
                reason: values.reason,
              });
            setDialog("");
          }}
        >
          {dialog === "create" || dialog === "copy" ? (
            <>
              <Form.Item
                name="name"
                label="链路名称"
                rules={[{ required: true }]}
              >
                <Input maxLength={50} />
              </Form.Item>
              <p>
                {dialog === "copy"
                  ? "复制配置、布局、任务与范围；不复制生产事实、修正和验收。"
                  : "从空白开始，默认目标抵扣已登记客户接受量。"}
              </p>
            </>
          ) : dialog === "plan" ? (
            <>
              <Form.Item
                name="target"
                label="版本目标"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} />
              </Form.Item>
              <Space>
                <Form.Item
                  name="start"
                  label="开始日"
                  rules={[{ required: true }]}
                >
                  <input type="date" />
                </Form.Item>
                <Form.Item
                  name="deadline"
                  label="截止日"
                  rules={[{ required: true }]}
                >
                  <input type="date" />
                </Form.Item>
              </Space>
              <Form.Item name="prepEnd" label="筹备结束日">
                <input type="date" disabled={!!v?.startedAt} />
              </Form.Item>
              <Form.Item name="strategy" label="基线策略">
                <Select
                  options={[
                    { value: "trial", label: "小批量试跑" },
                    { value: "estimate", label: "预估转化率" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="trialSize" label="试跑样本量">
                <InputNumber min={1} />
              </Form.Item>
              <Form.Item name="preset" label="预估转化率 %">
                <InputNumber min={0.0001} max={100} />
              </Form.Item>
              <Form.Item name={["ramp", "enabled"]} valuePropName="checked">
                <Checkbox>启用爬坡期</Checkbox>
              </Form.Item>
              <Form.Item name={["ramp", "end"]} label="爬坡结束日">
                <input type="date" />
              </Form.Item>
              <Form.Item name={["ramp", "daily"]} label="爬坡期每日输入计划">
                <InputNumber min={1} precision={0} />
              </Form.Item>
            </>
          ) : (
            <>
              {dialog === "budget" && (
                <Form.Item
                  name="amount"
                  label="预算金额（元）"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0.01} precision={2} />
                </Form.Item>
              )}
              <Form.Item
                name="reason"
                label="操作依据 / 变更原因"
                rules={[
                  {
                    required: true,
                    min: dialog === "void" || dialog === "budget" ? 5 : 1,
                  },
                ]}
              >
                <Input.TextArea maxLength={500} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
