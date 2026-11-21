import React from "react";
import { Button, Tag, Empty } from "antd";
import {
  ArrowRightOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FlagOutlined,
  InboxOutlined,
  ProfileOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { usePMC } from "../../api";
import { type Business, stageNames, day } from "../../../shared/types";
import {
  latest,
  productionData,
  productionFacts,
} from "../../../shared/production";
import { businessBlockers } from "../../../shared/process";
import { riskFacts, riskSummary, riskStates } from "../../../shared/risk";
import { experienceSignals, quantity } from "../production/experience-model";
import "./project-workspace.css";
export const projectSections = [
  {
    key: "summary",
    label: "项目总览",
    hint: "结果与下一步",
    icon: <ProfileOutlined />,
  },
  {
    key: "workflow",
    label: "流程与提交",
    hint: "推进当前阶段",
    icon: <FlagOutlined />,
  },
  {
    key: "orchestration",
    label: "生产编排",
    hint: "方案、产能与取数",
    icon: <ApartmentOutlined />,
  },
  {
    key: "delivery",
    label: "交付与验收",
    hint: "交付来源与客户反馈",
    icon: <CheckCircleOutlined />,
  },
  {
    key: "risk",
    label: "风险与处置",
    hint: "责任、动作与复查",
    icon: <SafetyOutlined />,
  },
  {
    key: "tasks",
    label: "协作待办",
    hint: "分工与阻塞事项",
    icon: <ClockCircleOutlined />,
  },
  {
    key: "production",
    label: "平台关联",
    hint: "已有平台项目与结果",
    icon: <InboxOutlined />,
  },
  {
    key: "details",
    label: "项目资料",
    hint: "需求、人员与文档",
    icon: <FileTextOutlined />,
  },
  {
    key: "records",
    label: "跟进与记录",
    hint: "沟通、变更与依据",
    icon: <FileTextOutlined />,
  },
];
export function ProjectWorkspace({
  business: b,
  active,
  onNavigate,
  children,
}: {
  business: Business;
  active: string;
  onNavigate: (key: string, context?: Record<string, string>) => void;
  children: React.ReactNode;
}) {
  const { state } = usePMC(),
    person = state.users.find((u) => u.id === b.ownerId)?.name || "待指定";
  const section = projectSections.find((s) => s.key === active);
  const tasks = state.tasks.filter(
    (t) => t.businessId === b.id && t.status !== "已完成",
  ).length;
  const risks = riskSummary(state, b.id).active.length;
  return (
    <div className="project-workspace">
      <header className="project-identity">
        <div>
          <div className="project-eyebrow">
            项目 {b.pid} <span>{b.customer}</span>
          </div>
          <h1>{b.name}</h1>
          <p>
            <span>项目经理 {person}</span>
            <span>
              交付目标 {quantity(b.target)} {b.unit}
            </span>
            <span>截止 {b.deadline || "待确定"}</span>
          </p>
        </div>
        <div className="project-current">
          <Tag>{stageNames[b.stage] || b.stage}</Tag>
          <Button onClick={() => onNavigate("workflow")}>
            查看阶段与提交 <ArrowRightOutlined />
          </Button>
        </div>
      </header>
      <div className="project-work-area">
        <nav className="project-navigation" aria-label="项目详情导航">
          {projectSections.map((s, i) => (
            <React.Fragment key={s.key}>
              {i === 6 && <div className="project-nav-divider">资料与追溯</div>}
              <button
                aria-current={active === s.key ? "page" : undefined}
                onClick={() => onNavigate(s.key)}
              >
                {s.icon}
                <span>{s.label}</span>
                {((s.key === "tasks" && tasks > 0) ||
                  (s.key === "risk" && risks > 0)) && (
                  <b>{s.key === "tasks" ? tasks : risks}</b>
                )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <main className={`project-content project-content-${active}`}>
          <header className="project-section-heading">
            <div>
              <h2>{section?.label || "项目详情"}</h2>
              <p>{section?.hint}</p>
            </div>
            {active !== "summary" && (
              <Button type="text" onClick={() => onNavigate("summary")}>
                返回总览
              </Button>
            )}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
export function ProjectSummary({
  business: b,
  onNavigate,
}: {
  business: Business;
  onNavigate: (key: string, context?: Record<string, string>) => void;
}) {
  const { state } = usePMC(),
    p = productionData(state, b.id),
    facts = productionFacts(state, b.id),
    risks = riskSummary(state, b.id),
    forecast = riskFacts(state, b.id),
    blockers = businessBlockers(state, b);
  const tasks = state.tasks
    .filter((t) => t.businessId === b.id && t.status !== "已完成")
    .sort((a, b) => a.due.localeCompare(b.due));
  const chains = p.chains.filter((c) => !c.voided);
  const signals = chains.flatMap((c) =>
    latest(c).mode === "pull"
      ? experienceSignals(p, c.id, latest(c)).map((s) => ({
          ...s,
          chain: c.name,
          chainId: c.id,
        }))
      : [],
  );
  const reviews = new Map<string, NonNullable<typeof p.flowReviews>[number]>();
  for (const r of p.flowReviews || [])
    reviews.set(r.chainId + ":" + r.issueKey, r);
  const due = [...reviews.values()].filter(
    (r) => r.status !== "verified" && r.reviewDate <= day(),
  );
  const overdue = tasks.filter((t) => t.due && t.due < day());
  const reasons: {
    title: string;
    detail: string;
    tab: string;
    context?: Record<string, string>;
  }[] = [
    ...blockers.map((x) => ({
      title: x.title || "阶段存在阻塞事项",
      detail: "处理后再推进阶段",
      tab: "tasks",
    })),
    ...due.map((r) => ({
      title: r.action,
      detail: `到期复查 ${r.reviewDate} · ${state.users.find((u) => u.id === r.ownerId)?.name || "待指定"}`,
      tab: "orchestration",
      context: {
        chainId: r.chainId,
        ...(r.nodeId ? { nodeId: r.nodeId } : {}),
      },
    })),
    ...risks.negative.map((r) => ({
      title: r.title,
      detail: `${r.level} · ${state.users.find((u) => u.id === r.ownerId)?.name || "待指定"} · ${riskStates[r.status] || r.status}`,
      tab: "risk",
      context: { riskId: r.id },
    })),
    ...signals
      .filter((s) => s.kind !== "data")
      .map((s) => ({
        title: s.title,
        detail: `${s.chain} · ${s.impact}`,
        tab: "orchestration",
        context: {
          chainId: s.chainId,
          ...(s.nodeId ? { nodeId: s.nodeId } : {}),
        },
      })),
  ];
  const next = b.completed
    ? "项目已完成，核对交付与归档记录"
    : blockers.length
      ? "先处理阻塞事项，再推进项目阶段"
      : due.length
        ? "先复查已执行动作，再核对新产出"
        : risks.negative.length
          ? `先处理 ${risks.negative.length} 项风险，核对对交付的影响`
          : signals.some((s) => s.kind !== "data")
            ? "先核对生产瓶颈，再调整当前方案"
            : `当前处于${stageNames[b.stage] || b.stage}，核对依据后继续推进`;
  return (
    <div className="project-summary">
      <section className="project-next">
        <div>
          <span className="project-eyebrow">当前重点</span>
          <h3>{next}</h3>
          <p>
            {reasons.length
              ? `${reasons.length} 项需要关注，${tasks.length} 项协作待办${overdue.length ? `，其中 ${overdue.length} 项已过期` : ""}。`
              : "当前没有已识别的待处理项。交期判断仍需核对生产计划与最新回传。"}
          </p>
        </div>
        <Button
          type="primary"
          onClick={() =>
            onNavigate(
              b.completed
                ? "records"
                : blockers.length
                  ? "tasks"
                  : due.length
                    ? "orchestration"
                    : risks.negative.length
                      ? "risk"
                      : signals.some((s) => s.kind !== "data")
                        ? "orchestration"
                        : "workflow",
            )
          }
        >
          {b.completed
            ? "查看归档记录"
            : blockers.length
              ? "处理阻塞"
              : due.length
                ? "查看待复查"
                : risks.negative.length
                  ? "查看待处理风险"
                  : signals.some((s) => s.kind !== "data")
                    ? "核对生产瓶颈"
                    : "继续当前阶段"}
          <ArrowRightOutlined />
        </Button>
      </section>
      <section className="project-delivery-judgment">
        <div>
          <span className="project-eyebrow">交付判断</span>
          <h3>
            {b.completed
              ? "项目已完成，可核对交付与归档记录"
              : b.target > 0 && facts.accepted >= b.target
                ? "客户接受量已达到目标，继续核对结项条件"
                : b.target > 0 && facts.produced >= b.target
                  ? "产量已覆盖目标，继续核对交付与验收"
                  : forecast.forecastDate && forecast.ready
                    ? `按实际日产速预计 ${forecast.forecastDate} 达到产量目标`
                    : "暂不能判断能否按期交付"}
          </h3>
          <p>
            产出尚差 {quantity(Math.max(0, b.target - facts.produced))} {b.unit}
            ；客户接受量尚差 {quantity(
              Math.max(0, b.target - facts.accepted),
            )}{" "}
            {b.unit}。
            {forecast.forecastDate && forecast.ready
              ? "产量预测还需结合质量、交付及客户验收核对。"
              : "有效日报、统计范围或回传依据尚未齐备，查看缺失条件后补齐。"}
          </p>
        </div>
        <Button onClick={() => onNavigate("risk", { riskView: "overview" })}>
          查看判断依据 <ArrowRightOutlined />
        </Button>
      </section>
      <section className="project-results" aria-label="项目结果">
        <div>
          <span>末端有效产出</span>
          <strong>
            {quantity(facts.produced)}
            <small>
              / {quantity(b.target)} {b.unit}
            </small>
          </strong>
          <p>项目累计，含历史链路产出</p>
        </div>
        <button onClick={() => onNavigate("delivery")}>
          <span>已交付</span>
          <strong>
            {quantity(facts.delivered)}
            <small>{b.unit}</small>
          </strong>
          <p>
            查看交付来源 <ArrowRightOutlined />
          </p>
        </button>
        <button onClick={() => onNavigate("delivery")}>
          <span>客户已接受</span>
          <strong>
            {quantity(facts.accepted)}
            <small>{b.unit}</small>
          </strong>
          <p>
            反馈与正式验收 <ArrowRightOutlined />
          </p>
        </button>
        <button onClick={() => onNavigate("risk")}>
          <span>待处置风险</span>
          <strong>
            {risks.negative.length}
            <small>项</small>
          </strong>
          <p>
            仅统计风险台账 <ArrowRightOutlined />
          </p>
        </button>
      </section>
      <div className="project-summary-grid">
        <section className="project-summary-section">
          <header>
            <h3>需要介入</h3>
            <span>{reasons.length} 项</span>
          </header>
          {reasons.length ? (
            reasons.slice(0, 4).map((r, i) => (
              <button
                className="project-attention-row"
                key={i}
                onClick={() => onNavigate(r.tab, r.context)}
              >
                <span className="project-attention-mark" />
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.detail}</small>
                </span>
                <ArrowRightOutlined />
              </button>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无已识别的关注项"
            />
          )}
          {signals.some((s) => s.kind === "data") && (
            <button
              className="project-data-note"
              onClick={() => onNavigate("orchestration")}
            >
              生产预测尚有 {signals.filter((s) => s.kind === "data").length}{" "}
              项依据待补齐，查看原因 <ArrowRightOutlined />
            </button>
          )}
        </section>
        <section className="project-summary-section">
          <header>
            <h3>近期安排</h3>
            <Button type="link" onClick={() => onNavigate("tasks")}>
              全部待办
            </Button>
          </header>
          {tasks.length ? (
            tasks.slice(0, 4).map((t) => (
              <button
                className="project-attention-row"
                key={t.id}
                onClick={() => onNavigate("tasks", { task: t.id })}
              >
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.owners
                      .map((id) => state.users.find((u) => u.id === id)?.name)
                      .filter(Boolean)
                      .join("、") || "待指定负责人"}{" "}
                    · {t.due || "未约定日期"}
                  </small>
                </span>
                <Tag>{t.status}</Tag>
              </button>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有未完成的协作待办"
            />
          )}
          <div className="project-data-note">
            跟进与处理记录集中保留，便于下一次打开时继续核对。
            <Button type="link" onClick={() => onNavigate("records")}>
              查看记录
            </Button>
          </div>
        </section>
      </div>
      <section className="project-summary-section project-production-entry">
        <div>
          <h3>生产方案</h3>
          <p>
            {chains.length} 条有效链路 · 平台负责生产，PMC 汇总输出与交付来源。
          </p>
        </div>
        <Button onClick={() => onNavigate("orchestration")}>
          查看生产编排 <ArrowRightOutlined />
        </Button>
      </section>
    </div>
  );
}
