/** F10: version plans, preparation/trial strategy, baseline preview and progress. */
import React, { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from "antd";
import {
  dynamicPlan,
  platforms,
  type Chain,
  type ProductionData,
  type ProductionVersion,
  type ProductionNode,
} from "../../../shared/production";
import { day } from "../../../shared/types";
export const fmtProduction = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const rate = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1).replace(/\.0$/, "")}%`;
export function ProductionTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="production-plain-table-wrap">
      <table className="production-plain-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="production-empty-row">
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
/** Read-only preview; publication continues to use the domain command and its validation. */
export function previewProductionBaseline(v: ProductionVersion) {
  const start = v.prepEnd && v.prepEnd > v.start ? v.prepEnd : v.start,
    days = Math.floor((Date.parse(v.deadline) - Date.parse(start)) / 864e5) + 1;
  if (!(days > 0)) throw new Error("正式生产周期无效，请完善版本日期。");
  const incoming = new Map(
    v.nodes.map((n) => [n.id, v.edges.filter((e) => e.to === n.id).length]),
  );
  const outgoing = new Map(
    v.nodes.map((n) => [n.id, v.edges.filter((e) => e.from === n.id)]),
  );
  if (
    v.edges.length !== v.nodes.length - 1 ||
    v.nodes.some(
      (n) => incoming.get(n.id)! > 1 || outgoing.get(n.id)!.length > 1,
    )
  )
    throw new Error(
      "当前链路包含多输入、分支或汇合；请逐节点维护手工日生产计划。",
    );
  const order: ProductionNode[] = [],
    seen = new Set<string>();
  let cursor = v.nodes.find((n) => incoming.get(n.id) === 0);
  while (cursor && !seen.has(cursor.id)) {
    order.push(cursor);
    seen.add(cursor.id);
    cursor = v.nodes.find((n) => n.id === outgoing.get(cursor!.id)?.[0]?.to);
  }
  if (order.length !== v.nodes.length)
    throw new Error("请先完整连接线性链路并确认编排。");
  let demand = v.target;
  const rows: any[] = [];
  for (const n of order.reverse()) {
    if (["COLLECTION", "INTERNAL_SELECTION"].includes(n.platform)) continue;
    const kind = n.reports.some((r) => r.kind === "production")
        ? "production"
        : "trial",
      rr = n.reports.filter((r) => r.kind === kind),
      input = rr.reduce((s, r) => s + r.input, 0),
      output = rr.reduce((s, r) => s + r.output, 0);
    if (v.strategy === "trial" && !(input > 0 && output > 0))
      throw new Error(`${n.title} 缺少有效试跑样本，请先回放样本数据。`);
    const ratio = input ? output / input : v.preset / 100;
    if (!(ratio > 0)) throw new Error(`${n.title} 转化率必须大于0。`);
    const totalInput = Math.ceil(demand / ratio - 1e-8);
    rows.unshift({
      nodeId: n.id,
      title: n.title,
      ratio,
      ratioSource: input
        ? kind === "trial"
          ? "试跑样本"
          : "正式上报"
        : "预设假设",
      totalInput,
      totalOutput: demand,
      dailyInput: n.dailyPlan || Math.ceil(totalInput / days),
      dailyOutput: Math.ceil(demand / days),
    });
    demand = totalInput;
  }
  return { target: v.target, days, rows };
}
export function BaselinePreview({
  value,
  onClose,
  onPublish,
}: {
  value: any;
  onClose: () => void;
  onPublish?: () => Promise<any>;
}) {
  return (
    <Modal
      rootClassName="production-baseline-modal"
      width={920}
      open={!!value}
      title={
        value?.readonly ? `历史基线 r${value.revision}` : "线性链路基线倒推预览"
      }
      cancelText="返回调整"
      okText={value?.readonly ? "关闭" : "确认发布基线"}
      onCancel={onClose}
      onOk={
        value?.readonly
          ? onClose
          : async () => {
              await onPublish?.();
              onClose();
            }
      }
    >
      {value && (
        <>
          <p className="production-baseline-notice">
            版本目标 {fmtProduction(value.target)} {value.unit}，正式周期{" "}
            {value.days}{" "}
            天。按各节点的实际/预估输出率倒推，客户验收比率按口述自动展示，不作为未完成生产的损耗率。
          </p>
          <ProductionTable
            headers={[
              "节点",
              "基线转化率",
              "来源",
              "总输入需求",
              "合格输出需求",
              "初始日基线",
            ]}
            rows={value.rows.map((r: any) => [
              r.title,
              rate(r.ratio),
              r.ratioSource,
              fmtProduction(r.totalInput),
              fmtProduction(r.totalOutput),
              fmtProduction(r.dailyInput),
            ])}
          />
        </>
      )}
    </Modal>
  );
}
export function BaselinePanel({
  version: v,
  chain,
  p,
  b,
  disabled,
  dirty,
  onChange,
  onSave,
  onPreview,
  onNode,
}: {
  version: ProductionVersion;
  chain: Chain;
  p: ProductionData;
  b: any;
  disabled: boolean;
  dirty: boolean;
  onChange: (v: ProductionVersion) => void;
  onSave: () => Promise<any>;
  onPreview: () => void;
  onNode: (id: string) => void;
}) {
  const [historical, setHistorical] = useState<any>(null);
  const patch = (key: string, value: any) => onChange({ ...v, [key]: value });
  const terminal = v.nodes.find((n) => n.id === v.output),
    accepted = terminal?.batches.reduce((s, x) => s + x.quantity, 0),
    hasFeedback = !!terminal?.batches.length;
  const totalDays =
      Math.floor((Date.parse(v.deadline) - Date.parse(v.start)) / 864e5) + 1,
    formalStart = v.prepEnd && v.prepEnd > v.start ? v.prepEnd : v.start,
    days =
      Math.floor((Date.parse(v.deadline) - Date.parse(formalStart)) / 864e5) +
      1,
    remaining = Math.max(
      0,
      Math.floor(
        (Date.parse(v.deadline) -
          Date.parse(day() > formalStart ? day() : formalStart)) /
          864e5,
      ) + 1,
    );
  const field = (title: string, control: React.ReactNode, help?: string) => (
    <div className="production-plan-field">
      <label>{title}</label>
      {control}
      {help && <small>{help}</small>}
    </div>
  );
  const rows = v.nodes
    .filter((n) => !["COLLECTION", "INTERNAL_SELECTION"].includes(n.platform))
    .map((n) => {
      const r = v.baseline?.rows.find((x: any) => x.nodeId === n.id),
        d = r ? dynamicPlan(v, n, day()) : null,
        kind = n.reports.some((x) => x.kind === "production")
          ? "production"
          : "trial",
        reports = n.reports.filter((x) => x.kind === kind),
        input = reports.reduce((s, r) => s + r.input, 0),
        out = reports.reduce((s, r) => s + r.output, 0);
      return [
        <strong>{n.title}</strong>,
        rate(r?.ratio),
        rate(input ? out / input : null),
        fmtProduction(r?.totalInput),
        fmtProduction(r?.totalOutput),
        r
          ? fmtProduction(r.dailyInput)
          : n.dailyPlan
            ? `${fmtProduction(n.dailyPlan)}（手工）`
            : "—",
        d?.daily == null ? "—" : `${fmtProduction(d.daily)} / ${d.days} 天`,
      ];
    });
  const task = p.tasks.find((t) => t.id === terminal?.taskId);
  return (
    <div className="production-baseline-page">
      <section className="production-section-card production-targets">
        <div className="production-section-heading">
          <div>
            <h3>版本交付目标与基线策略</h3>
            <p>
              {chain.name} · R{v.revision}；版本计划与项目承诺分开维护
            </p>
          </div>
          <span className="production-plan-access">
            {disabled ? "当前内容只读" : "可编辑"}
          </span>
        </div>
        <section
          className="production-target-group production-delivery-plan"
          aria-label="交付计划"
        >
          <h4>交付计划</h4>
          <div className="production-target-grid">
            {field(
              "版本交付目标",
              <InputNumber
                aria-label="版本交付目标"
                value={v.target}
                min={1}
                precision={0}
                addonAfter={b.unit}
                disabled={disabled}
                onChange={(x) => patch("target", x)}
              />,
              "默认按项目剩余目标带入；保存后的版本目标独立保留。",
            )}
            {field(
              "当前版本交付截止日期",
              <input
                aria-label="当前版本交付截止日期"
                type="date"
                value={v.deadline}
                disabled={disabled}
                onChange={(e) => patch("deadline", e.target.value)}
              />,
              "初版默认取“流程与提交”的承诺日期；可按版本调整，不回写项目表单。",
            )}
          </div>
        </section>
        <section className="production-target-group" aria-label="周期安排">
          <h4>周期安排</h4>
          <div className="production-target-grid">
            {field(
              "本版本周期起算日（自动）",
              <Input value={v.start || "—"} readOnly />,
              "新建链路默认从创建日开始；保存为新修订时按确认日重新起算。",
            )}
            {field(
              "筹备结束日期（选填）",
              <input
                aria-label="筹备结束日期"
                type="date"
                min={day()}
                value={v.prepEnd || ""}
                disabled={disabled || !!v.startedAt}
                onChange={(e) => patch("prepEnd", e.target.value)}
              />,
              "所选日期到达后可开始；晚于今天时禁止开始。首次开始后锁定。",
            )}
            {field(
              "首次开始时间（自动）",
              <Input
                value={
                  v.startedAt ? v.startedAt.slice(0, 19).replace("T", " ") : "—"
                }
                readOnly
              />,
            )}
          </div>
        </section>
        <section className="production-target-group" aria-label="节点基线策略">
          <h4>节点基线策略</h4>
          <div className="production-target-grid">
            {field(
              "无数据节点基线策略",
              <Select
                aria-label="无数据节点基线策略"
                value={v.strategy}
                disabled={disabled}
                options={[
                  { value: "estimate", label: "预估转化率" },
                  { value: "trial", label: "小批量试跑" },
                ]}
                onChange={(x) => patch("strategy", x)}
              />,
            )}
            {v.strategy === "trial"
              ? field(
                  "试跑计划样本量",
                  <InputNumber
                    min={1}
                    precision={0}
                    value={v.trialSize}
                    addonAfter={b.unit}
                    disabled={disabled}
                    onChange={(x) => patch("trialSize", x)}
                  />,
                )
              : field(
                  "无数据节点预设转化率",
                  <InputNumber
                    min={0.0001}
                    max={100}
                    value={v.preset}
                    addonAfter="%"
                    disabled={disabled}
                    onChange={(x) => patch("preset", x)}
                  />,
                )}
            {field(
              "末端客户验收转化率（自动）",
              <Input
                value={
                  hasFeedback && v.target
                    ? rate(accepted! / v.target)
                    : "待客户反馈"
                }
                readOnly
              />,
              `最终输出关联任务已验收 ${fmtProduction(accepted)} ${b.unit} ÷ 当前版本目标；未反馈不当作 0。`,
            )}
          </div>
        </section>
        <div className="production-period">
          <span>
            版本自然周期 {totalDays > 0 ? `${totalDays} 天` : "待完善"}
          </span>
          <strong>扣除筹备后 {days > 0 ? `${days} 天` : "待完善"}</strong>
          <span>
            预计剩余正式生产 {days > 0 ? `${remaining} 天` : "待完善"}
          </span>
        </div>
        <details className="production-advanced">
          <summary>低频设置 · 爬坡期与计算口径</summary>
          <Checkbox
            checked={v.ramp.enabled}
            disabled={disabled}
            onChange={(e) =>
              patch("ramp", { ...v.ramp, enabled: e.target.checked })
            }
          >
            标记爬坡期
          </Checkbox>
          {v.ramp.enabled && (
            <div className="production-target-grid">
              {field(
                "爬坡结束日",
                <input
                  type="date"
                  value={v.ramp.end}
                  disabled={disabled}
                  onChange={(e) =>
                    patch("ramp", { ...v.ramp, end: e.target.value })
                  }
                />,
              )}
              {field(
                "爬坡期每日输入计划",
                <InputNumber
                  min={1}
                  precision={0}
                  value={v.ramp.daily}
                  disabled={disabled}
                  onChange={(x) => patch("ramp", { ...v.ramp, daily: x })}
                />,
              )}
            </div>
          )}
          <p>
            客户验收量/目标按口述自动展示，用于观测达成进度，不将未完成的验收进度误用为损耗率。线性链路按版本目标和各节点输出率倒推；复杂图仅维护节点日计划，不自动均分目标或推算汇合去重。
          </p>
        </details>
        {dirty && (
          <div className="production-inline-save">
            <span>计划修改尚未保存，保存草稿后需返回画布确认新修订。</span>
            <Button disabled={disabled} onClick={onSave}>
              保存计划草稿
            </Button>
          </div>
        )}
      </section>
      <section className="production-section-card">
        <div className="production-section-heading">
          <h3>
            {v.baseline
              ? `基线与实时进度 · r${v.baseline.revision}`
              : "节点基线与实时进度"}
          </h3>
          <Button
            disabled={disabled || dirty || !!chain.draft || !v.confirmedAt}
            onClick={onPreview}
          >
            预览基线
          </Button>
        </div>
        <p className="production-section-muted">
          {v.baseline
            ? "已发布基线保持快照；实时数据更新不会静默修改总需求。"
            : "尚未发布基线，节点实时数据和手工日基线仍可查看。"}
        </p>
        <ProductionTable
          headers={[
            "节点",
            "基线转化率",
            "实时转化率",
            "总输入需求",
            "合格输出需求",
            "初始日基线",
            "今日动态目标 / 剩余天数",
          ]}
          rows={rows}
        />
        {!!v.baselineHistory.length && (
          <details className="production-advanced">
            <summary>历史基线（{v.baselineHistory.length} 次）</summary>
            {v.baselineHistory.map((r: any, i: number) => (
              <Button
                type="link"
                key={i}
                onClick={() =>
                  setHistorical({
                    ...r,
                    target: r.target ?? r.rows?.at(-1)?.totalOutput,
                    unit: b.unit,
                    readonly: true,
                  })
                }
              >
                查看基线 r{r.revision}
              </Button>
            ))}
          </details>
        )}
      </section>
      <section className="production-section-card">
        <h3>最终输出与客户验收</h3>
        <p className="production-section-muted">
          仅汇总最终输出节点的关联任务，不将中间节点重复相加；已选{" "}
          {terminal?.selected.length || 0} 项交付明细。
        </p>
        <div className="production-acceptance-bar">
          <span>
            已确认客户验收{" "}
            <strong>
              {fmtProduction(accepted)} {b.unit}
            </strong>
          </span>
          <span>
            末端客户验收转化率{" "}
            <strong>
              {hasFeedback && v.target
                ? rate(accepted! / v.target)
                : "待客户反馈"}
            </strong>
          </span>
        </div>
        <ProductionTable
          headers={["任务 ID / 名称", "创建时间", "操作"]}
          rows={
            terminal && task
              ? [
                  [
                    <>
                      <strong>{task.id}</strong>
                      <small>{task.name}</small>
                    </>,
                    task.createdAt.slice(0, 19).replace("T", " "),
                    <Button type="link" onClick={() => onNode(terminal.id)}>
                      确认产出
                    </Button>,
                  ],
                ]
              : []
          }
        />
      </section>
      <section className="production-section-card">
        <h3>任务维度日汇总回放</h3>
        <p className="production-section-muted">
          离线回放用于评审节点指标和后续风险口径，不向真实平台上报。相同任务/用途/日期保存为修订，不重复累加。
        </p>
        <ProductionTable
          headers={[
            "日期",
            "节点 / 任务",
            "用途",
            "输入",
            "已输出",
            "处理中",
            "已淘汰",
            "成本（元）",
            "修订",
          ]}
          rows={v.nodes.flatMap((n) =>
            n.reports.map((r) => [
              r.date,
              <>
                {n.title}
                <small>{n.taskId}</small>
              </>,
              r.kind === "trial" ? "试跑" : "正式",
              fmtProduction(r.input),
              fmtProduction(r.output),
              fmtProduction(r.processing),
              fmtProduction(r.eliminated),
              (r.cost / 100).toFixed(2),
              `r${1 + n.reportHistory.filter((x) => x.date === r.date && x.kind === r.kind).length}`,
            ]),
          )}
        />
      </section>
      <BaselinePreview value={historical} onClose={() => setHistorical(null)} />
    </div>
  );
}
