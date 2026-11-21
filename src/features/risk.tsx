/** F13/F14: risk overview, explainable projections, ledger and management cockpit. */
import React, { useState, useEffect } from "react";
import {
  QuestionCircleOutlined,
  ClockCircleOutlined,
  ProjectOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  ArrowRightOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { Chart } from "./dashboard";
import type { EChartsOption } from "echarts";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Segmented,
  Tooltip,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import "./risk.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { usePMC } from "../api";
import { Files } from "../components/Files";
import {
  riskFacts,
  riskTrendRows,
  riskBusinessPath,
  riskSourcePath,
  riskSummary,
  riskConfig,
  riskStates,
  categories,
  highest,
  quantiles,
  diff,
} from "../../shared/risk";
import { displayProjectRisk } from "../../shared/reports";
import { addDays, day, stageNames } from "../../shared/types";
const money = (n: any) =>
    n == null
      ? "待核算"
      : "¥" + (n / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
  num = (n: any) =>
    n == null
      ? "—"
      : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const badge = (n: any) =>
  n ? (
    <Tag color={n === "P0" ? "red" : n === "P1" ? "orange" : "blue"}>{n}</Tag>
  ) : (
    <Tag>未触发</Tag>
  );
function Explain({
  title,
  children,
  trace,
}: {
  title: string;
  children?: React.ReactNode;
  trace: any;
}) {
  const [open, set] = useState(false);
  return (
    <>
      <Typography.Link onClick={() => set(true)}>
        {children || "ⓘ " + title}
      </Typography.Link>
      <Drawer open={open} onClose={() => set(false)} title={title} width={620}>
        <Alert
          type="info"
          message="计算解释 · 当前业务事实"
          description="零产出与缺报独立；统计窗口截至昨日。历史日基线按当前目标和截止日回算。分位数为情景参考，不是概率保证。"
        />
        {trace?.b ? (
          <FactsExplanation facts={trace} />
        ) : Array.isArray(trace) ? (
          trace.map((f, i) => (
            <Card size="small" key={i} title={(f.window || i + 1) + "天窗口"}>
              <FactsExplanation facts={f} />
            </Card>
          ))
        ) : (
          <p>
            系统当前依据与首次识别依据分别保留。人工等级生效时保留系统建议，条件解除后仍需负责人确认关闭。
          </p>
        )}
        <details style={{ marginTop: 20 }}>
          <summary>展开字段与原始计算快照</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {JSON.stringify(trace, null, 2)}
          </pre>
        </details>
      </Drawer>
    </>
  );
}
function LineChart({
  rows,
  fields,
  refs = [],
}: {
  rows: any[];
  fields: { key: string; name: string; color: string; dash?: boolean }[];
  refs?: { value: number; name: string }[];
}) {
  const [point, set] = useState<any>();
  if (!rows.length) return <Empty description="暂无可绘制的带日期数据" />;
  const values = rows
    .flatMap((r) => fields.map((f) => r[f.key]))
    .concat(refs.map((r) => r.value))
    .filter((x) => typeof x === "number" && Number.isFinite(x));
  const max = Math.max(1, ...values),
    W = 800,
    H = 240,
    x = (i: number) =>
      50 +
      (diff(rows[0].date, rows[i].date) /
        Math.max(1, diff(rows[0].date, rows.at(-1).date))) *
        700,
    y = (v: number) => 200 - (v / max) * 170;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", minWidth: 300 }}
        role="img"
        aria-label="业务趋势图"
      >
        <line x1="50" y1="200" x2="750" y2="200" stroke="#cad6e3" />
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              x1="50"
              x2="750"
              y1={y(max * p)}
              y2={y(max * p)}
              stroke="#edf1f5"
            />
            <text x="45" y={y(max * p) + 4} textAnchor="end" fontSize="11">
              {num(max * p)}
            </text>
          </g>
        ))}
        {refs.map((r) => (
          <g key={r.name}>
            <line
              x1="50"
              x2="750"
              y1={y(r.value)}
              y2={y(r.value)}
              stroke="#bd7342"
              strokeDasharray="5 4"
            />
            <text x="750" y={y(r.value) - 4} textAnchor="end" fontSize="10">
              {r.name}
            </text>
          </g>
        ))}
        {fields.map((f) => (
          <g key={f.key}>
            {rows
              .slice(1)
              .map((r, i) =>
                r[f.key] != null && rows[i][f.key] != null ? (
                  <line
                    key={i}
                    x1={x(i)}
                    y1={y(rows[i][f.key])}
                    x2={x(i + 1)}
                    y2={y(r[f.key])}
                    stroke={f.color}
                    strokeWidth="2"
                    strokeDasharray={f.dash ? "5 4" : undefined}
                  />
                ) : null,
              )}
            {rows.map((r, i) =>
              r[f.key] != null ? (
                <circle
                  tabIndex={0}
                  key={i}
                  cx={x(i)}
                  cy={y(r[f.key])}
                  r="4"
                  fill={f.color}
                  onClick={() => set({ ...r, line: f.name })}
                  onFocus={() => set({ ...r, line: f.name })}
                >
                  <title>
                    {r.date} · {f.name} {num(r[f.key])}
                  </title>
                </circle>
              ) : null,
            )}
          </g>
        ))}
        {rows.map((r, i) =>
          i === 0 ||
          i === rows.length - 1 ||
          i === Math.floor(rows.length / 2) ? (
            <text key={i} x={x(i)} y="225" textAnchor="middle" fontSize="11">
              {r.date}
            </text>
          ) : null,
        )}
      </svg>
      <Space wrap>
        {fields.map((f) => (
          <Tag key={f.key} color={f.color}>
            {f.name}
          </Tag>
        ))}
      </Space>
      {point && (
        <Alert
          closable
          onClose={() => set(null)}
          message={point.date + " · " + point.line}
          description={
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(point, null, 2)}
            </pre>
          }
        />
      )}
    </div>
  );
}
export function RiskPanel({
  businessId,
  workspace = false,
}: {
  businessId: string;
  workspace?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  return (
    <Tabs
      activeKey={
        params.get("riskView") ||
        (workspace || params.has("riskId") ? "ledger" : "overview")
      }
      onChange={(key) => {
        const next = new URLSearchParams(params);
        next.set("riskView", key);
        setParams(next, { replace: true });
      }}
      items={[
        {
          key: "overview",
          label: workspace ? "预测与判断依据" : "风险概览",
          children: <Overview businessId={businessId} />,
        },
        {
          key: "trend",
          label: "项目趋势",
          children: <Trend businessId={businessId} />,
        },
        {
          key: "ledger",
          label: "风险台账",
          children: (
            <RiskLedger
              businessId={businessId}
              focusId={params.get("riskId") || undefined}
            />
          ),
        },
      ]}
    />
  );
}
function Overview({ businessId }: { businessId: string }) {
  const { state } = usePMC(),
    f = riskFacts(state, businessId),
    sum = riskSummary(state, businessId),
    navigate = useNavigate();
  if (f.b.kind === "opportunity")
    return (
      <Card title="商机风险概览">
        <p>商机阶段通过人工风险台账管理；正式生产趋势在立项后展示。</p>
        {badge(sum.level)} {sum.active.length}项待处理
      </Card>
    );
  const ratio = f.b.target ? f.p.accepted / f.b.target : 0,
    impactLevel = highest(
      sum.negative
        .filter(
          (r) =>
            r.source === "SYSTEM" &&
            /:(COST|COST_FORECAST|OVERDUE|FORECAST)$/.test(r.signalKey || ""),
        )
        .map((r) => r.level),
    );
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert
        message={
          <Space>
            交付与成本预警 {badge(impactLevel)}{" "}
            <small>全局规则 v{f.c.version}</small>
          </Space>
        }
        type={impactLevel === "P0" ? "error" : impactLevel ? "warning" : "info"}
        description={
          f.forecastDate
            ? "预计完成 " + f.forecastDate + " · 正式截止 " + f.b.deadline
            : "待有效日产速，暂无法预计完成"
        }
      />
      <p className="muted">
        交付与成本预警仅看项目交付和成本条件；含节点、人工风险的项目综合等级{" "}
        {badge(sum.level)}。
      </p>
      <PushAlert businessId={businessId} />
      <Row gutter={[16, 16]}>
        {[
          [
            "客户接受 / 项目目标",
            num(f.p.accepted) + " / " + num(f.b.target) + " " + f.b.unit,
          ],
          ["累计有效生产", num(f.p.produced) + " " + f.b.unit],
          ["当前实际成本", money(f.actual)],
          ["预计基准总成本", money(f.forecastCost)],
        ].map(([label, value]) => (
          <Col xs={24} md={6} key={label}>
            <Card>
              <Statistic title={label} value={value} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="判断依据 · 项目进度">
        <p>交付进度（以客户接受量计算）</p>
        <Progress percent={Math.min(100, Math.round(ratio * 100))} />
        <Descriptions
          column={2}
          items={[
            {
              key: "rate",
              label: "有效日产速",
              children: num(f.rate) + " " + f.b.unit + "/日",
            },
            {
              key: "deadline",
              label: "正式截止",
              children: f.b.deadline || "未提供",
            },
            {
              key: "cost",
              label: "成本进度",
              children: money(f.actual) + " / " + money(f.b.budget),
            },
            {
              key: "time",
              label: "时间进度",
              children:
                f.b.startDate &&
                f.b.deadline &&
                diff(f.b.startDate, f.b.deadline) > 0
                  ? num(
                      (Math.max(0, diff(f.b.startDate, day())) /
                        diff(f.b.startDate, f.b.deadline)) *
                        100,
                    ) + "%"
                  : "待正式生产周期",
            },
            {
              key: "gap",
              label: "截止日预计生产缺口",
              children:
                f.remaining === 0
                  ? 0
                  : f.remaining != null && f.rate != null && f.daysLeft != null
                    ? num(Math.max(0, f.remaining - f.rate * f.daysLeft)) +
                      " " +
                      f.b.unit
                    : "待日产速",
            },
            {
              key: "over",
              label: "预计超预算",
              children:
                f.forecastCost != null && f.b.budget > 0
                  ? money(Math.max(0, f.forecastCost - f.b.budget))
                  : "待成本事实",
            },

            { key: "days", label: "剩余自然日", children: num(f.daysLeft) },
            { key: "need", label: "日基线", children: num(f.required) },
            {
              key: "delta",
              label: "还需增加日产量",
              children:
                f.rate != null && f.required != null
                  ? num(Math.max(0, f.required - f.rate))
                  : "待数据",
            },
          ]}
        />
        <Explain title="进度与预测口径" trace={f} />
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="接下来怎么做 · 生产安排">
            <p>
              先核对日产出与数据缺报，再确认供给、排期和生产方案。系统不自动承诺人数。
            </p>
            <Button
              onClick={() => navigate(riskBusinessPath(f.b, "production"))}
            >
              查看生产编排
            </Button>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="接下来怎么做 · 成本方案">
            <p>
              已发生成本是固定事实；预计总成本仅增加剩余待加工量。调整预算需人工决策。
            </p>
            <Button onClick={() => navigate(riskBusinessPath(f.b, "workflow"))}>
              核对项目预算
            </Button>
          </Card>
        </Col>
      </Row>
      {sum.recovered > 0 && (
        <Alert
          type="success"
          message={sum.recovered + "项旧系统条件已解除，等待负责人确认关闭"}
        />
      )}
    </Space>
  );
}
function Trend({ businessId }: { businessId: string }) {
  const { state } = usePMC(),
    [window, setWindow] = useState(7),
    [basis, setBasis] = useState("production"),
    [costBasis, setCostBasis] = useState("production"),
    [view, setView] = useState("forecast"),
    [costView, setCostView] = useState("total");
  const f = riskFacts(state, businessId, window, basis),
    cost = riskFacts(state, businessId, window, costBasis);
  if (f.b.kind !== "project")
    return <Empty description="正式生产趋势待立项后展示" />;
  const forecastRows = riskTrendRows(f),
    costRows = riskTrendRows(cost, "cost", costView);
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <strong>项目生产与成本趋势</strong>
        <Button disabled title="日视图统计范围尚未开放">
          天
        </Button>
        <Select
          value={window}
          onChange={setWindow}
          options={[
            { value: 7, label: "周" },
            { value: 14, label: "双周" },
            { value: 30, label: "月" },
          ]}
        />
      </Space>
      <Alert
        type={!f.ready ? "warning" : "info"}
        message={`自然日统计截至昨日 · 有效完整日 ${f.stats?.count || 0}/${window} · 门槛 ${f.threshold} 日`}
        description={
          !f.aligned
            ? "累计量与带日期明细未对齐或存在范围重叠，不外推统计等级。"
            : !f.ready
              ? "完整有效日不足或日报已过期；保留实际事实，不强行预测。"
              : "采用当前目标与截止日回算；视图切换不改变全局规则。"
        }
      />
      <Card
        title="产能与交付时间预测"
        extra={
          <Select
            value={basis}
            onChange={setBasis}
            options={[
              { value: "production", label: "生产口径（默认）" },
              { value: "acceptance", label: "验收口径（对照）" },
            ]}
          />
        }
      >
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="窗口常态日产出（中位数）"
              value={num(f.stats?.median)}
              suffix={f.b.unit + "/日"}
            />
          </Col>
          <Col span={8}>
            <Statistic title="当前日基线" value={num(f.required)} />
          </Col>
          <Col span={8}>
            <Statistic title="剩余待完成" value={num(f.remaining)} />
          </Col>
        </Row>
        <Row gutter={12} style={{ marginTop: 20 }}>
          {Object.values<any>(f.scenarios).map((x) => (
            <Col span={8} key={x.key}>
              <Card size="small" title={x.label}>
                <Typography.Title level={4}>
                  {x.date || "暂不能推算"}
                </Typography.Title>
                <p>
                  {x.delay == null
                    ? "待有效数据"
                    : x.delay > 0
                      ? "预计延期 " + x.delay + " 天"
                      : x.delay === 0
                        ? "预计按时"
                        : "预计提前 " + -x.delay + " 天"}
                </p>
                <small>
                  {num(x.rate)} {f.b.unit}/日 ·{" "}
                  {x.duration == null ? "—" : x.duration + "个自然日"}
                </small>
              </Card>
            </Col>
          ))}
        </Row>
        <p className="muted">
          P5／P95 为工期情景：乐观用高日产速 P95，保守用低日产速
          P5；完成时间向上取整到自然日。
        </p>
        <Select
          value={view}
          onChange={setView}
          options={[
            { value: "forecast", label: "交付时间预测" },
            { value: "rate", label: "产能速率" },
          ]}
        />
        <LineChart
          rows={
            view === "rate"
              ? forecastRows.filter((r) => r.date < f.today)
              : forecastRows
          }
          fields={
            view === "rate"
              ? [
                  { key: "quantity", name: "有效日产出", color: "#477eaf" },
                  {
                    key: "baseline",
                    name: "动态日基线",
                    color: "#bd7342",
                    dash: true,
                  },
                ]
              : [
                  { key: "actual", name: "实际累计", color: "#477eaf" },
                  {
                    key: "optimistic",
                    name: "乐观",
                    color: "#26997a",
                    dash: true,
                  },
                  { key: "base", name: "基准", color: "#ad7a25", dash: true },
                  {
                    key: "conservative",
                    name: "保守",
                    color: "#9b70ae",
                    dash: true,
                  },
                ]
          }
          refs={
            view === "forecast" ? [{ value: f.b.target, name: "项目目标" }] : []
          }
        />
        <Stats stats={f.stats} />
        <Explain title="产能来源与分位数计算" trace={f} />
      </Card>
      <Card
        title="成本消耗与预测"
        extra={
          <Select
            value={costBasis}
            onChange={setCostBasis}
            options={[
              { value: "production", label: "生产口径（默认）" },
              { value: "acceptance", label: "验收口径（对照）" },
            ]}
          />
        }
      >
        <p>
          {costBasis === "production"
            ? "剩余待加工量=目标－有效生产；已生产未验收部分不重复计成本。"
            : "验收对照包含已生产未验收量，可能高估未来加工成本，不改变默认台账。"}
        </p>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="已发生成本" value={money(cost.actual)} />
          </Col>
          <Col span={8}>
            <Statistic title="生产总预算" value={money(cost.budget)} />
          </Col>
          <Col span={8}>
            <Statistic
              title="窗口单位成本（中位数）"
              value={money(cost.unit?.median)}
            />
          </Col>
        </Row>
        <Row gutter={12} style={{ marginTop: 20 }}>
          {Object.entries<any>(cost.costScenarios).map(([key, x]) => (
            <Col span={8} key={key}>
              <Card
                size="small"
                title={
                  key === "optimistic"
                    ? "乐观 · P5"
                    : key === "base"
                      ? "基准 · 中位数"
                      : "保守 · P95"
                }
              >
                <Typography.Title level={4}>{money(x.total)}</Typography.Title>
                <p>未来待发生 {money(x.future)}</p>
                <p>
                  {x.total == null
                    ? "待有效样本"
                    : x.total > cost.budget
                      ? "预计超预算 " + money(x.total - cost.budget)
                      : "预计结余 " + money(cost.budget - x.total)}
                </p>
              </Card>
            </Col>
          ))}
        </Row>
        <p>
          预计总成本 = 实际成本 + 剩余待加工量 × 窗口单位成本。P5～P95
          是情景范围，不是95%置信区间。
        </p>
        <Select
          value={costView}
          onChange={setCostView}
          options={[
            { value: "total", label: "累计成本与总额预测" },
            { value: "unit", label: "单位成本" },
            { value: "remaining", label: "剩余成本预测" },
          ]}
        />
        <LineChart
          rows={
            costView === "unit"
              ? cost.rows.map((r) => ({
                  ...r,
                  value:
                    r.quantity! > 0 && r.cost != null
                      ? r.cost / r.quantity! / 100
                      : null,
                }))
              : costRows
          }
          fields={
            costView === "unit"
              ? [
                  {
                    key: "value",
                    name: "原始日单位成本（元）",
                    color: "#477eaf",
                  },
                ]
              : [
                  {
                    key: "actual",
                    name: "实际累计成本（元）",
                    color: "#477eaf",
                  },
                  {
                    key: "optimistic",
                    name: "乐观P5（元）",
                    color: "#26997a",
                    dash: true,
                  },
                  {
                    key: "base",
                    name: "基准（元）",
                    color: "#ad7a25",
                    dash: true,
                  },
                  {
                    key: "conservative",
                    name: "保守P95（元）",
                    color: "#9b70ae",
                    dash: true,
                  },
                ]
          }
          refs={
            costView === "unit"
              ? []
              : [
                  {
                    value:
                      costView === "remaining"
                        ? Math.max(0, cost.budget - (cost.actual || 0)) / 100
                        : cost.budget / 100,
                    name:
                      costView === "remaining" ? "预算剩余额度" : "生产总预算",
                  },
                ]
          }
        />
        <Stats stats={cost.unit} moneyMode />
        <Explain title="成本预测与窗口数据" trace={cost} />
      </Card>
      <Card title="逐日数据及多窗口依据">
        <Table
          size="small"
          rowKey="date"
          dataSource={f.rows}
          pagination={false}
          columns={[
            { title: "日期", dataIndex: "date" },
            { title: "有效产量", dataIndex: "quantity", render: num },
            { title: "成本", dataIndex: "cost", render: money },
            {
              title: "状态",
              render: (_, r) => (r.quantity == null ? "缺报" : "有效日报"),
            },
          ]}
        />
        <Explain
          title="7/14/30天全局窗口依据"
          trace={[7, 14, 30].map((w) => riskFacts(state, businessId, w))}
        />
      </Card>
    </Space>
  );
}
function Stats({
  stats,
  moneyMode = false,
}: {
  stats: any;
  moneyMode?: boolean;
}) {
  if (!stats) return <p>样本不足</p>;
  return (
    <Descriptions
      size="small"
      column={4}
      items={["mean", "median", "p5", "p95", "min", "max", "sd", "cv"].map(
        (key) => ({
          key,
          label: {
            mean: "均值",
            median: "中位数",
            p5: "P5",
            p95: "P95",
            min: "最小",
            max: "最大",
            sd: "标准差",
            cv: "CV",
          }[key],
          children:
            moneyMode && key !== "cv" ? money(stats[key]) : num(stats[key]),
        }),
      )}
    />
  );
}
export function RiskLedger({
  businessId,
  focusId,
}: {
  businessId?: string;
  focusId?: string;
}) {
  const { state, user, command } = usePMC(),
    [draft, setDraft] = useState<any>({ status: "ACTIVE" }),
    [filters, setFilters] = useState<any>({ status: "ACTIVE" }),
    [detail, setDetail] = useState<string>(focusId),
    [edit, setEdit] = useState<any>(),
    [config, setConfig] = useState(false),
    [push, setPush] = useState(false);
  useEffect(() => {
    if (
      focusId &&
      state.risks.some(
        (r) => r.id === focusId && (!businessId || r.businessId === businessId),
      )
    )
      setDetail(focusId);
  }, [focusId, businessId]);
  const rows = state.risks.filter(
    (r) =>
      (!businessId || r.businessId === businessId) &&
      (!filters.q ||
        JSON.stringify(r).includes(filters.q) ||
        state.businesses
          .find((b) => b.id === r.businessId)
          ?.name.includes(filters.q)) &&
      (!filters.level || r.level === filters.level) &&
      (!filters.source || r.source === filters.source) &&
      (!filters.attribute || r.attribute === filters.attribute) &&
      (!filters.status ||
        (filters.status === "ACTIVE"
          ? r.status !== "ARCHIVED"
          : r.status === filters.status)) &&
      (!filters.owner || r.ownerId === filters.owner) &&
      (!filters.category || r.category === filters.category) &&
      (!filters.reportLevel || r.reportLevel === filters.reportLevel) &&
      (!filters.receipt ||
        state.notifications.some(
          (n) =>
            n.riskId === r.id &&
            (filters.receipt === "read" ? n.read : !n.read),
        )) &&
      (!filters.feedback ||
        r.feedback?.some((f) => f.status === filters.feedback)) &&
      (!filters.condition ||
        (filters.condition === "recovered"
          ? r.recovered
          : filters.condition === "unknown"
            ? r.dataUnknown
            : r.source === "SYSTEM" && !r.recovered && !r.dataUnknown)),
  );
  const risk = state.risks.find(
      (r) => r.id === detail && (!businessId || r.businessId === businessId),
    ),
    readonly = user.role === "viewer";
  const exportRows = () => {
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        风险ID: r.id,
        业务: state.businesses.find((b) => b.id === r.businessId)?.name,
        风险: r.title,
        来源: r.source,
        属性: r.attribute,
        等级: r.level,
        状态: riskStates[r.status],
        负责人: state.users.find((u) => u.id === r.ownerId)?.name,
        依据: JSON.stringify(r.signal?.evidence || r.description),
        关联跟进: (r.followIds || []).join(","),
        反馈: JSON.stringify(r.feedback),
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "风险台账");
    XLSX.writeFile(book, "风险台账_" + day() + ".xlsx");
  };
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap>
        <Button
          type="primary"
          disabled={readonly}
          onClick={() => setEdit({ businessId })}
        >
          新增风险
        </Button>
        <Button onClick={() => command("risk.evaluate")} disabled={readonly}>
          重新评估
        </Button>
        <Button onClick={exportRows} disabled={!rows.length}>
          导出台账
        </Button>
        {businessId ? (
          <Button disabled={readonly} onClick={() => setPush(true)}>
            推送状态
          </Button>
        ) : (
          <Button onClick={() => setConfig(true)}>全局风险规则</Button>
        )}
      </Space>
      {businessId && <PushAlert businessId={businessId} />}
      <Row gutter={12}>
        {["P0", "P1", "P2"].map((l) => (
          <Col span={6} key={l}>
            <Card
              size="small"
              hoverable
              onClick={() =>
                setFilters({ ...filters, level: l, attribute: "THREAT" })
              }
            >
              <Statistic
                title={l + "风险"}
                value={
                  rows.filter(
                    (r) => r.level === l && r.attribute !== "OPPORTUNITY",
                  ).length
                }
              />
              <small>
                涉及{" "}
                {
                  new Set(
                    rows.filter((r) => r.level === l).map((r) => r.businessId),
                  ).size
                }{" "}
                个业务
              </small>
            </Card>
          </Col>
        ))}
        <Col span={6}>
          <Card
            size="small"
            hoverable
            onClick={() => setFilters({ status: "", feedback: "待复核" })}
          >
            <Statistic
              title="待复核反馈"
              value={
                state.risks.filter(
                  (r) =>
                    (!businessId || r.businessId === businessId) &&
                    r.feedback?.some((f) => f.status === "待复核"),
                ).length
              }
            />
            <small>包括已归档风险</small>
          </Card>
        </Col>
      </Row>
      <Card size="small">
        <Space wrap>
          <Input
            placeholder="搜索风险 / 项目 / PID"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            style={{ width: 220 }}
          />
          {[
            { key: "level", name: "全部等级", values: ["P0", "P1", "P2"] },
            { key: "source", name: "全部来源", values: ["SYSTEM", "MANUAL"] },
            {
              key: "reportLevel",
              name: "全部上报等级",
              values: ["NORMAL", "ESCALATED", "MAJOR"],
            },
            {
              key: "receipt",
              name: "全部通知回执",
              values: ["read", "unread"],
            },
            {
              key: "status",
              name: "全部状态",
              values: ["ACTIVE", ...Object.keys(riskStates)],
            },
            {
              key: "attribute",
              name: "威胁与机会",
              values: ["THREAT", "OPPORTUNITY"],
            },
            {
              key: "category",
              name: "全部分类",
              values: Object.keys(categories),
            },
            {
              key: "condition",
              name: "全部计算状态",
              values: ["triggered", "recovered", "unknown"],
            },
          ].map((x) => (
            <Select
              allowClear
              key={x.key}
              placeholder={x.name}
              value={draft[x.key]}
              style={{ minWidth: 140 }}
              onChange={(v) => setDraft({ ...draft, [x.key]: v })}
              options={x.values.map((v) => ({
                value: v,
                label:
                  riskStates[v] ||
                  categories[v] ||
                  {
                    ACTIVE: "未归档",
                    NORMAL: "普通上报",
                    ESCALATED: "升级上报",
                    MAJOR: "重大上报",
                    read: "站内已查看",
                    unread: "站内待查看",
                    SYSTEM: "系统计算",
                    MANUAL: "人工识别",
                    THREAT: "威胁",
                    OPPORTUNITY: "机会",
                    triggered: "系统当前触发",
                    recovered: "已解除待复核",
                    unknown: "数据待核对",
                  }[v] ||
                  v,
              }))}
            />
          ))}
          <Select
            allowClear
            placeholder="全部负责人"
            value={draft.owner}
            onChange={(v) => setDraft({ ...draft, owner: v })}
            options={state.users.map((u) => ({ value: u.id, label: u.name }))}
            style={{ width: 140 }}
          />
          <Button type="primary" onClick={() => setFilters(draft)}>
            查询
          </Button>
          <Button
            onClick={() => {
              setDraft({ status: "ACTIVE" });
              setFilters({ status: "ACTIVE" });
            }}
          >
            重置
          </Button>
        </Space>
        <p className="muted">
          筛选修改后点击查询生效；机会不计负面风险。共 {rows.length} 项 · 涉及{" "}
          {new Set(rows.map((r) => r.businessId)).size} 个业务
        </p>
      </Card>
      <Table
        rowKey="id"
        size="small"
        dataSource={rows}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        columns={[
          {
            title: "等级 / 状态",
            width: 170,
            render: (_, r) => (
              <>
                {badge(r.level)}
                <Tag>{riskStates[r.status]}</Tag>
                {r.recovered && <small>条件已解除 · 待复核</small>}
                {r.dataUnknown && <small>数据待核对</small>}
              </>
            ),
          },
          {
            title: "风险与依据",
            width: 280,
            render: (_, r) => (
              <>
                <Typography.Link
                  onClick={() => {
                    setDetail(r.id);
                    command("risk.read", { id: r.id });
                  }}
                >
                  {r.title}
                </Typography.Link>
                <p className="muted">
                  {r.source === "SYSTEM"
                    ? evidenceText(r.signal)
                    : r.description}
                </p>
              </>
            ),
          },
          {
            title: "项目 / 商机",
            width: 200,
            render: (_, r) => {
              const b = state.businesses.find((b) => b.id === r.businessId)!;
              return (
                <Popover
                  title={b.name}
                  content={
                    <div>
                      <p>
                        PID {b.pid} · {stageNames[b.stage]} · {b.customer}
                      </p>
                      <p>
                        项目经理{" "}
                        {state.users.find((u) => u.id === b.ownerId)?.name} ·
                        截止 {b.deadline || "未设置"}
                      </p>
                      <Button onClick={() => setDetail(r.id)}>
                        查看关联风险
                      </Button>
                    </div>
                  }
                >
                  <Typography.Link onClick={() => setDetail(r.id)}>
                    {b.name}
                  </Typography.Link>
                </Popover>
              );
            },
          },
          {
            title: "来源 / 属性",
            render: (_, r) => (
              <>
                {r.source === "SYSTEM" ? "系统计算" : "人工识别"}
                <br />
                {r.attribute === "OPPORTUNITY" ? "机会" : "威胁"}
              </>
            ),
          },
          {
            title: "负责人 / 期限",
            render: (_, r) => (
              <>
                {state.users.find((u) => u.id === r.ownerId)?.name}
                <br />
                {r.due || "待设置"}
              </>
            ),
          },
          {
            title: "通知",
            render: (_, r) => {
              const ns = state.notifications.filter((n) => n.riskId === r.id);
              return (
                <>
                  {ns.filter((n) => !n.read).length}条待查看
                  <br />
                  <small>站内模拟 · 飞书未连接</small>
                </>
              );
            },
          },
          {
            title: "操作",
            fixed: "right",
            render: (_, r) => (
              <Button type="link" onClick={() => setDetail(r.id)}>
                查看处理
              </Button>
            ),
          },
        ]}
      />
      {risk && (
        <RiskDetail
          risk={risk}
          onClose={() => setDetail(undefined)}
          onEdit={() => setEdit(risk)}
        />
      )}
      <RiskEditor value={edit} onClose={() => setEdit(undefined)} />
      {config && <Config onClose={() => setConfig(false)} />}
      <ActionModal
        open={push}
        title="当前项目风险推送状态"
        onClose={() => setPush(false)}
        fields={
          <>
            <Form.Item name="mode" label="推送状态" initialValue="RUNNING">
              <Select
                options={[
                  { value: "RUNNING", label: "正常监控" },
                  { value: "PREPARING", label: "筹备阶段（计算保留）" },
                  { value: "PAUSED", label: "计划暂停（计算保留）" },
                ]}
              />
            </Form.Item>
            <Form.Item name="resumeDate" label="预计恢复日期">
              <Input type="date" />
            </Form.Item>
            <Alert message="只暂停推送，不停止风险计算，不延长交付截止时间。" />
          </>
        }
        save={(v) => command("risk.push", { ...v, businessId })}
      />
    </Space>
  );
}
export const RiskLedgerPage = RiskLedger;
function ActionModal({
  open,
  title,
  fields,
  onClose,
  save,
}: {
  open: boolean;
  title: string;
  fields?: React.ReactNode;
  onClose: () => void;
  save: (v: any) => Promise<any>;
}) {
  const [form] = Form.useForm();
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        await save(v);
        form.resetFields();
        onClose();
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        {fields}
        <Form.Item
          name="reason"
          label="操作原因 / 记录"
          rules={[{ required: true }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
function RiskEditor({ value, onClose }: { value: any; onClose: () => void }) {
  const { state, command, user } = usePMC(),
    [form] = Form.useForm(),
    [files, setFiles] = useState<any[]>([]),
    [dirty, setDirty] = useState(false),
    [more, setMore] = useState(false);
  React.useEffect(() => {
    if (value) {
      form.setFieldsValue({
        level: "P2",
        attribute: "THREAT",
        category: "B7",
        ownerId: user.id,
        reportLevel: "NORMAL",
        strategy: "减轻",
        ...value,
      });
      setFiles(value.files || []);
      setDirty(false);
    }
  }, [value]);
  const bid = Form.useWatch("businessId", form);
  const close = () => {
    if (dirty)
      Modal.confirm({ title: "放弃未保存的风险修改？", onOk: onClose });
    else onClose();
  };
  return (
    <Drawer
      open={!!value}
      onClose={close}
      title={value?.id ? "编辑人工风险" : "新增人工风险"}
      width={780}
      extra={
        <Button
          type="primary"
          onClick={async () => {
            const v = await form.validateFields();
            await command(value.id ? "risk.edit" : "risk.create", {
              ...value,
              ...v,
              files,
            });
            setDirty(false);
            onClose();
          }}
        >
          保存风险
        </Button>
      }
    >
      <Form form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="businessId"
              label="所属项目 / 商机"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!value?.id}
                options={state.businesses
                  .filter((b) => !b.completed)
                  .map((b) => ({ value: b.id, label: b.name }))}
              />
            </Form.Item>
          </Col>
          {[
            ["title", "风险名称"],
            ["description", "触发条件"],
            ["impact", "影响范围"],
            ["response", "应对策略详情"],
          ].map(([key, label]) => (
            <Col span={24} key={key}>
              <Form.Item name={key} label={label} rules={[{ required: true }]}>
                <Input.TextArea rows={key === "title" ? 1 : 2} />
              </Form.Item>
            </Col>
          ))}
          {[
            {
              key: "level",
              label: "风险等级",
              opts: ["P0", "P1", "P2"].map((v) => ({ value: v, label: v })),
            },
            {
              key: "category",
              label: "风险分类",
              opts: Object.entries(categories).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: "attribute",
              label: "风险属性",
              opts: [
                { value: "THREAT", label: "威胁" },
                { value: "OPPORTUNITY", label: "机会" },
              ],
            },
            {
              key: "ownerId",
              label: "负责人",
              opts: state.users.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              key: "reportLevel",
              label: "上报等级",
              opts: [
                { value: "NORMAL", label: "普通" },
                { value: "ESCALATED", label: "升级上报" },
                { value: "MAJOR", label: "重大上报" },
              ],
            },
            {
              key: "strategy",
              label: "应对策略",
              opts: [
                "规避",
                "转移",
                "减轻",
                "接受",
                "开拓",
                "提高",
                "分享",
              ].map((v) => ({ value: v, label: v })),
            },
          ].map((x) => (
            <Col span={12} key={x.key}>
              <Form.Item name={x.key} label={x.label}>
                <Select options={x.opts} />
              </Form.Item>
            </Col>
          ))}
          <Col span={12}>
            <Form.Item name="due" label="处理期限">
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Button onClick={() => setMore(!more)}>
          {more ? "收起" : "更多配置"}
        </Button>
        {more && (
          <>
            <Form.Item name="cc" label="抄送人">
              <Select
                mode="multiple"
                options={state.users.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="tags" label="不确定性标签">
              <Select
                mode="multiple"
                options={["波动性", "模糊性", "复杂性", "歧义性"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Form.Item>
            <Form.Item name="scene" label="触发场景">
              <Input />
            </Form.Item>
            <Form.Item name="followIds" label="关联跟进">
              <Select
                mode="multiple"
                options={state.followups
                  .filter((f) => f.businessId === bid && !f.deleted)
                  .map((f) => ({ value: f.id, label: f.text.slice(0, 90) }))}
              />
            </Form.Item>
            <Files
              value={files}
              onChange={(v) => {
                setFiles(v);
                setDirty(true);
              }}
              limit={5}
              maxMB={10}
            />
          </>
        )}
      </Form>
    </Drawer>
  );
}
function RiskDetail({
  risk: r,
  onClose,
  onEdit,
}: {
  risk: any;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { state, user, command } = usePMC(),
    [op, setOp] = useState(""),
    [confirm, setConfirm] = useState<any>(),
    [pending, setPending] = useState<any>(),
    [levelForm] = Form.useForm();
  const b = state.businesses.find((b) => b.id === r.businessId)!,
    readonly = b.completed || r.status === "ARCHIVED" || user.role === "viewer",
    navigate = useNavigate();
  async function level(v: any, stamp?: string) {
    const result = await command("risk.level", {
      ...v,
      id: r.id,
      confirmStamp: stamp,
    });
    if (result.needsConfirmation) {
      setPending(v);
      setConfirm(result);
    } else {
      setConfirm(null);
      setOp("");
      levelForm.resetFields();
    }
  }
  return (
    <Drawer open title="风险详情" width={900} onClose={onClose}>
      <Space>
        {badge(r.level)}
        <Tag>{riskStates[r.status]}</Tag>
        <Tag>{r.source === "SYSTEM" ? "系统计算" : "人工识别"}</Tag>
        {r.attribute === "OPPORTUNITY" && <Tag color="green">机会</Tag>}
      </Space>
      <Typography.Title level={3}>{r.title}</Typography.Title>
      <p>
        {b.name} · {r.id} · {state.users.find((u) => u.id === r.ownerId)?.name}
      </p>
      <Space wrap>
        <Button
          type="primary"
          disabled={readonly}
          onClick={() => {
            levelForm.setFieldsValue({ level: r.level, notify: true });
            setOp("level");
          }}
        >
          修改风险等级
        </Button>
        <Button disabled={readonly} onClick={() => setOp("assign")}>
          转交
        </Button>
        <Button disabled={readonly} onClick={() => setOp("feedback")}>
          疑似误报
        </Button>
        {r.source === "MANUAL" && (
          <Button disabled={readonly} onClick={onEdit}>
            编辑风险资料
          </Button>
        )}
        <Button onClick={() => navigate(riskBusinessPath(b, "risk"))}>
          进入所属业务
        </Button>
      </Space>
      {r.recovered && (
        <Alert type="success" message="系统条件已解除，等待负责人确认关闭" />
      )}
      {r.dataUnknown && (
        <Alert type="warning" message="当前数据不足，不能据此认定风险已恢复" />
      )}
      {r.source === "SYSTEM" ? (
        <Card title="系统计算依据与建议" style={{ marginTop: 16 }}>
          <p>
            生效等级 {badge(r.level)} · 系统等级 {badge(r.systemLevel)}
          </p>
          {r.override && (
            <Alert message="人工确认等级生效；系统重算保留人工等级。" />
          )}
          <p>{r.response}</p>
          <Explain
            title="当前 / 首次计算快照"
            trace={{
              current: r.signal,
              first: r.firstSignal,
              override: r.override,
              close: r.closeSnapshot,
            }}
          />
          <Button
            onClick={() => {
              onClose();
              navigate(riskSourcePath(state, r));
            }}
          >
            {r.nodeId || r.signal?.nodeId ? "查看对应编排节点" : "查看生产编排"}
          </Button>
        </Card>
      ) : (
        <Descriptions
          style={{ marginTop: 16 }}
          column={1}
          bordered
          items={[
            { key: "d", label: "触发条件", children: r.description },
            { key: "i", label: "影响范围", children: r.impact },
            { key: "c", label: "分类", children: categories[r.category] },
            { key: "r", label: "应对策略", children: r.response },
          ]}
        />
      )}
      <Card title="关联跟进与附件" style={{ marginTop: 16 }}>
        {state.followups
          .filter((f) => (r.followIds || []).includes(f.id) && !f.deleted)
          .map((f) => (
            <p key={f.id}>
              {f.text}{" "}
              <Popconfirm
                title="仅解除关联，跟进和风险保留"
                onConfirm={() =>
                  command("risk.evidence", {
                    id: r.id,
                    files: r.files,
                    followIds: r.followIds.filter((id) => id !== f.id),
                    reason: "解除跟进关联",
                  })
                }
              >
                <Button type="link" disabled={readonly}>
                  解除关联
                </Button>
              </Popconfirm>
            </p>
          ))}
        <Files value={r.files} disabled />
        <Button disabled={readonly} onClick={() => setOp("evidence")}>
          管理关联资料
        </Button>
      </Card>
      <Card title="疑似误报反馈" style={{ marginTop: 16 }}>
        {r.feedback?.length ? (
          r.feedback.map((f) => (
            <div key={f.id}>
              <Tag>{f.status}</Tag>
              {f.kind} · {f.reason}
              <p>{f.reviewReason || ""}</p>
              {f.status === "待复核" && user.role === "approver" && (
                <Button onClick={() => setOp("review:" + f.id)}>
                  记录核对意见
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty description="暂无反馈" />
        )}
      </Card>
      <Card title="通知与操作记录" style={{ marginTop: 16 }}>
        {state.notifications
          .filter((n) => n.riskId === r.id)
          .map((n) => (
            <p key={n.id}>
              <Tag>{n.read ? "已查看" : "待查看"}</Tag>
              {n.title} · {n.at}
              <br />
              <small>{n.detail}</small>
            </p>
          ))}
        {r.history?.map((h) => (
          <p key={h.id}>
            <strong>{h.action}</strong> · {h.detail}
            <br />
            <small>
              {h.actor} · {h.at}
            </small>
          </p>
        ))}
      </Card>
      <Modal
        title="修改风险等级"
        open={op === "level"}
        onCancel={() => setOp("")}
        onOk={async () => level(await levelForm.validateFields())}
        width={680}
      >
        <Form form={levelForm} layout="vertical">
          <Form.Item name="level" label="生效等级" rules={[{ required: true }]}>
            <Select
              options={["P0", "P1", "P2"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          {r.override && (
            <Form.Item name="useSystem" valuePropName="checked">
              <Checkbox>恢复采用系统等级</Checkbox>
            </Form.Item>
          )}
          <Form.Item
            name="reason"
            label="修改 / 关闭原因"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="close" valuePropName="checked">
            <Checkbox>确认关闭本次风险</Checkbox>
          </Form.Item>
          <Form.Item name="escalate" valuePropName="checked">
            <Checkbox>提报管理决策</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("escalate") ? (
                <>
                  <Form.Item
                    name={["decision", "title"]}
                    label="待拍板事项"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name={["decision", "proposal"]}
                    label="建议方案与影响"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea />
                  </Form.Item>
                  <Form.Item
                    name={["decision", "due"]}
                    label="决策期限"
                    rules={[{ required: true }]}
                  >
                    <Input type="date" />
                  </Form.Item>
                  <Form.Item name={["decision", "kind"]} label="决策类型">
                    <Select
                      options={["资源协调", "预算调整", "交付方案", "其他"].map(
                        (value) => ({ value, label: value }),
                      )}
                    />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>
          <Form.Item name="notify" valuePropName="checked">
            <Checkbox>生成负责人站内模拟通知</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!confirm}
        title="系统校验 · 需要本人二次确认"
        onCancel={() => setConfirm(null)}
        onOk={() => level(pending, confirm.stamp)}
      >
        <Alert type="warning" message={confirm?.reason} />
        <p>
          本次确认保存系统依据、规则版本、操作人和原因；不会更改真实生产与成本事实。
        </p>
      </Modal>
      <ActionModal
        open={op === "assign"}
        title="转交风险负责人"
        onClose={() => setOp("")}
        save={(v) => command("risk.assign", { id: r.id, ...v })}
        fields={
          <>
            <Form.Item
              name="ownerId"
              label="负责人"
              rules={[{ required: true }]}
            >
              <Select
                options={state.users.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="due" label="处理期限">
              <Input type="date" />
            </Form.Item>
          </>
        }
      />
      <ActionModal
        open={op === "feedback"}
        title="疑似误报反馈"
        onClose={() => setOp("")}
        save={(v) => command("risk.feedback", { id: r.id, ...v })}
        fields={
          <>
            <Form.Item name="kind" label="反馈类型" initialValue="疑似误报">
              <Select
                options={["疑似误报", "数据延时", "口径差异", "正常波动"].map(
                  (value) => ({ value, label: value }),
                )}
              />
            </Form.Item>
            <Form.Item name="snoozeUntil" label="暂缓提醒截止（选填）">
              <Input type="datetime-local" />
            </Form.Item>
          </>
        }
      />
      <ActionModal
        open={op.startsWith("review:")}
        title="规则维护人核对误报反馈"
        onClose={() => setOp("")}
        save={(v) =>
          command("risk.feedback.review", {
            id: r.id,
            feedbackId: op.split(":")[1],
            ...v,
          })
        }
        fields={
          <Form.Item name="result" label="核对结论" initialValue="CONFIRMED">
            <Select
              options={[
                { value: "CONFIRMED", label: "误报确认" },
                { value: "REJECTED", label: "反馈驳回" },
              ]}
            />
          </Form.Item>
        }
      />
      {op === "evidence" && <Evidence risk={r} onClose={() => setOp("")} />}
    </Drawer>
  );
}
function Evidence({ risk: r, onClose }: { risk: any; onClose: () => void }) {
  const { state, command } = usePMC(),
    [ids, setIds] = useState(r.followIds || []),
    [files, setFiles] = useState(r.files || []);
  return (
    <Drawer
      open
      title="关联跟进及附件"
      onClose={onClose}
      width={650}
      extra={
        <Button
          onClick={async () => {
            await command("risk.evidence", {
              id: r.id,
              followIds: ids,
              files,
              reason: "更新风险关联资料",
            });
            onClose();
          }}
        >
          保存
        </Button>
      }
    >
      <Select
        mode="multiple"
        style={{ width: "100%" }}
        value={ids}
        onChange={setIds}
        options={state.followups
          .filter((f) => f.businessId === r.businessId && !f.deleted)
          .map((f) => ({ value: f.id, label: f.text.slice(0, 80) }))}
      />
      <Files value={files} onChange={setFiles} maxMB={10} limit={5} />
    </Drawer>
  );
}
function Config({ onClose }: { onClose: () => void }) {
  const { state, user, command } = usePMC(),
    [form] = Form.useForm(),
    c = riskConfig(state),
    [feedback, setFeedback] = useState<any>();
  const groups = [
    [
      "产能缺口与预测",
      [
        "gapP0",
        "gapP1",
        "gapP2",
        "delayP0",
        "delayP1",
        "delayP2",
        "buffer",
        "minSamples",
        "windowDays",
        "cvP1",
        "cvP2",
      ],
    ],
    [
      "滚动窗口与恢复",
      [
        "coverage",
        "shapeTolerance",
        "tailChange",
        "weakSignals",
        "mediumSignals",
        "recoverP0",
        "recoverP1",
      ],
    ],
    [
      "成本安全水位",
      [
        "costP0",
        "costP1",
        "costP2",
        "costCvLow",
        "costCvHigh",
        "costNearBudget",
      ],
    ],
    ["编排节点直接汇总项目", ["p0Nodes", "p1Nodes", "p2Nodes"]],
    [
      "提醒与责任",
      ["cooldownHours", "staleDays", "maxPauseRatio", "previewHours"],
    ],
  ];
  const labels: Record<string, string> = {
    buffer: "单日抖动缓冲比例",
    delayP2: "P2预测延期天数",
    shapeTolerance: "均值与中位数近似容差",
    tailChange: "尾部环比变化比例",
    costNearBudget: "基准成本贴近预算比例",
    gapP0: "P0日产出缺口比例",
    gapP1: "P1日产出缺口比例",
    gapP2: "P2日产出缺口比例",
    delayP0: "P0预测延期天数",
    delayP1: "P1预测延期天数",
    minSamples: "最少有效自然日",
    windowDays: "默认观察窗口天数",
    cvP1: "产能CV高阈值",
    cvP2: "产能CV低阈值",
    coverage: "窗口有效日覆盖比例",
    weakSignals: "弱信号升P1数量",
    mediumSignals: "中等信号升P0数量",
    recoverP0: "P0降级需连续有效日",
    recoverP1: "P1降级需连续有效日",
    costP0: "P0成本预算比例",
    costP1: "P1成本预算比例",
    costP2: "P2成本预算比例",
    costCvLow: "单位成本CV低阈值",
    costCvHigh: "单位成本CV高阈值",
    p0Nodes: "P0项目所需P0节点数",
    p1Nodes: "P1节点累积升P0数量",
    p2Nodes: "P2节点累积升级数量",
    cooldownHours: "普通提醒冷却小时",
    staleDays: "缺报容忍天数",
    maxPauseRatio: "累计暂停周期上限比例",
    previewHours: "提前预警小时",
  };
  return (
    <Drawer
      open
      title="全局风险规则"
      width={850}
      onClose={onClose}
      extra={
        <Button
          disabled={user.role !== "approver"}
          type="primary"
          onClick={async () => {
            const v = await form.validateFields();
            await command("risk.config", { values: v, reason: v.reason });
            onClose();
          }}
        >
          保存规则
        </Button>
      }
    >
      <Alert
        message={"全项目统一生效 · 当前 v" + c.version}
        description="试运行阈值需业务签认。每次修改保留版本和原因，项目没有独立覆盖。成本预测基准为中位数。"
      />
      <Form form={form} initialValues={c} layout="vertical">
        {groups.map(([title, keys]) => (
          <Card
            key={title as string}
            title={title as string}
            size="small"
            style={{ marginTop: 12 }}
          >
            <Row gutter={16}>
              {(keys as string[]).map((k) => (
                <Col span={12} key={k}>
                  <Form.Item
                    name={k}
                    label={labels[k]}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </Card>
        ))}
        <Form.Item name="p2Level" label="P2累积后的项目等级">
          <Select
            options={["P0", "P1"].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item label="成本预测基准">
          <Select
            disabled
            value="median"
            options={[
              {
                value: "median",
                label: "中位数（区间P5～P95；均值用于分布对照）",
              },
            ]}
          />
        </Form.Item>
        <Form.Item name="rateMethod" label="有效日产速取值">
          <Select
            options={[
              { value: "latest", label: "最近有效日（PM修正优先）" },
              { value: "mean", label: "完整自然日均值" },
              { value: "median", label: "完整自然日中位数" },
            ]}
          />
        </Form.Item>
        <Form.Item name="defaultOwner" label="默认风险负责人">
          <Select
            allowClear
            placeholder="跟随项目经理"
            options={state.users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Form.Item>
        <Form.Item name="reviewer" label="业务复核人">
          <Select
            options={state.users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="规则变更原因"
          rules={[{ required: true }]}
        >
          <Input.TextArea />
        </Form.Item>
      </Form>
      <Card title="误报反馈核对">
        {state.risks
          .filter((r) => r.feedback?.some((f) => f.status === "待复核"))
          .map((r) => (
            <p key={r.id}>
              {r.title} <Button onClick={() => setFeedback(r)}>查看处理</Button>
            </p>
          ))}
      </Card>
      <Card title="规则变更记录">
        {c.history.map((h: any, i: number) => (
          <p key={i}>
            {h.at} · {h.actor} · {h.reason}
          </p>
        ))}
      </Card>
      {feedback && (
        <RiskDetail
          risk={feedback}
          onClose={() => setFeedback(null)}
          onEdit={() => {}}
        />
      )}
    </Drawer>
  );
}
/** GUI parity: the test platform's management dashboard is an operating page. */
export function ManagementPage() {
  const { state, refresh } = usePMC(),
    navigate = useNavigate();
  const [period, setPeriod] = useState("last30"),
    [detail, setDetail] = useState<{ title: string; rows: any[] }>();
  const pname = (id: string) =>
    state.users.find((u) => u.id === id)?.name || "—";
  const projects = state.businesses.filter(
    (b) =>
      b.kind === "project" &&
      (period === "all" ||
        b.createdAt.slice(0, 10) >=
          (period === "last30"
            ? addDays(-30)
            : addDays(
                -((new Date(day() + "T12:00:00+08:00").getUTCDay() + 6) % 7),
              ))),
  );
  const rows = projects.map((b) => ({
    ...b,
    f: riskFacts(state, b.id),
    risk: { ...riskSummary(state, b.id), level: displayProjectRisk(state, b) },
  }));
  const active = rows.filter((b) => !b.completed && b.stage !== "LOST"),
    closed = rows.filter((b) => b.completed),
    delivered = rows.filter(
      (b) =>
        b.f.p.delivered > 0 ||
        b.f.p.accepted > 0 ||
        [
          "CUSTOMER_ACCEPTANCE",
          "SUPPLEMENT_DELIVERY",
          "INITIATE_CLOSE",
          "CLOSE",
          "CLOSED",
        ].includes(b.stage),
    );
  const entered = rows.filter(
      (b) => b.stage !== "ESTABLISHED" && b.stage !== "LOST",
    ),
    accepted = rows.filter((b) => b.target > 0 && b.f.p.accepted >= b.target),
    overdue = active.filter(
      (b) => b.deadline && b.deadline < day() && b.f.p.accepted < b.target,
    ),
    riskRows = active.filter((b) => b.risk.level),
    high = active.filter((b) => b.risk.level === "P0");
  const firstDelivery = (b: any) =>
    [...(state.production[b.id]?.deliveries || [])].sort((a, b) =>
      a.at.localeCompare(b.at),
    )[0]?.at;
  const onTime = delivered.filter(
      (b) => firstDelivery(b) && firstDelivery(b).slice(0, 10) <= b.deadline,
    ),
    avgDelivery = quantiles(
      delivered.flatMap((b) =>
        firstDelivery(b)
          ? [
              diff(
                b.startDate || b.createdAt.slice(0, 10),
                firstDelivery(b).slice(0, 10),
              ),
            ]
          : [],
      ),
    )?.mean;
  const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const drill = (bs: any[], title: string) => setDetail({ rows: bs, title });
  const link = (bs: any[], title: string, value: any = bs.length) => (
    <button
      className="metric-link"
      disabled={!bs.length}
      onClick={() => drill(bs, title)}
    >
      {value}
    </button>
  );
  const section = (title: string, sub: string) => (
    <div className="management-section">
      <h2>{title}</h2>
      <span>{sub}</span>
    </div>
  );
  const heading = (title: string, tip: string) => (
    <span>
      {title}
      <Tooltip title={tip}>
        <span className="info-dot">ⓘ</span>
      </Tooltip>
    </span>
  );
  const metric = (
    title: string,
    value: any,
    sub: string,
    bs: any[],
    tone = "#577f9f",
  ) => (
    <button
      key={title}
      className="management-metric"
      style={{ "--tone": tone } as React.CSSProperties}
      onClick={() => drill(bs, title)}
    >
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </button>
  );
  const supplement = (b: any) =>
    b.history.filter(
      (h: any) =>
        h.snapshot?.to === "SUPPLEMENT_DELIVERY" || h.action.includes("补交付"),
    ).length;
  const acceptanceRounds = (b: any) =>
    b.history.filter((h: any) => h.snapshot?.to === "CUSTOMER_ACCEPTANCE")
      .length;
  const repeated = active.filter((b) => supplement(b) >= 2),
    missing = active.filter((b) => !b.ownerId),
    missingDate = active.filter((b) => !b.deadline),
    stagnant = active.filter(
      (b) => diff(b.updatedAt.slice(0, 10), day()) >= 14,
    );
  const intervention = active.filter(
      (b) =>
        b.risk.level === "P0" ||
        overdue.includes(b) ||
        repeated.includes(b) ||
        !b.ownerId,
    ),
    attention = active.filter(
      (b) =>
        !intervention.includes(b) && (b.risk.level || stagnant.includes(b)),
    ),
    healthy = active.filter(
      (b) => !intervention.includes(b) && !attention.includes(b),
    );
  const managers = state.users
    .map((u) => ({ ...u, bs: active.filter((b) => b.ownerId === u.id) }))
    .filter((u) => u.bs.length)
    .sort((a, b) => b.bs.length - a.bs.length);
  const life = [
    "ESTABLISHED",
    "FORMAL_DELIVERY",
    "CUSTOMER_ACCEPTANCE",
    "SUPPLEMENT_DELIVERY",
    "INITIATE_CLOSE",
    "CLOSED",
  ].map((stage) => {
    const bs = rows.filter((b) => b.stage === stage);
    const times = bs.flatMap((b) => {
      const at =
        b.history
          .filter((h) => h.snapshot?.to === stage)
          .sort((a, b) => b.at.localeCompare(a.at))[0]?.at ||
        (stage === "ESTABLISHED" ? b.createdAt : null);
      return at ? [diff(at.slice(0, 10), day())] : [];
    });
    return { stage, bs, avg: quantiles(times)?.mean };
  });
  const bottleneck = life
    .filter((x) => x.avg != null)
    .sort((a, b) => b.avg - a.avg)[0];
  const riskGroups = [
    { name: "高风险", bs: high, color: "#a96871" },
    {
      name: "中风险",
      bs: active.filter((b) => b.risk.level === "P1"),
      color: "#c49865",
    },
    {
      name: "低风险",
      bs: active.filter((b) => b.risk.level === "P2"),
      color: "#6e94ac",
    },
    {
      name: "无风险",
      bs: active.filter((b) => !b.risk.level),
      color: "#89aa9d",
    },
  ];
  let cursor = 0;
  const gradient = riskGroups
    .map((g) => {
      const from = cursor;
      cursor += ratio(g.bs.length, active.length);
      return `${g.color} ${from}% ${cursor}%`;
    })
    .join(",");
  const review = closed.filter(
      (b) =>
        b.common.review ||
        b.common.reviewDoc ||
        b.history.some((h) => h.action.includes("复盘")),
    ),
    collaborative = rows.filter((b) =>
      b.f.p.nodes.some((n) => n.current !== false && !!n.scopeKey),
    );
  const list = (bs: any[], title: string, query: Record<string, string> = {}) =>
    navigate(
      "/projects?" +
        new URLSearchParams({
          pids: bs.map((b) => b.pid).join(","),
          drillTitle: title,
          ...query,
        }),
    );
  const tip: Record<string, string> = {
    项目价值兑现漏斗: "以项目数、阶段转化和阶段耗时替代金额口径",
    人员负载与协同: "当前项目经理的在手项目、风险与逾期情况",
    项目推进健康度:
      "综合交付时效、节点停滞、风险、流程反复和责任完整性判断项目推进状态",
    项目生命周期与节点效率: "从立项到结项，识别当前停留时间最长的环节",
    交付时效: "进行中项目按交付截止日期分组",
    风险分布与处置: "进行中项目当前风险等级",
    流程与协同偏差: "交付截止、责任完整性与流程反复",
    验收与交付: "基于项目状态、截止日期和流程完成事件",
    项目成果转化指标台账: "仅展示当前已有业务字段可计算的指标",
  };
  const panel = (title: string, children: React.ReactNode, cls = "") => (
    <section className={"management-panel " + cls}>
      <div className="management-panel-header">
        <h3>{title}</h3>
        <Tooltip title={tip[title]}>
          <QuestionCircleOutlined aria-label={title + "说明"} tabIndex={0} />
        </Tooltip>
      </div>
      {children}
    </section>
  );
  const go = (bs: any[], title: string) =>
    [
      "风险项目",
      "进行中项目",
      "高风险项目",
      "无风险",
      "低风险",
      "中风险",
      "高风险",
    ].includes(title)
      ? list(bs, title)
      : drill(bs, title);
  const value = (
    bs: any[],
    title: string,
    v: any = bs.length,
    route = false,
  ) => (
    <button
      className="metric-link"
      disabled={!bs.length}
      onClick={() => (route ? list(bs, title) : go(bs, title))}
    >
      {v}
    </button>
  );
  const phases = [
    { name: "已立项", bs: rows },
    { name: "进入交付", bs: entered },
    { name: "交付完成", bs: delivered },
    { name: "客户验收", bs: accepted },
    { name: "已结项", bs: closed },
  ];
  const funnel: EChartsOption = {
    animation: false,
    textStyle: { fontFamily: "Inter,-apple-system,system-ui,sans-serif" },
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 个" },
    graphic: [
      {
        type: "text",
        left: "4%",
        top: 7,
        style: { text: "价值阶段", fill: "#858f98", fontSize: 11 },
      },
      {
        type: "text",
        left: "72%",
        top: 7,
        style: { text: "阶段转化", fill: "#858f98", fontSize: 11 },
      },
      {
        type: "text",
        left: "87%",
        top: 7,
        style: { text: "平均耗时", fill: "#858f98", fontSize: 11 },
      },
      ...phases.flatMap((g, i) => [
        {
          type: "text" as const,
          left: "73%",
          top: 57 + i * 49,
          style: {
            text:
              (i
                ? num(
                    (g.bs.length / Math.max(1, phases[i - 1].bs.length)) * 100,
                  )
                : "100") + "%",
            fill: "#485560",
            fontSize: 12,
          },
        },
        {
          type: "text" as const,
          left: "88%",
          top: 57 + i * 49,
          style: {
            text:
              i === 2 && avgDelivery != null ? num(avgDelivery) + "天" : "—",
            fill: "#485560",
            fontSize: 12,
          },
        },
      ]),
    ],
    series: [
      {
        type: "funnel",
        left: "1%",
        top: 42,
        bottom: 0,
        width: "64%",
        minSize: "35%",
        maxSize: "100%",
        max: Math.max(1, rows.length),
        sort: "none",
        gap: 4,
        label: {
          show: true,
          position: "inside",
          formatter: "{b}  {c}个",
          color: "#344853",
          fontSize: 12,
          fontWeight: 600,
        },
        labelLine: { show: false },
        itemStyle: { borderWidth: 0 },
        data: phases.map((g, i) => ({
          name: g.name,
          value: g.bs.length,
          itemStyle: {
            color: ["#dfe9f3", "#cce0e9", "#aacbdb", "#82afc5", "#557fa6"][i],
          },
        })),
      },
    ],
  };
  const dueGroups = [
    {
      name: "逾期",
      bs: active.filter((b) => b.deadline && b.deadline < day()),
      color: "#a85659",
    },
    {
      name: "7日内",
      bs: active.filter((b) => b.deadline >= day() && b.deadline <= addDays(7)),
      color: "#bb9548",
    },
    {
      name: "正常",
      bs: active.filter((b) => b.deadline > addDays(7)),
      color: "#557fa7",
    },
    {
      name: "未设日期",
      bs: active.filter((b) => !b.deadline),
      color: "#8b939b",
    },
  ];
  const deliveryChart: EChartsOption = {
    animation: false,
    grid: { top: 24, left: 28, right: 14, bottom: 38 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: dueGroups.map((g) => g.name),
      axisLine: { lineStyle: { color: "#e7eaef" } },
      axisTick: { show: false },
      axisLabel: { color: "#4d565e", fontSize: 12, interval: 0 },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#59636c", fontSize: 11 },
      splitLine: { lineStyle: { color: "#edf0f2" } },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 36,
        label: { show: true, position: "top", color: "#505b63", fontSize: 12 },
        data: dueGroups.map((g) => ({
          value: g.bs.length,
          itemStyle: { color: g.color },
        })),
      },
    ],
  };
  const rings = [
    {
      name: "无风险",
      bs: active.filter((b) => !b.risk.level),
      color: "#92999f",
    },
    { name: "高风险", bs: high, color: "#a85659" },
    {
      name: "中风险",
      bs: active.filter((b) => b.risk.level === "P1"),
      color: "#b49b4a",
    },
    {
      name: "低风险",
      bs: active.filter((b) => b.risk.level === "P2"),
      color: "#6a8eaf",
    },
  ];
  const riskChart: EChartsOption = {
    animation: false,
    color: rings.map((g) => g.color),
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} ({d}%)" },
    legend: {
      bottom: 4,
      left: "center",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { fontSize: 11, color: "#515a62" },
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "36%",
        style: {
          text: String(active.length),
          fill: "#29343e",
          fontSize: 25,
          fontWeight: 600,
        },
      },
      {
        type: "text",
        left: "center",
        top: "49%",
        style: { text: "项目总数", fill: "#88929a", fontSize: 12 },
      },
    ],
    series: [
      {
        type: "pie",
        radius: ["43%", "66%"],
        center: ["50%", "43%"],
        label: {
          show: true,
          formatter: "{d}%",
          fontSize: 11,
          color: "#4b545c",
        },
        labelLine: { length: 8, length2: 8, lineStyle: { color: "#9a9a9a" } },
        itemStyle: { borderWidth: 2, borderColor: "#fff" },
        data: rings.map((g) => ({ name: g.name, value: g.bs.length })),
      },
    ],
  };
  const reasonRows = [
    { name: "长时停滞", bs: stagnant, color: "#b55255" },
    { name: "交付逾期", bs: overdue, color: "#c77b2e" },
    { name: "高风险", bs: high, color: "#b55255" },
    { name: "流程反复", bs: repeated, color: "#c77b2e" },
    { name: "无负责人", bs: missing, color: "#87939c" },
    { name: "缺交付日期", bs: missingDate, color: "#87939c" },
  ];
  const repetitionRows = rows.flatMap((b) =>
      b.history
        .filter(
          (h) =>
            h.snapshot?.to === "SUPPLEMENT_DELIVERY" ||
            h.action.includes("补交付"),
        )
        .map((h) => ({ ...b, _eventAt: h.at })),
    ),
    acceptanceRows = rows.flatMap((b) =>
      b.history
        .filter((h) => h.snapshot?.to === "CUSTOMER_ACCEPTANCE")
        .map((h) => ({ ...b, _eventAt: h.at })),
    );
  const actions = [
    {
      title: "逾期项目",
      bs: overdue,
      v: overdue.length,
      sub: "查看负责人、当前节点与截止日期",
    },
    {
      title: "高风险项目",
      bs: high,
      v: high.length,
      sub: "查看风险项目与最近进展",
    },
    {
      title: "项目补交付轮次",
      bs: repetitionRows,
      v: repetitionRows.length,
      sub: `${repeated.length} 个项目达到 2 轮及以上`,
    },
    {
      title: "待验收项目",
      bs: active.filter((b) => b.stage === "CUSTOMER_ACCEPTANCE"),
      v: active.filter((b) => b.stage === "CUSTOMER_ACCEPTANCE").length,
      sub: "查看交付时间与客户验收进展",
    },
  ];
  const detailBasis = (b: any) => {
    const stage = life.find(
      (x) => stageNames[x.stage] === detail?.title,
    )?.stage;
    if (stage) {
      const at =
        b.history
          .filter((h: any) => h.snapshot?.to === stage)
          .sort((a: any, z: any) => z.at.localeCompare(a.at))[0]?.at ||
        (stage === "ESTABLISHED" ? b.createdAt : null);
      return at ? num(diff(at.slice(0, 10), day())) + "天" : "—";
    }
    return detail?.title === "平均交付周期" && firstDelivery(b)
      ? num(
          diff(
            b.startDate || b.createdAt.slice(0, 10),
            firstDelivery(b).slice(0, 10),
          ),
        ) + "天"
      : detail?.title === "按期交付率"
        ? (onTime.includes(b) ? "按期" : "逾期") +
          " · " +
          (firstDelivery(b)
            ? num(
                diff(
                  b.startDate || b.createdAt.slice(0, 10),
                  firstDelivery(b).slice(0, 10),
                ),
              ) + "天"
            : "—")
        : "—";
  };
  return (
    <div className="pmc-management">
      <div className="management-period">
        <span>统计周期</span>
        <Segmented
          size="small"
          value={period}
          onChange={(v) => setPeriod(String(v))}
          options={[
            { value: "week", label: "本周" },
            { value: "last30", label: "近30天" },
            { value: "all", label: "全部" },
          ]}
        />
        <small>
          数据更新：{day()}{" "}
          {new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
      </div>
      {section("经营总览", "用项目结果、效率和风险表达经营价值")}
      <div className="management-metrics">
        {[
          {
            title: "本期新增项目",
            v: rows.length,
            sub: `所选范围项目 ${rows.length} 个`,
            bs: rows,
          },
          {
            title: "立项进入交付率",
            v: ratio(entered.length, rows.length) + "%",
            sub: "已进入正式交付节点",
            bs: entered,
          },
          {
            title: "按期交付率",
            v: ratio(onTime.length, delivered.length) + "%",
            sub: "基于交付事件与交付截止日期",
            bs: delivered,
            color: "#2f8f6b",
          },
          {
            title: "平均交付周期",
            v: avgDelivery == null ? "—" : num(avgDelivery) + "天",
            sub: "从立项到正式交付完成",
            bs: delivered,
          },
          {
            title: "风险项目",
            v: riskRows.length,
            sub: `占进行中项目 ${ratio(riskRows.length, active.length)}%`,
            bs: riskRows,
            color: "#b55255",
          },
          {
            title: "进行中项目",
            v: active.length,
            sub: "可下钻查看项目与当前节点",
            bs: active,
            color: "#c77b2e",
          },
        ].map((m) => (
          <button
            className="management-metric"
            key={m.title}
            style={{ "--tone": m.color || "#477eaf" } as React.CSSProperties}
            onClick={() => go(m.bs, m.title)}
          >
            <span>{m.title}</span>
            <strong>{m.v}</strong>
            <small>{m.sub}</small>
          </button>
        ))}
      </div>
      {section("决策与执行", "观察项目从启动到结项的价值兑现过程")}
      <div className="management-grid decision-grid">
        {panel(
          "项目价值兑现漏斗",
          <div className="management-chart funnel-chart">
            <Chart
              option={funnel}
              label="项目价值兑现漏斗图"
              onSelect={(name) => {
                const g = phases.find((g) => g.name === name);
                if (g) drill(g.bs, name);
              }}
            />
          </div>,
          "management-primary",
        )}
        {panel(
          "人员负载与协同",
          <>
            <div className="management-owner-badge">
              无负责人项目 {value(missing, "无负责人项目")}
            </div>
            <div className="management-load head">
              <span>项目经理</span>
              <span>相对负载</span>
              <span>在手</span>
              <span>风险</span>
              <span>逾期</span>
              <span>状态</span>
            </div>
            <div className="management-load-rows">
              {managers.map((u) => {
                const rs = u.bs.filter((b) => b.risk.level),
                  late = u.bs.filter((b) => overdue.includes(b));
                return (
                  <div className="management-load" key={u.id}>
                    <span>
                      {value(u.bs, u.name + "在手项目", u.name, true)}
                    </span>
                    <div className="load-track">
                      <i
                        style={{
                          width:
                            ratio(
                              u.bs.length,
                              Math.max(1, ...managers.map((u) => u.bs.length)),
                            ) + "%",
                          background: late.length ? "#b55255" : "#477eaf",
                        }}
                      />
                    </div>
                    {value(u.bs, u.name + "在手项目", u.bs.length, true)}
                    {value(rs, u.name + "风险项目", rs.length, true)}
                    {value(late, u.name + "逾期项目", late.length, true)}
                    <span
                      className={late.length ? "load-danger" : "load-attention"}
                    >
                      {late.length ? "需调配" : rs.length ? "关注" : "正常"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="management-note management-load-note">
              在手项目用于相对负载比较；风险与逾期决定调配优先级。
              <br />
              当前不代表真实工时容量，后续补充角色投入、工时与资源容量。
            </div>
          </>,
          "management-primary management-load-panel",
        )}
        {panel(
          "项目推进健康度",
          <>
            <div className="management-health-top">
              {[
                { title: "健康项目", bs: healthy },
                { title: "需关注", bs: attention },
                { title: "需介入", bs: intervention },
                { title: "健康项目占比", bs: healthy },
              ].map((g, i) => (
                <div key={g.title}>
                  <span>{g.title}</span>
                  <b>
                    {value(
                      g.bs,
                      g.title,
                      i === 3
                        ? ratio(healthy.length, active.length) + "%"
                        : g.bs.length,
                    )}
                  </b>
                  {i < 3 && <small>个</small>}
                </div>
              ))}
            </div>
            <div className="management-health-bar">
              {[healthy, attention, intervention].map((bs, i) => (
                <button
                  key={i}
                  aria-label={
                    ["健康", "需关注", "需介入"][i] + " " + bs.length + " 个"
                  }
                  disabled={!bs.length}
                  style={{ flex: bs.length || 0.0001 }}
                  onClick={() => drill(bs, ["健康", "需关注", "需介入"][i])}
                />
              ))}
            </div>
            <div className="management-health-legend">
              {[healthy, attention, intervention].map((bs, i) => (
                <span key={i}>
                  <i
                    style={{ background: ["#2f8f6b", "#c77b2e", "#b55255"][i] }}
                  />
                  {["健康", "关注", "介入"][i]} {bs.length}（
                  {ratio(bs.length, active.length)}%）
                </span>
              ))}
            </div>
            <h4 className="management-reasons-title">主要异常原因</h4>
            <div className="management-reasons">
              {reasonRows.map((g) => (
                <div key={g.name}>
                  <span>{g.name}</span>
                  <div>
                    <i
                      style={{
                        width:
                          ratio(
                            g.bs.length,
                            Math.max(1, ...reasonRows.map((g) => g.bs.length)),
                          ) + "%",
                        background: g.color,
                      }}
                    />
                  </div>
                  {value(g.bs, g.name)}
                </div>
              ))}
            </div>
          </>,
          "management-secondary",
        )}
        {panel(
          "项目生命周期与节点效率",
          <>
            <div className="management-lifecycle">
              {life.map((x, i) => (
                <div
                  key={x.stage}
                  style={
                    {
                      "--node-color": [
                        "#806b9c",
                        "#946483",
                        "#a7715c",
                        "#b49b4a",
                        "#a3794b",
                        "#5a8168",
                      ][i],
                    } as React.CSSProperties
                  }
                >
                  <div className="management-lifecycle-track">
                    <button
                      className="life-circle"
                      style={{
                        background: [
                          "#806b9c",
                          "#946483",
                          "#a7715c",
                          "#b49b4a",
                          "#a3794b",
                          "#5a8168",
                        ][i],
                      }}
                      disabled={!x.bs.length}
                      onClick={() => drill(x.bs, stageNames[x.stage])}
                    >
                      {x.bs.length}
                    </button>
                  </div>
                  <strong>{stageNames[x.stage]}</strong>
                  <small>平均 {x.avg == null ? "--" : num(x.avg) + "天"}</small>
                </div>
              ))}
            </div>
            <div className="management-bottleneck">
              <ClockCircleOutlined />{" "}
              {bottleneck
                ? "当前瓶颈：" +
                  stageNames[bottleneck.stage] +
                  "节点平均停留 " +
                  num(bottleneck.avg) +
                  "天"
                : "当前暂无可计算的节点停留时间"}
            </div>
          </>,
          "management-secondary",
        )}
      </div>
      {section("偏差与风险", "提前暴露延期、风险、流程反复与责任缺位")}
      <div className="management-grid triple">
        {panel(
          "交付时效",
          <div className="management-chart">
            <Chart
              option={deliveryChart}
              label="交付时效柱状图"
              onSelect={(name) => {
                const g = dueGroups.find((g) => g.name === name);
                if (g) drill(g.bs, name);
              }}
            />
          </div>,
        )}
        {panel(
          "风险分布与处置",
          <div className="management-chart">
            <Chart
              option={riskChart}
              label="项目风险分布环形图"
              onSelect={(name) => {
                const g = rings.find((g) => g.name === name);
                if (g) list(g.bs, name);
              }}
            />
          </div>,
        )}
        {panel(
          "流程与协同偏差",
          <>
            <div className="management-deviation-grid">
              {[
                { title: "交付逾期项目", bs: overdue, v: overdue.length },
                { title: "无负责人项目", bs: missing, v: missing.length },
                {
                  title: "项目补交付轮次",
                  bs: repetitionRows,
                  v: repetitionRows.length,
                },
                {
                  title: "客户验收轮次",
                  bs: acceptanceRows,
                  v: acceptanceRows.length,
                },
              ].map((g) => (
                <div key={g.title}>
                  <span>{g.title}</span>
                  <b>{value(g.bs, g.title, g.v)}</b>
                </div>
              ))}
            </div>
          </>,
        )}
      </div>
      {section("结果与沉淀", "从交付完成、客户认可到项目复盘与生产协同")}
      <div className="management-grid results-grid">
        {panel(
          "验收与交付",
          <>
            <div className="management-results">
              {[
                {
                  title: "交付完成",
                  bs: delivered,
                  v: delivered.length,
                  icon: <ProjectOutlined />,
                },
                {
                  title: "客户验收",
                  bs: accepted,
                  v: accepted.length,
                  icon: <CheckCircleOutlined />,
                },
                {
                  title: "客户验收率",
                  bs: accepted,
                  v: ratio(accepted.length, delivered.length) + "%",
                  icon: <PieChartOutlined />,
                },
              ].map((g) => (
                <div key={g.title}>
                  {g.icon}
                  <span>{g.title}</span>
                  <b>{value(g.bs, g.title, g.v)}</b>
                </div>
              ))}
            </div>
            <div className="management-delivery-progress">
              <div
                className="management-delivery-progress-track"
                role="progressbar"
                aria-label="交付后客户验收率"
                aria-valuenow={ratio(accepted.length, delivered.length)}
              >
                <span
                  style={{
                    width: ratio(accepted.length, delivered.length) + "%",
                  }}
                />
              </div>
              <small>交付后客户验收率：已验收项目 ÷ 已交付项目</small>
            </div>
          </>,
        )}
        {panel(
          "项目成果转化指标台账",
          <Table
            size="small"
            pagination={false}
            rowKey="name"
            dataSource={[
              {
                name: "结项项目数",
                bs: closed,
                value: closed.length + " 个",
                basis: "项目状态 / 结项事件",
              },
              {
                name: "复盘完成率",
                bs: review,
                value: ratio(review.length, closed.length) + "%",
                basis: `${review.length} 个结项项目已提交复盘文档`,
              },
              {
                name: "生产协同覆盖率",
                bs: collaborative,
                value: ratio(collaborative.length, rows.length) + "%",
                basis: `${collaborative.length} 个项目存在有效下游绑定`,
              },
            ]}
            columns={[
              { title: "指标", dataIndex: "name" },
              {
                title: "当前值",
                render: (_, r) => value(r.bs, r.name, r.value),
              },
              { title: "计算依据", dataIndex: "basis" },
            ]}
          />,
        )}
      </div>
      <section className="management-action-center">
        {section("行动中心", "指标直接指向需要管理者处理的项目与节点")}
        <div className="management-actions">
          {actions.map((a) => (
            <button key={a.title} onClick={() => go(a.bs, a.title)}>
              <strong>
                {a.title} · {a.v}
              </strong>
              <small>{a.sub}</small>
              <ArrowRightOutlined />
            </button>
          ))}
        </div>
      </section>
      <Modal
        open={!!detail}
        onCancel={() => setDetail(undefined)}
        centered
        footer={null}
        title={
          (detail?.title || "项目明细") +
          " · " +
          { week: "本周", last30: "近30天", all: "全部" }[period]
        }
        width={1120}
        className="management-detail-modal"
      >
        <>
          {detail?.title === "立项进入交付率" && (
            <div className="management-detail-description">
              已进入正式交付 ÷ 所选范围 {rows.length} 个项目
            </div>
          )}
          <Table
            rowKey={(b) => b.id + (b._eventAt || "")}
            size="small"
            scroll={{ x: 1400, y: "clamp(96px, calc(100dvh - 270px), 560px)" }}
            dataSource={detail?.rows}
            pagination={{
              pageSize: 20,
              showTotal: (n) => "共 " + n + " 条",
              showSizeChanger: true,
            }}
            columns={[
              {
                title: "项目名称",
                dataIndex: "name",
                width: 240,
                render: (v) => <strong>{v}</strong>,
              },
              { title: "客户名称", dataIndex: "customer", width: 125 },
              {
                title: "PID",
                dataIndex: "pid",
                width: 110,
                render: (v, b) => (
                  <a onClick={() => navigate(riskBusinessPath(b, "workflow"))}>
                    {v}
                  </a>
                ),
              },
              {
                title: "数据类型",
                width: 140,
                render: (_, b) => (
                  <Space size={3}>
                    <Tag
                      className={
                        "management-type-tag type-" +
                        (b.dataTypes[0]?.includes("文本")
                          ? "text"
                          : b.dataTypes[0]?.includes("视频")
                            ? "video"
                            : b.dataTypes[0]?.includes("图片")
                              ? "image"
                              : "audio")
                      }
                    >
                      {b.dataTypes[0]}
                    </Tag>
                    {b.dataTypes.length > 1 && (
                      <Tag>+{b.dataTypes.length - 1}</Tag>
                    )}
                  </Space>
                ),
              },
              {
                title: (
                  <Space size={4}>
                    项目状态
                    <Tooltip title="项目流程当前所在节点。">
                      <QuestionCircleOutlined
                        aria-label="项目状态说明"
                        tabIndex={0}
                      />
                    </Tooltip>
                  </Space>
                ),
                dataIndex: "stage",
                width: 108,
                render: (v) => (
                  <Tag
                    style={{
                      color:
                        v === "CLOSED"
                          ? "#507661"
                          : v === "FORMAL_DELIVERY"
                            ? "#8c5875"
                            : v === "INITIATE_CLOSE"
                              ? "#96623d"
                              : "#557fa7",
                      background:
                        v === "CLOSED"
                          ? "#edf5ef"
                          : v === "FORMAL_DELIVERY"
                            ? "#f7edf3"
                            : v === "INITIATE_CLOSE"
                              ? "#fbf2e8"
                              : "#eef4f9",
                    }}
                  >
                    {stageNames[v] || v}
                  </Tag>
                ),
              },
              {
                title: "项目经理",
                dataIndex: "ownerId",
                width: 108,
                render: pname,
              },
              {
                title: "立项日期",
                width: 110,
                render: (_, b) => b.startDate || b.createdAt.slice(0, 10),
              },
              { title: "交付截止", dataIndex: "deadline", width: 110 },
              {
                title: "事件时间",
                width: 155,
                render: (_, b) =>
                  b._eventAt
                    ? new Date(b._eventAt).toLocaleString("sv-SE").slice(0, 16)
                    : [
                          "平均交付周期",
                          "按期交付率",
                          "交付完成",
                          "立项进入交付率",
                        ].includes(detail?.title)
                      ? firstDelivery(b)
                        ? new Date(firstDelivery(b))
                            .toLocaleString("sv-SE")
                            .slice(0, 16)
                        : "—"
                      : "—",
              },
              {
                title: "计算依据",
                width: 104,
                render: (_, b) => detailBasis(b),
              },
              {
                title: "操作",
                width: 90,
                fixed: "right",
                render: (_, b) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => navigate(riskBusinessPath(b, "workflow"))}
                  >
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </>
      </Modal>
    </div>
  );
}

export function RiskManagementPage() {
  const { state, user, command } = usePMC(),
    navigate = useNavigate(),
    [period, setPeriod] = useState("all"),
    [selected, setSelected] = useState<string>(),
    [config, setConfig] = useState(false),
    [ai, setAi] = useState(false),
    [decision, setDecision] = useState<any>();
  const active = state.businesses.filter(
      (b) => !b.completed && b.stage !== "LOST",
    ),
    projects = state.businesses.filter(
      (b) =>
        b.kind === "project" &&
        (period === "all" ||
          (period === "week"
            ? b.createdAt.slice(0, 10) >=
              addDays(
                -((new Date(day() + "T12:00:00+08:00").getUTCDay() + 6) % 7),
              )
            : diff(b.createdAt.slice(0, 10), day()) < 30)),
    ),
    rows = active.map((b) => ({ ...b, risk: riskSummary(state, b.id) })),
    pending = state.decisions.filter(
      (d) =>
        d.status === "PENDING" && active.some((b) => b.id === d.businessId),
    ),
    drill = (bs: any[], title: string) => {
      const p = bs.filter((b) => b.kind === "project"),
        o = bs.filter((b) => b.kind === "opportunity");
      if (p.length && o.length) {
        Modal.info({
          title: title + " · 选择业务类型",
          content: (
            <Space direction="vertical">
              <p>
                对应 {p.length} 个项目与 {o.length} 个商机。
              </p>
              <Button
                onClick={() => {
                  navigate(
                    "/projects?pids=" +
                      p.map((b) => b.pid).join(",") +
                      "&drillTitle=" +
                      encodeURIComponent(title),
                  );
                  Modal.destroyAll();
                }}
              >
                查看项目 {p.length}
              </Button>
              <Button
                onClick={() => {
                  navigate(
                    "/opportunities?pids=" +
                      o.map((b) => b.pid).join(",") +
                      "&drillTitle=" +
                      encodeURIComponent(title),
                  );
                  Modal.destroyAll();
                }}
              >
                查看商机 {o.length}
              </Button>
            </Space>
          ),
        });
        return;
      }
      const ids = (p.length ? p : bs).map((b) => b.pid).join(",");
      navigate(
        (p.length ? "/projects" : "/opportunities") +
          "?pids=" +
          ids +
          "&drillTitle=" +
          encodeURIComponent(title),
      );
    };
  const metric = (title: string, value: any, bs: any[]) => (
    <Col xs={24} md={6} key={title}>
      <Card hoverable onClick={() => drill(bs, title)}>
        <Statistic title={title} value={value} />
        <small>点击查看对应业务</small>
      </Card>
    </Col>
  );
  const delivered = projects.filter(
      (b) =>
        [
          "FORMAL_DELIVERY",
          "SUPPLEMENT_DELIVERY",
          "CUSTOMER_ACCEPTANCE",
          "INITIATE_CLOSE",
          "CLOSE",
          "CLOSED",
        ].includes(b.stage) ||
        b.history.some((h) => h.action.includes("正式交付")),
    ),
    accepted = projects.filter(
      (b) => riskFacts(state, b.id).p.accepted >= b.target && b.target > 0,
    ),
    closed = projects.filter((b) => b.completed),
    overdue = rows.filter((b) => b.deadline && diff(b.deadline, day()) > 0),
    riskRows = rows.filter((b) => b.risk.level);
  const managers = state.users
    .map((u) => ({ ...u, bs: rows.filter((b) => b.ownerId === u.id) }))
    .filter((u) => u.bs.length);
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Title level={3}>管理驾驶舱</Typography.Title>
      <Tabs
        items={[
          {
            key: "operating",
            label: "经营概览",
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Space>
                  统计周期{" "}
                  <Select
                    value={period}
                    onChange={setPeriod}
                    options={[
                      { value: "week", label: "本周" },
                      { value: "last30", label: "近30天" },
                      { value: "all", label: "全部" },
                    ]}
                  />
                  <small>基于本地业务事实与流程事件计算</small>
                </Space>
                <Row gutter={[16, 16]}>
                  {metric("本期新增项目", projects.length, projects)}
                  {metric(
                    "进入正式交付率",
                    num(
                      projects.length
                        ? (delivered.length / projects.length) * 100
                        : 0,
                    ) + "%",
                    delivered,
                  )}
                  {metric(
                    "客户验收率",
                    num(
                      delivered.length
                        ? (accepted.length / delivered.length) * 100
                        : 0,
                    ) + "%",
                    accepted,
                  )}
                  {metric("风险项目 / 商机", riskRows.length, riskRows)}
                  {metric("进行中业务", active.length, active)}
                  {metric("逾期项目 / 商机", overdue.length, overdue)}
                  {metric("结项项目数", closed.length, closed)}
                  {metric(
                    "平均首次交付周期",
                    num(
                      quantiles(
                        projects.flatMap((b) => {
                          const first = [
                            ...(state.production[b.id]?.deliveries || []),
                          ].sort((a, b) => a.at.localeCompare(b.at))[0];
                          return first
                            ? [
                                diff(
                                  b.startDate || b.createdAt.slice(0, 10),
                                  first.at.slice(0, 10),
                                ),
                              ]
                            : [];
                        }),
                      )?.mean,
                    ) + "天",
                    projects.filter(
                      (b) => state.production[b.id]?.deliveries?.length,
                    ),
                  )}
                </Row>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card title="项目价值兑现漏斗">
                      {[
                        ["已立项", projects],
                        ["正式交付", delivered],
                        ["客户验收", accepted],
                        ["已结项", closed],
                      ].map(([title, bs]) => (
                        <div key={title as string}>
                          <Button
                            type="link"
                            onClick={() => drill(bs as any[], title as string)}
                          >
                            {title as string} · {(bs as any[]).length} 个
                          </Button>
                          <Progress
                            percent={
                              projects.length
                                ? Math.round(
                                    ((bs as any[]).length / projects.length) *
                                      100,
                                  )
                                : 0
                            }
                          />
                        </div>
                      ))}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="人员负载与协同">
                      <p className="muted">
                        在手项目仅代表相对负载，不代表真实工时容量。
                      </p>
                      {managers.map((u) => (
                        <div key={u.id}>
                          <Button
                            type="link"
                            onClick={() => drill(u.bs, u.name + "在手业务")}
                          >
                            {u.name} · {u.bs.length}个 · 风险{" "}
                            {u.bs.filter((b) => b.risk.level).length}
                          </Button>
                          <Progress
                            percent={Math.round(
                              (u.bs.length /
                                Math.max(
                                  1,
                                  ...managers.map((u) => u.bs.length),
                                )) *
                                100,
                            )}
                          />
                        </div>
                      ))}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="项目健康度与异常原因">
                      {[
                        [
                          "需介入",
                          rows.filter(
                            (b) => b.risk.level === "P0" || b.risk.pending,
                          ),
                        ],
                        [
                          "需关注",
                          rows.filter(
                            (b) => b.risk.level && b.risk.level !== "P0",
                          ),
                        ],
                        ["健康/待监控", rows.filter((b) => !b.risk.level)],
                        ["无负责人", rows.filter((b) => !b.ownerId)],
                        ["缺交付日期", rows.filter((b) => !b.deadline)],
                        [
                          "流程反复",
                          rows.filter(
                            (b) =>
                              b.history.filter((h) => h.action.includes("补交"))
                                .length > 1,
                          ),
                        ],
                      ].map(([title, bs]) => (
                        <Button
                          key={title as string}
                          onClick={() => drill(bs as any[], title as string)}
                          style={{ margin: 4 }}
                        >
                          {title as string} · {(bs as any[]).length}
                        </Button>
                      ))}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="项目生命周期与节点效率">
                      {Object.entries(stageNames)
                        .filter(([k]) => projects.some((b) => b.stage === k))
                        .map(([key, label]) => {
                          const bs = projects.filter((b) => b.stage === key);
                          return (
                            <p key={key}>
                              <Button
                                type="link"
                                onClick={() => drill(bs, label)}
                              >
                                {label} · {bs.length}个
                              </Button>{" "}
                              平均停留{" "}
                              {num(
                                quantiles(
                                  bs.flatMap((b) => {
                                    const entered =
                                      b.history
                                        .filter(
                                          (h) => h.snapshot?.to === b.stage,
                                        )
                                        .sort((a, b) =>
                                          b.at.localeCompare(a.at),
                                        )[0]?.at ||
                                      (b.stage === "ESTABLISHED"
                                        ? b.createdAt
                                        : null);
                                    return entered
                                      ? [diff(entered.slice(0, 10), day())]
                                      : [];
                                  }),
                                )?.mean,
                              )}{" "}
                              天
                            </p>
                          );
                        })}
                    </Card>
                  </Col>
                </Row>
                <Card title="行动中心">
                  <Space wrap>
                    <Button onClick={() => drill(overdue, "交付逾期")}>
                      查看逾期业务 {overdue.length}
                    </Button>
                    <Button onClick={() => drill(riskRows, "风险业务")}>
                      查看风险业务 {riskRows.length}
                    </Button>
                    <Button
                      onClick={() =>
                        drill(
                          projects.filter(
                            (b) => b.stage === "CUSTOMER_ACCEPTANCE",
                          ),
                          "待客户验收",
                        )
                      }
                    >
                      待客户验收
                    </Button>
                    <Button
                      onClick={() =>
                        drill(
                          projects.filter(
                            (b) => b.stage === "SUPPLEMENT_DELIVERY",
                          ),
                          "补交付",
                        )
                      }
                    >
                      补交付
                    </Button>
                  </Space>
                </Card>
              </Space>
            ),
          },
          {
            key: "risk",
            label: "风险与决策",
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Space>
                  <Button onClick={() => setConfig(true)}>全局风险规则</Button>
                  <Button onClick={() => setAi(true)}>
                    AI研判（本地模拟）
                  </Button>
                </Space>
                <Row gutter={[16, 16]}>
                  {metric(
                    "需要管理层介入",
                    rows.filter((b) => b.risk.level === "P0" || b.risk.pending)
                      .length,
                    rows.filter((b) => b.risk.level === "P0" || b.risk.pending),
                  )}
                  {metric("在管项目 / 商机", active.length, active)}
                  {metric(
                    "待拍板事项",
                    pending.length,
                    pending
                      .map((d) =>
                        state.businesses.find((b) => b.id === d.businessId),
                      )
                      .filter(Boolean),
                  )}
                  {metric(
                    "待核对反馈",
                    state.risks.filter((r) =>
                      r.feedback?.some((f) => f.status === "待复核"),
                    ).length,
                    state.risks
                      .filter((r) =>
                        r.feedback?.some((f) => f.status === "待复核"),
                      )
                      .map((r) =>
                        state.businesses.find((b) => b.id === r.businessId),
                      )
                      .filter(Boolean),
                  )}
                </Row>
                <Tabs
                  items={[
                    {
                      key: "overview",
                      label: "风险总览",
                      children: (
                        <>
                          <Card title="接下来怎么做 · 待拍板">
                            {pending.length ? (
                              pending.map((d) => (
                                <Card
                                  size="small"
                                  key={d.id}
                                  title={d.title}
                                  extra={
                                    <Button
                                      disabled={user.role !== "approver"}
                                      onClick={() => setDecision(d)}
                                    >
                                      查看并记录意见
                                    </Button>
                                  }
                                >
                                  <p>{d.proposal}</p>
                                  <small>
                                    {d.due}前 ·{" "}
                                    {
                                      state.businesses.find(
                                        (b) => b.id === d.businessId,
                                      )?.name
                                    }{" "}
                                    · {d.createdBy}
                                  </small>
                                </Card>
                              ))
                            ) : (
                              <Empty description="暂无待拍板事项；不凭空生成决策" />
                            )}
                          </Card>
                          <Card title="决策记录">
                            {state.decisions
                              .filter((d) => d.status !== "PENDING")
                              .map((d) => (
                                <p key={d.id}>
                                  <Tag>
                                    {
                                      {
                                        APPROVED: "同意方案",
                                        REJECTED: "不同意",
                                        RETURNED: "退回补充",
                                      }[d.status]
                                    }
                                  </Tag>
                                  {d.title} · {d.opinion}
                                  <br />
                                  {d.decidedBy} · {d.decidedAt}
                                </p>
                              ))}
                          </Card>
                        </>
                      ),
                    },
                    {
                      key: "analysis",
                      label: "项目趋势",
                      children: (
                        <>
                          <Select
                            placeholder="选择分析项目"
                            value={selected}
                            style={{ width: 360, marginBottom: 16 }}
                            onChange={setSelected}
                            options={active
                              .filter((b) => b.kind === "project")
                              .map((b) => ({ value: b.id, label: b.name }))}
                          />
                          {selected ? (
                            <>
                              <Overview businessId={selected} />
                              <Trend businessId={selected} />
                            </>
                          ) : (
                            <Empty description="选择项目后查看生产与成本趋势" />
                          )}
                        </>
                      ),
                    },
                    {
                      key: "ledger",
                      label: "全部风险台账",
                      children: <RiskLedger />,
                    },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />
      {config && <Config onClose={() => setConfig(false)} />}
      <ActionModal
        open={!!decision}
        title="记录管理决策意见"
        onClose={() => setDecision(null)}
        save={(v) =>
          command("risk.decision.resolve", { ...v, id: decision.id })
        }
        fields={
          <>
            <Alert message="决策意见不直接修改风险、预算或交付事实，仍需执行并复核。" />
            <p>{decision?.proposal}</p>
            <Form.Item
              name="result"
              label="决策结论"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: "APPROVED", label: "同意方案" },
                  { value: "REJECTED", label: "不同意" },
                  { value: "RETURNED", label: "退回补充" },
                ]}
              />
            </Form.Item>
          </>
        }
      />
      {ai && <AI onClose={() => setAi(false)} />}
    </Space>
  );
}
function AI({ onClose }: { onClose: () => void }) {
  const { state } = usePMC(),
    [result, setResult] = useState("");
  const payload = {
    schema: "pmc-risk-analysis-v1",
    simulated: true,
    ruleVersion: state.riskConfig.version,
    projects: state.businesses.map((b) => ({
      name: b.name,
      target: b.target,
      deadline: b.deadline,
      budget: b.budget,
      facts: riskFacts(state, b.id),
      risks: riskSummary(state, b.id),
      followups: state.followups.filter(
        (f) => f.businessId === b.id && !f.deleted,
      ),
    })),
  };
  const download = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "PMC风险研判输入_" + day() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Drawer open title="AI研判 · 本地模拟" width={850} onClose={onClose}>
      <Alert
        type="info"
        message="模拟结果，不调用任何外部模型"
        description="只读参考；不修改风险等级、预算、基线或决策。附件内容不进入分析输入。"
      />
      <Space style={{ margin: "16px 0" }}>
        <Button
          type="primary"
          onClick={() =>
            setResult(
              "【本地模拟研判】\n" +
                state.businesses
                  .filter((b) => !b.completed)
                  .map((b) => {
                    const r = riskSummary(state, b.id),
                      f = riskFacts(state, b.id);
                    return (
                      b.name +
                      "：" +
                      (r.level || "尚未触发有效风险") +
                      "，" +
                      r.active.length +
                      "项待处理。有效生产 " +
                      num(f.p.produced) +
                      " / " +
                      num(b.target) +
                      "，客户接受 " +
                      num(f.p.accepted) +
                      "；实际成本 " +
                      money(f.actual) +
                      "。" +
                      (!f.ready
                        ? "样本不足，不能承诺预计完成日期。"
                        : "请核对近期产速与剩余窗口。") +
                      " 建议先核对日报与验收凭证，再由负责人决定补产或预算方案。"
                    );
                  })
                  .join("\n\n"),
            )
          }
        >
          生成本地模拟研判
        </Button>
        <Button onClick={download}>导出分析输入</Button>
      </Space>
      {result ? (
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
          {result}
        </Typography.Paragraph>
      ) : (
        <Empty description="暂无模拟结果" />
      )}
      <details>
        <summary>查看只读输入</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </Drawer>
  );
}

function evidenceText(signal: any) {
  const e = signal?.evidence;
  if (!e) return "暂无计算依据";
  if (e.found)
    return `${e.found.length}条窗口信号 · 有效窗口 ${e.readyWindows?.join("／") || "不足"}天${e.held ? " · 等待连续有效日恢复" : ""}`;
  if (e.gap != null)
    return `日产出 ${num(e.actual)}／日基线 ${num(e.baseline)}`;
  if (e.ratio != null) return `成本水位 ${num(e.ratio * 100)}%`;
  if (e.forecast != null)
    return typeof e.forecast === "number"
      ? `预计总成本 ${money(e.forecast)}／预算 ${money(e.budget)}`
      : `预计完成 ${e.forecast} · 日期差 ${num(e.delay)}天`;
  if (e.date) return `最近有效日 ${e.date}`;
  return Object.entries(e)
    .slice(0, 3)
    .map(
      ([key, value]) =>
        `${{ deadline: "截止", accepted: "客户接受", target: "目标", actual: "实际成本", budget: "预算", forecast: "预测" }[key] || key} ${typeof value === "string" ? value : num(value)}`,
    )
    .join(" · ");
}
function PushAlert({ businessId }: { businessId: string }) {
  const { state, user, command } = usePMC(),
    ps = state.settings.riskPush?.[businessId];
  if (!ps) return null;
  return (
    <Alert
      type={ps.alert ? "warning" : "info"}
      message={
        "风险推送状态：" +
        { RUNNING: "正常提醒", PAUSED: "暂停提醒", PREPARING: "筹备中" }[
          ps.mode
        ]
      }
      description={
        <>
          <p>
            {ps.alert || ps.reason}{" "}
            {ps.resumeDate ? " · 恢复日 " + ps.resumeDate : ""} · 累计已暂停{" "}
            {ps.accumulatedPauseDays || 0}{" "}
            天。计算继续，交付截止与基线不自动改变。
          </p>
          {ps.alert && (
            <Button
              disabled={user.role === "viewer"}
              onClick={() => command("risk.push.ack", { businessId })}
            >
              已知晓
            </Button>
          )}
        </>
      }
    />
  );
}

function FactsExplanation({ facts: f }: { facts: any }) {
  const sample = (f.rows || [])
      .filter((r) => r.quantity != null)
      .map((r) => r.quantity),
    sorted = [...sample].sort((a, b) => a - b);
  return (
    <Space direction="vertical" style={{ width: "100%", marginTop: 16 }}>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: "goal",
            label: "目标来自公共信息",
            children:
              num(f.b.target) +
              " " +
              f.b.unit +
              "；正式截止 " +
              (f.b.deadline || "未提供"),
          },
          {
            key: "production",
            label: "有效生产来自末端节点",
            children:
              num(f.p.produced) +
              " " +
              f.b.unit +
              "；逐日PM修正优先，明确0保留",
          },
          {
            key: "accepted",
            label: "客户接受量",
            children: num(f.p.accepted) + " " + f.b.unit + "；与生产量分别统计",
          },
          {
            key: "cost",
            label: "实际成本与预算",
            children:
              money(f.actual) + "／" + money(f.b.budget) + "；金额内部按分计算",
          },
          {
            key: "sample",
            label: "窗口有效日",
            children:
              (f.stats?.count || 0) +
              "／" +
              f.window +
              "；门槛 max(" +
              f.c.minSamples +
              ", ceil(" +
              f.window +
              " × " +
              f.c.coverage +
              ")) = " +
              f.threshold,
          },
        ]}
      />
      <Typography.Title level={5}>代入计算</Typography.Title>
      <p>
        剩余量 = max(目标 {num(f.b.target)} −{" "}
        {f.basis === "acceptance" ? "客户接受" : "有效生产"} {num(f.current)},
        0) = {num(f.remaining)} {f.b.unit}
        。生产口径不会再次估算已生产但尚未验收的内容。
      </p>
      <p>
        日基线 = 剩余 {num(f.remaining)} ÷ 剩余自然日 {num(f.daysLeft)} ={" "}
        {num(f.required)} {f.b.unit}
        ／日。目标已完成时为0，到期仍有缺口时不除以0。
      </p>
      <p>
        概览预计天数 = ceil(剩余量 ÷ 有效日产速 {num(f.rate)})；预计完成{" "}
        {f.forecastDate || "暂不能推算"}。
        {f.reliable
          ? "有效自然日满足统计判级要求。"
          : "当前只能做算术参考，不据此输出统计预测等级。"}
      </p>
      <p>
        窗口情景先检查有效日门槛，再用日产速分位数。乐观短工期P5使用高日产速P95，保守长工期P95使用低日产速P5。成本P5使用低单位成本，P95使用高单位成本。
      </p>
      <p>
        预计总成本 = 已发生 {money(f.actual)} + ceil到分(剩余待加工量 ×
        历史单位成本中位数)。概览至少需{f.c.minSamples}
        个成本日；三情景还需满足窗口覆盖门槛{f.threshold}日。
      </p>
      <Typography.Title level={5}>分位数与数据有效性</Typography.Title>
      <p>
        有效产能样本从小到大：
        {sorted.length ? sorted.map(num).join("、") : "暂无完整样本"}
        。分位数采用位置 (样本数−1) ×
        比例，在两侧值之间线性插值；P5～P95只是情景范围。
      </p>
      <p>
        缺报保持空值，不补0；当日平台暂计不进完整样本，当日明确PM修正可作为最近有效日产速。单位成本仅使用产量大于0且成本明确的日期。
        {!f.aligned ? "累计量和带日期明细尚未对齐，暂不外推。" : ""}
        {f.stale ? "日报已过期，暂不判统计等级。" : ""}
      </p>
    </Space>
  );
}
