/** F02 — GUI parity with the test platform; all figures derive from local demo facts. */
import React, { useEffect, useRef } from "react";
import { Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import * as echarts from "echarts";
import { useNavigate } from "react-router-dom";
import { usePMC } from "../api";
import { displayProjectRisk } from "../../shared/reports";
import { dashboardFacts } from "../../shared/dashboard";
import { addDays, day, stageNames, type Business } from "../../shared/types";
import "./dashboard.css";
const colors = [
  "#686fa6",
  "#508e8d",
  "#a85659",
  "#91617e",
  "#a16d48",
  "#5a8168",
];
const lifecycleColors: Record<string, string> = {
  "发起项目（L4–L5）": "#686fa6",
  "Demo交付（L1–L2）": "#508e8d",
  丢单: "#a85659",
  已立项: "#75609a",
  正式交付: "#91617e",
  客户验收: "#ad775b",
  补交付: "#a98b47",
  发起结项: "#a16d48",
  结项中: "#9a6b44",
  已结项: "#5a8168",
  立项后违约: "#a85659",
};
export function Chart({
  option,
  label,
  onSelect,
}: {
  option: echarts.EChartsOption;
  label: string;
  onSelect?: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    chart.on("click", (e: any) => onSelect?.(e.name));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, onSelect]);
  return (
    <div ref={ref} className="platform-chart" role="img" aria-label={label} />
  );
}
const info = (title: string, note: string) => (
  <Tooltip title={note}>
    <QuestionCircleOutlined aria-label={title + "统计口径"} />
  </Tooltip>
);
function pie(
  data: { name: string; value: number }[],
  centerText: string,
  centerNote: string,
): echarts.EChartsOption {
  return {
    animation: false,
    color: colors,
    textStyle: { fontFamily: "Inter,-apple-system,system-ui,sans-serif" },
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} ({d}%)" },
    legend: {
      bottom: 2,
      left: "center",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: "#666" },
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "36%",
        style: {
          text: centerText,
          fontSize: 24,
          fontWeight: 600,
          fill: "#202a32",
          align: "center",
        },
      },
      {
        type: "text",
        left: "center",
        top: "49%",
        style: {
          text: centerNote,
          fontSize: 12,
          fill: "#8a9298",
          align: "center",
        },
      },
    ],
    series: [
      {
        type: "pie",
        radius: ["43%", "65%"],
        center: ["50%", "40%"],
        avoidLabelOverlap: true,
        label: { show: true, formatter: "{d}%", fontSize: 11, color: "#333" },
        labelLine: { length: 10, length2: 4 },
        itemStyle: { borderWidth: 1, borderColor: "#fff" },
        data: data
          .filter((x) => x.value)
          .map((x) => ({
            ...x,
            itemStyle: lifecycleColors[x.name]
              ? { color: lifecycleColors[x.name] }
              : undefined,
          })),
      },
    ],
  };
}
function bars(
  labels: string[],
  series: { name: string; data: number[]; color?: string }[],
  stack = false,
  dataColors?: string[],
): echarts.EChartsOption {
  return {
    animation: false,
    color: ["#547fa8", "#a85659"],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: {
      top: stack ? 65 : 24,
      bottom: stack ? 34 : 26,
      left: 12,
      right: 22,
      containLabel: true,
    },
    legend: {
      show: series.length > 1,
      bottom: 6,
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { fontSize: 12, color: "#666" },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#e7eaed" } },
      axisLabel: {
        color: "#666",
        fontSize: 12,
        rotate: labels.length > 5 ? 18 : 0,
        interval: 0,
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#999", fontSize: 11 },
      splitLine: { lineStyle: { color: "#f0f1f3" } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      stack: stack ? "total" : undefined,
      barMaxWidth: 26,
      itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] },
      label: {
        show: series.length === 1,
        position: "top",
        fontSize: 12,
        color: "#555",
      },
      data: s.data.map((value, i) =>
        dataColors?.[i]
          ? { value, itemStyle: { color: dataColors[i] } }
          : value,
      ),
    })),
  };
}
export function Dashboard() {
  const { state } = usePMC();
  const navigate = useNavigate();
  const {
    opportunities,
    projects,
    converted,
    unconverted,
    opps,
    ongoing,
    due,
    risky,
    active,
  } = dashboardFacts(state);
  const level = (b: Business) => {
    const resolved = displayProjectRisk(state, b);
    if (resolved)
      return (
        (
          { P0: "高风险", P1: "中风险", P2: "低风险" } as Record<string, string>
        )[resolved] || "未记录"
      );
    return b.common.deliveryRisk === "无风险" ? "无风险" : "未记录";
  };
  const drill = (
    rows: Business[],
    kind: "project" | "opportunity" = "project",
  ) =>
    navigate(
      "/" +
        (kind === "project" ? "projects" : "opportunities") +
        "?pids=" +
        rows.map((b) => b.pid).join(","),
    );
  const by = (rows: Business[], key: (b: Business) => string) => {
    const groups = new Map<string, Business[]>();
    rows.forEach((b) => {
      const k = key(b);
      groups.set(k, [...(groups.get(k) || []), b]);
    });
    return groups;
  };
  const lifeOpp = by(opportunities, (b) =>
    b.kind === "project"
      ? "发起项目（L4–L5）"
      : b.stage === "LOST"
        ? "丢单"
        : b.stage === "INITIATE_PROJECT"
          ? "发起项目（L4–L5）"
          : "Demo交付（L1–L2）",
  );
  const lifeProj = by(
    projects,
    (b) =>
      ({ CLOSE: "结项中", LOST: "立项后违约" })[b.stage] ||
      stageNames[b.stage] ||
      b.stage,
  );
  const people = (
    field: "presalesId" | "salesId" | "ownerId",
    rows: Business[],
    lost = false,
  ) => {
    const groups = by(
      rows,
      (b) => state.users.find((u) => u.id === b[field])?.name || "未指派",
    );
    const labels = [...groups.keys()];
    return {
      groups,
      labels,
      option: bars(
        labels,
        lost
          ? [
              {
                name: "进行中",
                data: labels.map((l) => groups.get(l)!.filter(active).length),
              },
              {
                name: "丢单数",
                data: labels.map(
                  (l) =>
                    groups.get(l)!.filter((b) => b.stage === "LOST").length,
                ),
              },
            ]
          : [
              {
                name: "项目数",
                data: labels.map((l) => groups.get(l)!.length),
              },
            ],
        lost,
      ),
    };
  };
  const pre = people("presalesId", opportunities, true),
    sales = people("salesId", opportunities, true),
    pm = people("ownerId", projects);
  const riskGroups = by(projects, level),
    riskLabels = ["无风险", "高风险", "中风险", "低风险"];
  const timeGroups = new Map([
    ["逾期", ongoing.filter((b) => !!b.deadline && b.deadline < day())],
    ["7日内", due],
    ["正常", ongoing.filter((b) => b.deadline > addDays(7))],
  ]);
  const percent = (a: number, b: number) =>
    b ? Math.round((a / b) * 1000) / 10 : 0;
  const panels: {
    title: string;
    note: string;
    option: echarts.EChartsOption;
    select: (name: string) => void;
    label: string;
  }[] = [
    {
      title: "商机生命周期",
      note: "统计已进入本平台流程的商机，并按当前阶段唯一归类",
      option: pie(
        ["发起项目（L4–L5）", "Demo交付（L1–L2）", "丢单"].map((name) => ({
          name,
          value: lifeOpp.get(name)?.length || 0,
        })),
        String(opportunities.length),
        "商机总数",
      ),
      select: (n: string) => drill(lifeOpp.get(n) || [], "opportunity"),
      label: "商机生命周期环形图",
    },
    {
      title: "项目生命周期",
      note: "统计本平台项目，并按当前阶段唯一归类",
      option: pie(
        [...lifeProj].map(([name, rows]) => ({ name, value: rows.length })),
        String(projects.length),
        "项目总数",
      ),
      select: (n: string) => drill(lifeProj.get(n) || []),
      label: "项目生命周期环形图",
    },
    {
      title: "售前人员商机分布",
      note: "按当前售前负责人统计已进入本平台流程的商机",
      option: pre.option,
      select: (n: string) => drill(pre.groups.get(n) || [], "opportunity"),
      label: "售前人员商机分布柱状图",
    },
    {
      title: "销售负责人商机分布",
      note: "按当前销售易商机负责人统计已进入本平台流程的商机",
      option: sales.option,
      select: (n: string) => drill(sales.groups.get(n) || [], "opportunity"),
      label: "销售负责人商机分布柱状图",
    },
    {
      title: "项目经理分布",
      note: "按当前项目经理统计本平台项目",
      option: pm.option,
      select: (n: string) => drill(pm.groups.get(n) || []),
      label: "项目经理分布柱状图",
    },
    {
      title: "项目风险分布",
      note: "统计本平台项目的当前风险等级",
      option: bars(
        riskLabels,
        [
          {
            name: "项目数",
            data: riskLabels.map((n) => riskGroups.get(n)?.length || 0),
          },
        ],
        false,
        ["#5a8168", "#a85659", "#a58343", "#6787ad"],
      ),
      select: (n: string) => drill(riskGroups.get(n) || []),
      label: "项目风险分布柱状图",
    },
    {
      title: "商机转项目",
      note: "统计已进入本平台流程的商机，并按当前是否已转项目计算",
      option: {
        ...pie(
          [
            { name: "已转项目", value: converted.length },
            { name: "未转项目", value: unconverted.length },
          ],
          percent(converted.length, opportunities.length) + "%",
          "转项目率",
        ),
        color: ["#547fa8", "#e0e5ea"],
      },
      select: (n: string) =>
        drill(n === "已转项目" ? converted : unconverted, "opportunity"),
      label: "商机转项目转化率环形图",
    },
    {
      title: "项目交付时效",
      note: "仅统计进行中且已设置正式交付截止时间的项目，并按逾期、7日内和正常归类",
      option: {
        ...bars(
          [...timeGroups.keys()],
          [
            {
              name: "项目数",
              data: [...timeGroups.values()].map((x) => x.length),
            },
          ],
        ),
        series: [
          {
            type: "bar",
            barMaxWidth: 38,
            label: { show: true, position: "top" },
            data: [...timeGroups.values()].map((x, i) => ({
              value: x.length,
              itemStyle: { color: ["#a85659", "#a98b47", "#547fa8"][i] },
            })),
          },
        ],
      },
      select: (n: string) => drill(timeGroups.get(n) || []),
      label: "进行中项目交付时效柱状图",
    },
  ];
  return (
    <div className="platform-dashboard" data-feature="F02">
      <div className="platform-metrics">
        {[
          {
            label: "进行中商机",
            rows: opps,
            note: `流程商机总数 ${opportunities.length} · 占比 ${percent(opps.length, opportunities.length)}%`,
            kind: "opportunity" as const,
            color: "#477eaf",
          },
          {
            label: "进行中项目",
            rows: ongoing,
            note: `项目总数 ${projects.length} · 占比 ${percent(ongoing.length, projects.length)}%`,
            kind: "project" as const,
            color: "#477eaf",
          },
          {
            label: "7 日内到期",
            rows: due,
            note: `占进行中项目 ${percent(due.length, ongoing.length)}%`,
            kind: "project" as const,
            color: "#7f8b93",
          },
          {
            label: "风险项目",
            rows: risky,
            note: `占进行中项目 ${percent(risky.length, ongoing.length)}%`,
            kind: "project" as const,
            color: "#b94d52",
          },
        ].map((m) => (
          <button
            className="platform-metric"
            style={{ "--metric-accent": m.color } as React.CSSProperties}
            key={m.label}
            aria-label={"查看" + m.label + "列表"}
            onClick={() => drill(m.rows, m.kind)}
          >
            <span>
              {m.label}{" "}
              {info(
                m.label,
                m.label === "风险项目"
                  ? "进行中且存在交付风险的项目。"
                  : "仅统计当前流程状态符合条件的业务。",
              )}
            </span>
            <strong style={{ color: m.color }}>{m.rows.length}</strong>
            <small>{m.note}</small>
          </button>
        ))}
      </div>
      <div className="platform-dashboard-grid">
        {panels.map((p) => (
          <section className="platform-chart-card" key={p.title}>
            <h3>
              {p.title} {info(p.title, p.note)}
            </h3>
            <Chart label={p.label} option={p.option} onSelect={p.select} />
          </section>
        ))}
      </div>
    </div>
  );
}
