import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { usePMC } from "../../api";
import { day, addDays } from "../../../shared/types";
import {
  latest,
  money,
  processUnitCapacity,
  productionData,
  productionFacts,
  type ProductionVersion,
} from "../../../shared/production";
import { DeliveryPanel } from "./Delivery";
import { FlowBoard, type BoardSelection } from "./FlowBoard";
import { CanvasReview } from "./CanvasReview";
import { BatchOrchestration } from "./BatchOrchestration";
import {
  experienceSignals,
  nodeMeasure,
  projectFlowFacts,
  deliveryForecast,
  flowForecast,
  quantity,
  type ExperienceSignal,
} from "./experience-model";
import "./experience.css";

export function ProductionExperience({
  businessId,
  legacy,
  embedded = false,
  onProjectNavigate,
}: {
  businessId: string;
  legacy: React.ReactNode;
  embedded?: boolean;
  onProjectNavigate?: (key: string) => void;
}) {
  const { state, user, command, busy, refresh } = usePMC();
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const p = productionData(state, businessId),
    b = state.businesses.find((x) => x.id === businessId)!;
  const [chainId, setChainId] = useState(
    params.get("chainId") ||
      p.chains.find((c) => !c.voided && latest(c).mode === "pull")?.id ||
      p.chains.find((c) => !c.voided)?.id ||
      "",
  );
  const [versionId, setVersionId] = useState(params.get("versionId") || "");
  const [local, setLocal] = useState<ProductionVersion | null>(null);
  const [view, setView] = useState("canvas");
  const [canvasVisited, setCanvasVisited] = useState(view === "canvas");
  const [reviewCanvas, setReviewCanvas] = useState(false);
  const [canvasFocus, setCanvasFocus] = useState(false);
  useEffect(() => {
    if (view === "canvas") setCanvasVisited(true);
  }, [view]);
  const [selection, setSelection] = useState<BoardSelection | null>(
    params.get("nodeId") ? { type: "node", id: params.get("nodeId")! } : null,
  );
  const [createOpen, setCreateOpen] = useState(false),
    [chainName, setChainName] = useState("");
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskPolicy, setRiskPolicy] = useState({
    qualityField: "合格",
    qualityTarget: 95,
    staleAfterDays: 2,
  });
  const [reportOpen, setReportOpen] = useState(false),
    [legacyOpen, setLegacyOpen] = useState(false);
  const [issue, setIssue] = useState<ExperienceSignal | null>(null),
    [reviewOwner, setReviewOwner] = useState(b.ownerId),
    [action, setAction] = useState(""),
    [note, setNote] = useState(""),
    [reviewDate, setReviewDate] = useState(addDays(1)),
    [reviewStatus, setReviewStatus] = useState("acted");
  const ch = p.chains.find((c) => c.id === chainId),
    published =
      ch && (ch.versions.find((v) => v.id === versionId) || latest(ch));
  const base =
      ch?.draft && published?.id === latest(ch).id ? ch.draft : published,
    v = local || base;
  const dirty = !!local && JSON.stringify(local) !== JSON.stringify(base);
  const readOnly =
    b.completed ||
    b.stage === "LOST" ||
    !["pm", "approver"].includes(user.role) ||
    (user.role === "pm" && user.id !== b.ownerId) ||
    !!ch?.voided ||
    !!(ch && published && published.id !== latest(ch).id);
  const operational = !!(
    v?.confirmedAt &&
    !dirty &&
    !ch?.draft &&
    !readOnly &&
    v.status === "RUNNING"
  );
  const facts = useMemo(
    () => productionFacts(state, businessId),
    [state, businessId],
  );
  const flowFacts = useMemo(() => projectFlowFacts(p), [p]);
  const signals = useMemo(() => {
    const list = v?.mode === "pull" && ch ? experienceSignals(p, ch.id, v) : [];
    if (facts.cost != null && b.budget > 0 && facts.cost > b.budget)
      list.unshift({
        key: "project-cost",
        title: "项目已登记成本超过预算",
        detail: `已登记成本 ${money(facts.cost)}，预算 ${money(b.budget)}。`,
        impact: "请核对后续投入与交付方案",
        kind: "risk",
        severity: "high",
      });
    return list;
  }, [p, ch, v, facts.cost, b.budget]);
  const reviews = ((p as any).flowReviews || []).filter(
    (r: any) => r.chainId === chainId,
  );
  const latestReviews = new Map<string, any>();
  for (const r of reviews) latestReviews.set(r.issueKey, r);
  const pending = [...latestReviews.values()].filter(
    (r) => r.status !== "verified",
  );
  const daysLeft = b.deadline
    ? Math.ceil(
        (Date.parse(b.deadline + "T00:00:00+08:00") -
          Date.parse(day() + "T00:00:00+08:00")) /
          86400000,
      )
    : null;
  const output = v?.output ? v.nodes.find((n) => n.id === v.output) : null;
  const forecast =
    v?.mode === "pull" && ch
      ? deliveryForecast(p, ch.id, v, v.target, v.deadline)
      : null;
  const pace = v?.mode === "pull" && ch ? flowForecast(p, ch.id, v) : null;
  const expected = forecast?.expected ?? null;
  const forecastGap = forecast?.gap ?? null;
  const missing = Math.max(0, b.target - facts.produced);
  useEffect(() => {
    setLocal(null);
    setSelection(
      params.get("nodeId") ? { type: "node", id: params.get("nodeId")! } : null,
    );
  }, [chainId, versionId, businessId]);
  useEffect(() => {
    const requestedChain = params.get("chainId");
    if (
      requestedChain &&
      requestedChain !== chainId &&
      p.chains.some((c) => c.id === requestedChain)
    ) {
      setChainId(requestedChain);
      setVersionId(params.get("versionId") || "");
    }
  }, [params.get("chainId")]);
  useEffect(() => {
    const requested = params.get("nodeId");
    if (requested) {
      setView("canvas");
      setSelection({ type: "node", id: requested });
    }
  }, [params.toString()]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  const guard = (fn: () => void) => {
    if (dirty)
      modal.confirm({
        title: "先处理尚未保存的编排",
        content: "切换链路或版本会丢弃未保存修改。",
        okText: "放弃修改并切换",
        cancelText: "继续编辑",
        onOk: () => {
          setLocal(null);
          fn();
        },
      });
    else fn();
  };
  const save = async () => {
    if (!v || !ch) return;
    await command("production.flow.save", {
      businessId,
      chainId: ch.id,
      versionId: published?.id,
      value: v,
    });
    setLocal(null);
    message.success("草稿已保存，尚未改变运行关系");
  };
  const publish = async () => {
    if (!v || !ch) return;
    if (dirty)
      await command("production.flow.save", {
        businessId,
        chainId: ch.id,
        versionId: published?.id,
        value: v,
      });
    const r = await command("production.publish", {
      businessId,
      chainId: ch.id,
    });
    setLocal(null);
    setVersionId(r.versionId);
    message.success("编排已发布，是否开始生产由你决定");
  };
  const locate = (s: ExperienceSignal) => {
    setView("canvas");
    setSelection(
      s.nodeId ? { type: "node", id: s.nodeId } : { type: "signals", id: "" },
    );
  };
  const openIssue = (s: ExperienceSignal) => {
    const normalized = { ...s, key: s.issueKey || s.key };
    setIssue(normalized);
    const r = reviews.filter((x: any) => x.issueKey === normalized.key).at(-1);
    setReviewOwner(r?.ownerId || b.ownerId);
    setAction(r?.action || "");
    setNote("");
    setReviewStatus("acted");
    setReviewDate(addDays(1));
  };
  const recordReview = async () => {
    if (!issue || !v || !ch || !action.trim() || !note.trim()) return;
    await command("production.flow.review", {
      businessId,
      chainId: ch.id,
      versionId: latest(ch).id,
      issueKey: issue.key,
      nodeId: issue.nodeId,
      ownerId: reviewOwner,
      action,
      note,
      reviewDate,
      status: reviewStatus,
      evidence: {
        quantity: issue.nodeId
          ? nodeMeasure(p, ch.id, latest(ch), issue.nodeId).output
          : nodeMeasure(p, ch.id, latest(ch), latest(ch).output).output,
        asOf: issue.nodeId
          ? nodeMeasure(p, ch.id, latest(ch), issue.nodeId).lastAt
          : nodeMeasure(p, ch.id, latest(ch), latest(ch).output).lastAt,
      },
    });
    setIssue(null);
    message.success(
      reviewStatus === "verified"
        ? "复查结论已记录；当前风险仍按实际依据判断"
        : "处理记录已保存，等待新证据复查",
    );
  };
  const latestUpdate = flowFacts.lastAt
    ? new Date(flowFacts.lastAt).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "尚无平台回传";
  const status = ch?.voided
    ? "已停用"
    : dirty || ch?.draft
      ? "有草稿"
      : v?.status === "RUNNING"
        ? "运行中"
        : v?.confirmedAt
          ? "已发布"
          : "待编排";
  const menuItems = [
    { key: "report", label: "周会汇报摘要" },
    { key: "delivery", label: "交付与客户验收" },
    { key: "records", label: "输出与处理记录" },
    {
      key: "riskPolicy",
      label: "风险判断依据",
      disabled: readOnly || v?.mode !== "pull",
    },
    { key: "history", label: "历史版本与原型完整信息" },
    {
      key: "copy",
      label: "复制为独立链路",
      disabled: readOnly || dirty || !ch,
    },
  ];
  return (
    <section
      className={`${embedded ? "experience experience-embedded" : "experience"}${canvasFocus ? " canvas-focus-mode" : ""}`}
      data-production-dirty={dirty ? "true" : "false"}
    >
      {view !== "canvas" && <header className="experience-header">
        <div>
          <span className="experience-section-label">生产编排</span>
          <h2>生产与交付</h2>
        </div>
        <div className="experience-header-meta">
          <span>
            交付目标{" "}
            <b>
              {quantity(b.target)} {b.unit}
            </b>
          </span>
          <span>
            截止 <b>{b.deadline || "待确定"}</b>
          </span>
        </div>
      </header>}
      <nav className="experience-nav" aria-label="生产工作视图">
        <div role="tablist">
          <button
            role="tab"
            aria-selected={view === "overview"}
            onClick={() => setView("overview")}
          >
            {embedded ? "链路运行" : "运行总览"}
          </button>
          <button
            role="tab"
            aria-selected={view === "canvas"}
            onClick={() => setView("canvas")}
          >
            生产编排
          </button>
          {["delivery", "records"].includes(view) && (
            <button role="tab" aria-selected onClick={() => {}}>
              {view === "delivery" ? "交付与验收" : "输出与处理记录"}
            </button>
          )}
        </div>
        <div className="experience-nav-actions">
          <span className="experience-freshness">{latestUpdate}</span>
          <Button
            type="text"
            aria-label="刷新生产事实"
            icon={<ReloadOutlined />}
            onClick={() => refresh()}
          />
          <Dropdown
            menu={{
              items: menuItems,
              onClick: ({ key }) => {
                if (key === "riskPolicy") {
                  setRiskPolicy({
                    qualityField: v?.riskPolicy?.qualityField || "合格",
                    qualityTarget: (v?.riskPolicy?.qualityTarget ?? 0.95) * 100,
                    staleAfterDays: v?.riskPolicy?.staleAfterDays || 2,
                  });
                  setRiskOpen(true);
                } else if (key === "report") setReportOpen(true);
                else if (key === "history") setLegacyOpen(true);
                else if (key === "copy")
                  modal.confirm({
                    title: "复制为独立链路",
                    content: "只复用生产关系与配置，不复制已有产出或领取记录。",
                    onOk: async () => {
                      const r = await command("production.createChain", {
                        businessId,
                        copyId: chainId,
                        name: `${ch?.name} 副本`,
                      });
                      setChainId(r.chainId);
                      setVersionId("");
                      setLocal(null);
                      setView("canvas");
                    },
                  });
                else if (key === "void")
                  modal.confirm({
                    title: "停用当前链路？",
                    content: "停止未来投入，保留历史事实和已发生的交付。",
                    onOk: async () => {
                      await command("production.void", {
                        businessId,
                        chainId,
                        reason: "项目经理在生产编排中停用此方案",
                      });
                      setView("overview");
                    },
                  });
                else if (key === "delivery" && onProjectNavigate)
                  onProjectNavigate("delivery");
                else setView(key);
              },
            }}
            trigger={["click"]}
          >
            <Button
              type="text"
              aria-label="生产更多操作"
              icon={<MoreOutlined />}
            />
          </Dropdown>
        </div>
      </nav>
      {view === "overview" && (
        <div className="experience-overview">
          <section className="experience-outcome">
            <div>
              <div className="experience-eyebrow">交付进展</div>
              <h3>
                {forecastGap != null
                  ? forecastGap > 0
                    ? "当前链路按计划仍有缺口"
                    : "当前链路计划可覆盖目标"
                  : missing > 0
                    ? "先核对交付缺口，再看生产瓶颈"
                    : "产量已覆盖目标，继续核对交付与验收"}
              </h3>
              <p>
                {expected == null
                  ? "当前链路的供给、准入或产能依据不完整，暂不判断能否按期完成。"
                  : `按当前链路的供给与产能配置估算，截止前约可形成 ${quantity(expected)} ${b.unit}。此为计划产能测算，需持续用实际回传核对。`}
              </p>
              <Button type="primary" onClick={() => setView("canvas")}>
                查看生产关系 <ArrowRightOutlined />
              </Button>
            </div>
            <div className="experience-completion">
              <span>
                项目累计 · {p.chains.filter((c) => !c.voided).length} 条链路
              </span>
              <strong>{quantity(facts.produced)}</strong>
              <span>
                / {quantity(b.target)} {b.unit} 末端有效产出
              </span>
              <div
                className="experience-progress"
                role="progressbar"
                aria-label="末端有效产出占目标"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  b.target
                    ? Math.min(100, (facts.produced / b.target) * 100)
                    : 0
                }
              >
                <i
                  style={{
                    width: `${b.target ? Math.min(100, (facts.produced / b.target) * 100) : 0}%`,
                  }}
                />
              </div>
              <small>
                尚需 {quantity(missing)} {b.unit} ·{" "}
                {daysLeft == null
                  ? "交期未定"
                  : daysLeft < 0
                    ? `已过期 ${Math.abs(daysLeft)} 天`
                    : `剩余 ${daysLeft} 天`}
              </small>
            </div>
          </section>
          {forecast && (
            <details className="experience-evidence">
              <summary>
                当前链路：{ch?.name} · 目标 {quantity(v?.target)} {b.unit} ·
                截止 {v?.deadline} · 查看投入与预测依据
              </summary>
              <p>
                余下每天需 {quantity(pace?.requiredDaily)}；可用计划产能{" "}
                {quantity(forecast.dailyCapacity)} /
                天。先换算同环节必要步骤的短板，再核对上游供给与准入。项目累计含历史链路，预测只针对当前链路。
              </p>
              {forecast.issues.map((text) => (
                <p key={text}>{text}</p>
              ))}
              <Table
                size="small"
                pagination={false}
                rowKey="nodeId"
                dataSource={forecast.requirements}
                columns={[
                  {
                    title: "投入环节",
                    render: (_, r) =>
                      v?.nodes.find((n) => n.id === r.nodeId)?.title ||
                      r.nodeId,
                  },
                  {
                    title: "尚需形成的输出",
                    render: (_, r) => quantity(r.neededOutput),
                  },
                  {
                    title: "当前留存",
                    render: (_, r) => quantity(r.available),
                  },
                  { title: "依据 / 缺失条件", dataIndex: "reason" },
                ]}
              />
            </details>
          )}
          <div className="experience-metric-line">
            <div>
              <span>已登记交付</span>
              <b>
                {quantity(facts.delivered)} <small>{b.unit}</small>
              </b>
            </div>
            <div>
              <span>客户已接受</span>
              <b>
                {quantity(facts.accepted)} <small>{b.unit}</small>
              </b>
            </div>
            <div>
              <span>当前链路预计缺口</span>
              <b>
                {forecastGap == null ? "待核对" : quantity(forecastGap)}{" "}
                <small>
                  {forecastGap == null ? "补齐产能口径后计算" : b.unit}
                </small>
              </b>
            </div>
            <div>
              <span>已登记成本 / 预算</span>
              <b>
                {money(facts.cost)} <small>/ {money(b.budget)}</small>
              </b>
            </div>
          </div>
          <div className="experience-overview-columns">
            <section className="experience-attention">
              <header>
                <h3>当前链路需关注</h3>
                <span>
                  {signals.length} 项关注 · {pending.length} 项待复查
                </span>
              </header>
              {signals.length ? (
                signals.slice(0, 3).map((s) => (
                  <article
                    key={s.key}
                    className={`experience-signal ${s.kind}`}
                  >
                    <div className="experience-signal-heading">
                      <span>
                        {s.kind === "review" ? (
                          <ClockCircleOutlined />
                        ) : (
                          <WarningOutlined />
                        )}
                      </span>
                      <strong>{s.title}</strong>
                      <Tag>
                        {s.kind === "data"
                          ? "补充依据"
                          : s.kind === "review"
                            ? "待复查"
                            : "需关注"}
                      </Tag>
                    </div>
                    <p>
                      {s.detail.length > 140
                        ? s.detail.slice(0, 110) + "…"
                        : s.detail}
                    </p>
                    {s.detail.length > 140 && (
                      <details className="experience-evidence">
                        <summary>查看完整判断依据</summary>
                        <p>{s.detail}</p>
                      </details>
                    )}
                    <small>
                      {s.ownerId
                        ? s.impact.replace(
                            `负责人 ${s.ownerId}`,
                            `负责人 ${state.users.find((u) => u.id === s.ownerId)?.name || s.ownerId}`,
                          )
                        : s.impact}
                    </small>
                    <footer>
                      <Button type="link" onClick={() => locate(s)}>
                        {s.nodeId ? "定位环节" : "查看依据"}{" "}
                        <ArrowRightOutlined />
                      </Button>
                      <Button
                        size="small"
                        disabled={
                          readOnly || !v?.confirmedAt || !!ch?.draft || dirty
                        }
                        onClick={() => openIssue(s)}
                      >
                        处理与复查
                      </Button>
                    </footer>
                  </article>
                ))
              ) : (
                <div className="experience-calm">
                  <CheckCircleOutlined />
                  <strong>暂无已识别的环节问题</strong>
                  <p>这不代表交付无风险；仍需核对产能、质量与最新平台回传。</p>
                </div>
              )}
              {signals.length > 3 && (
                <Button
                  onClick={() => {
                    setView("canvas");
                    setSelection({ type: "signals", id: "" });
                  }}
                >
                  查看全部 {signals.length} 项
                </Button>
              )}
            </section>
            <section className="experience-routes">
              <header>
                <h3>生产方案</h3>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={readOnly}
                  onClick={() => {
                    setChainName("");
                    setCreateOpen(true);
                  }}
                >
                  新增链路
                </Button>
              </header>
              {p.chains
                .filter((c) => !c.voided)
                .map((c) => {
                  const x = latest(c),
                    amount =
                      x.mode === "pull"
                        ? nodeMeasure(
                            p,
                            c.id,
                            x,
                            x.output || x.nodes[0]?.id || "",
                          ).output
                        : facts.nodes
                            .filter((n) => n.chainId === c.id && n.terminal)
                            .reduce((sum, n) => sum + (n.output || 0), 0);
                  return (
                    <button
                      key={c.id}
                      className="experience-route"
                      onClick={() =>
                        guard(() => {
                          setChainId(c.id);
                          setVersionId("");
                          setView("canvas");
                        })
                      }
                    >
                      <div>
                        <strong>{c.name}</strong>
                        <small>
                          {x.mode === "pull"
                            ? `${x.nodes.filter((n) => n.kind === "platform").length} 个平台 · ${(x.processUnits || []).length} 个生产环节`
                            : "历史编排 · 记录保留"}
                        </small>
                      </div>
                      <div>
                        <b>{x.output ? quantity(amount) : "待配置"}</b>
                        <small>
                          {x.output
                            ? `${b.unit} · ${x.mode === "pull" ? "交付候选" : "历史末端产出"}`
                            : "交付入口"}
                        </small>
                      </div>
                      <ArrowRightOutlined />
                    </button>
                  );
                })}
              {!p.chains.length && <Empty description="还没有生产方案" />}
              <div className="experience-next-check">
                <ClockCircleOutlined />
                <div>
                  <strong>处理后再确认</strong>
                  <p>
                    {pending.length
                      ? `${pending.length} 项已有动作，复查时请核对动作之后的新数据。`
                      : "动作完成后保留依据，并约定下次核对日期。"}
                  </p>
                  <Button type="link" onClick={() => setView("records")}>
                    查看处理记录
                  </Button>
                </div>
              </div>
            </section>
          </div>
          {!!facts.issues.length && (
            <details className="experience-evidence">
              <summary>数据口径核对 · {facts.issues.length} 项</summary>
              {facts.issues.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </details>
          )}
        </div>
      )}
      {(view === "canvas" || canvasVisited) && (
        <div style={{ display: view === "canvas" ? "block" : "none" }}>
          <BatchOrchestration businessId={businessId} />
        </div>
      )}
      {view === "delivery" && (
        <div className="experience-secondary">
          <header>
            <h3>交付与客户验收</h3>
            <Button onClick={() => setView("canvas")}>返回生产编排</Button>
          </header>
          {b.stage === "ESTABLISHED" && (
            <Alert
              type="info"
              showIcon
              message="交付登记在项目进入正式交付阶段后开放"
              description={
                <>
                  <span>生产候选与历史验收可先核对。</span>{" "}
                  <Button
                    type="link"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("tab", "workflow");
                      setParams(next);
                    }}
                  >
                    前往项目阶段流转
                  </Button>
                </>
              }
            />
          )}
          <DeliveryPanel
            businessId={businessId}
            onFeedback={
              v?.mode === "pull" && v.output
                ? () => {
                    setView("canvas");
                    setSelection({ type: "node", id: v.output });
                  }
                : undefined
            }
          />
        </div>
      )}
      {view === "records" && (
        <div className="experience-secondary">
          <header>
            <h3>输出与处理记录</h3>
            <Button onClick={() => setView("canvas")}>返回生产编排</Button>
          </header>
          <h4>处理与复查</h4>
          <Table
            size="small"
            rowKey="id"
            dataSource={[...reviews].reverse()}
            pagination={{ pageSize: 6 }}
            columns={[
              {
                title: "动作与依据",
                render: (_, r: any) => (
                  <>
                    <strong>{r.action}</strong>
                    <p>{r.note}</p>
                  </>
                ),
              },
              {
                title: "负责人",
                render: (_, r: any) =>
                  state.users.find((u) => u.id === r.ownerId)?.name ||
                  r.ownerId,
              },
              { title: "复查日期", dataIndex: "reviewDate" },
              {
                title: "结论",
                render: (_, r: any) =>
                  r.status === "verified"
                    ? "已人工复查"
                    : r.status === "acted"
                      ? "动作已执行 · 待复查"
                      : "待处理",
              },
              {
                title: "继续",
                render: (_, r: any) => (
                  <Button
                    type="link"
                    onClick={() =>
                      openIssue({
                        key: r.issueKey,
                        title: r.action,
                        detail: r.note,
                        impact: "核对新证据",
                        nodeId: r.nodeId,
                        kind: "review",
                        severity: "medium",
                      })
                    }
                  >
                    再次核对
                  </Button>
                ),
              },
            ]}
          />
          <h4>平台归拢输出</h4>
          <Table
            size="small"
            rowKey="id"
            dataSource={(v?.nodes || [])
              .filter((n) => n.kind === "platform")
              .flatMap((n) =>
                (n.flowResults || []).map((r) => ({
                  ...r,
                  nodeTitle: n.title,
                })),
              )}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: "平台 / 环节", dataIndex: "nodeTitle" },
              { title: "外部结果引用", dataIndex: "externalId" },
              {
                title: "数量",
                render: (_, r: any) => quantity(r.quantity ?? 1),
              },
              { title: "日期", dataIndex: "date" },
              { title: "关联项目", dataIndex: "platformRef" },
            ]}
          />
          <details className="experience-evidence">
            <summary>版本与审计</summary>
            <Table
              size="small"
              rowKey="id"
              dataSource={p.audit.slice(0, 30)}
              pagination={{ pageSize: 6 }}
              columns={[
                { title: "动作", dataIndex: "action" },
                { title: "说明", dataIndex: "detail" },
                { title: "时间", dataIndex: "at" },
              ]}
            />
          </details>
        </div>
      )}
      <Modal
        title="风险判断依据"
        open={riskOpen}
        onCancel={() => setRiskOpen(false)}
        okText="应用到编排草稿"
        onOk={() => {
          if (v) {
            setLocal({
              ...v,
              riskPolicy: {
                qualityField: riskPolicy.qualityField,
                qualityTarget: riskPolicy.qualityTarget / 100,
                staleAfterDays: riskPolicy.staleAfterDays,
              },
            });
            setView("canvas");
          }
          setRiskOpen(false);
        }}
      >
        <p>
          这些值用于判断和提醒，应用后仍需保存并发布编排。质量采用真实登记的布尔字段样本；没有记录时显示依据不足。
        </p>
        <label className="experience-field">
          合格结果字段
          <Input
            value={riskPolicy.qualityField}
            onChange={(e) =>
              setRiskPolicy({ ...riskPolicy, qualityField: e.target.value })
            }
          />
        </label>
        <label className="experience-field">
          期望合格率
          <InputNumber
            aria-label="期望合格率"
            min={0}
            max={100}
            addonAfter="%"
            value={riskPolicy.qualityTarget}
            onChange={(x) =>
              setRiskPolicy({ ...riskPolicy, qualityTarget: Number(x) || 0 })
            }
          />
        </label>
        <label className="experience-field">
          多少天无新记录时提醒
          <InputNumber
            aria-label="数据停滞提醒天数"
            min={1}
            precision={0}
            value={riskPolicy.staleAfterDays}
            onChange={(x) =>
              setRiskPolicy({ ...riskPolicy, staleAfterDays: Number(x) || 1 })
            }
          />
        </label>
      </Modal>
      <Modal
        title="新建独立生产链路"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="创建并开始编排"
        confirmLoading={busy}
        onOk={async () => {
          if (!chainName.trim()) return;
          const r = await command("production.createChain", {
            businessId,
            name: chainName.trim(),
            mode: "pull",
          });
          setChainId(r.chainId);
          setVersionId("");
          setLocal(null);
          setView("canvas");
          setCreateOpen(false);
        }}
      >
        <label className="experience-field">
          链路名称
          <Input
            autoFocus
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
            placeholder="例如：运动视频生产"
          />
        </label>
        <p>独立链路有自己的生产关系；同一环节内的机器＋人工可在画布中成组。</p>
      </Modal>
      <Modal
        title="处理与复查"
        open={!!issue}
        onCancel={() => setIssue(null)}
        okText="保存处理记录"
        confirmLoading={busy}
        okButtonProps={{ disabled: readOnly || !action.trim() || !note.trim() }}
        onOk={recordReview}
      >
        <div className="experience-issue-summary">
          <strong>{issue?.title}</strong>
          <p>{issue?.detail}</p>
          <small>{issue?.impact}</small>
        </div>
        <label className="experience-field">
          负责人
          <Select
            value={reviewOwner}
            onChange={setReviewOwner}
            options={state.users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </label>
        <label className="experience-field">
          解决动作
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="例如：增加人工并核对今日合格产出"
          />
        </label>
        <label className="experience-field">
          当前进展
          <Select
            value={reviewStatus}
            onChange={setReviewStatus}
            options={[
              { value: "open", label: "已认领 · 尚待执行" },
              { value: "acted", label: "动作已执行 · 等待新数据复查" },
              { value: "verified", label: "已有新证据 · 记录人工复查结论" },
            ]}
          />
        </label>
        <div className="experience-inline-note">
          登记输出{" "}
          {quantity(
            issue?.nodeId && v && ch
              ? nodeMeasure(p, ch.id, v, issue.nodeId).output
              : v && ch
                ? nodeMeasure(p, ch.id, v, v.output).output
                : null,
          )}
          ；证据时间{" "}
          {issue?.nodeId && v && ch
            ? nodeMeasure(p, ch.id, v, issue.nodeId).lastAt || "尚无记录"
            : v && ch
              ? nodeMeasure(p, ch.id, v, v.output).lastAt || "尚无记录"
              : "尚无记录"}
          。复查使用实际回传时间，不以点击时间充当新数据。
        </div>
        <label className="experience-field">
          处理依据 / 新证据与结论
          <Input.TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="experience-field">
          下次复查日期
          <Input
            type="date"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
          />
        </label>
        <div className="experience-inline-note">
          通知示意：将此问题交给选中的负责人。当前仅保存本地记录，不向外部发送消息。
        </div>
      </Modal>
      <Modal
        title="周会汇报摘要"
        width={760}
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={<Button onClick={() => window.print()}>打印当前汇报</Button>}
      >
        <div className="experience-report">
          <h2>{b.name}</h2>
          <p>
            截至 {day()} · 目标 {quantity(b.target)} {b.unit} · 截止{" "}
            {b.deadline}
          </p>
          <dl>
            <dt>实际末端产出</dt>
            <dd>
              {quantity(facts.produced)} {b.unit}
            </dd>
            <dt>已交付 / 已接受</dt>
            <dd>
              {quantity(facts.delivered)} / {quantity(facts.accepted)} {b.unit}
            </dd>
            <dt>当前链路预计缺口 · {ch?.name}</dt>
            <dd>
              {forecastGap == null
                ? "产能依据不完整，暂不预测"
                : quantity(forecastGap) + " " + b.unit}
            </dd>
          </dl>
          <h3>当前链路需关注</h3>
          {signals.length ? (
            signals.map((s) => (
              <p key={s.key}>
                <b>{s.title}</b>：{s.detail}
              </p>
            ))
          ) : (
            <p>暂无已识别的环节问题，持续核对实际产出。</p>
          )}
          <h3>已执行 / 待复查</h3>
          {pending.map((r: any) => (
            <p key={r.id}>
              {r.action} · {state.users.find((u) => u.id === r.ownerId)?.name} ·{" "}
              {r.reviewDate} 再核对
            </p>
          ))}
          <small>产能测算为计划推演；平台与通知接口尚未接入。</small>
        </div>
      </Modal>
      <Modal
        title="历史版本与完整信息"
        width="94vw"
        open={legacyOpen}
        onCancel={() => setLegacyOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {legacy}
      </Modal>
    </section>
  );
}
