import React, { useState } from "react";
import { Button, Empty, Table, Tag } from "antd";
import { ArrowRightOutlined, DownOutlined, WarningOutlined } from "@ant-design/icons";
import { type Chain, type ProductionData, type ProductionVersion, money, processUnitCapacity } from "../../../shared/production";
import { flowQuantity } from "../../../shared/pull-flow";
import { day } from "../../../shared/types";
import { deliveryForecast, nodeMeasure, quantity, type ExperienceSignal } from "./experience-model";

export function CanvasSummary({ p, chain, version: v }: { p: ProductionData; chain: Chain; version: ProductionVersion }) {
  const final = nodeMeasure(p, chain.id, v, v.output);
  const forecast = deliveryForecast(p, chain.id, v, v.target, v.deadline);
  const platforms = v.nodes.filter(n => n.kind !== "router");
  const results = [...new Map(platforms.flatMap(n => n.flowResults || []).map(r => [r.id, r])).values()];
  const cost = results.length && results.every(r => r.cost != null) ? results.reduce((s, r) => s + r.cost!, 0) : null;
  const today = v.nodes.find(n => n.id === v.output)?.flowResults?.filter(r => r.date === day()) || [];
  const days = Math.ceil((Date.parse(v.deadline) - Date.parse(day())) / 86400000) + 1;
  const requiredDaily = Number.isFinite(days) && days > 0 ? Math.max(0, v.target - (final.output || 0)) / days : null;
  return <div className="canvas-summary" aria-label="当前链路生产摘要">
    <div><span>交付候选 / 链路目标</span><strong>{final.known ? quantity(final.output) : "待回传"}<small> / {quantity(v.target)} {v.nodes.find(n => n.id === v.output)?.flowUnit || "份"}</small></strong><p>候选产出，正式交付另行登记</p></div>
    <div><span>今日候选产出</span><strong>{today.length ? quantity(flowQuantity(today)) : "待回传"}<small> / 日需求 {quantity(requiredDaily)}</small></strong><p>截止 {v.deadline || "未设置"}</p></div>
    <div><span>计划日供给 / 预计缺口</span><strong>{quantity(forecast.dailyCapacity)}<small> / {quantity(forecast.gap)}</small></strong><p>{forecast.issues.length ? "测算依据待补全" : "按已填写产能与库存测算"}</p></div>
    <div><span>已登记成本 / 链路预算</span><strong>{money(cost)}<small> / {money(v.budgetSnapshot)}</small></strong><p>平台事实去重，缓冲池不重复计费</p></div>
  </div>;
}

export function CanvasLedger({ p, chain, version: v, signals, onSelect, onIssue }: {
  p: ProductionData; chain: Chain; version: ProductionVersion; signals: ExperienceSignal[];
  onSelect: (id: string) => void; onIssue: (s: ExperienceSignal) => void;
}) {
  const [tab, setTab] = useState("");
  const events = [
    ...v.nodes.flatMap(n => (n.flowResults || []).map(r => ({ id: `result:${n.id}:${r.id}`, at: r.at, title: `${n.title} · 产出登记`, detail: `${r.externalId} · ${quantity(r.quantity ?? 1)} ${r.unit}`, nodeId: n.id }))),
    ...(p.pullReceipts || []).filter(r => r.chainId === chain.id).map(r => ({ id: `receipt:${r.id}`, at: r.at, title: "已领取上游数据", detail: `${v.nodes.find(n => n.id === r.from)?.title || r.from} → ${v.nodes.find(n => n.id === r.to)?.title || r.to} · 凭证 ${r.id}`, nodeId: r.to })),
    ...(p.flowDispositions || []).filter(r => r.chainId === chain.id).map(r => ({ id: `disposition:${r.id}`, at: r.at, title: r.action === "recover" ? "标记回捞候选" : "登记丢弃", detail: r.reason, nodeId: r.nodeId })),
    ...v.nodes.filter(n => n.retiredAt).map(n => ({ id: `retired:${n.id}`, at: n.retiredAt!, title: `${n.title} · 路线退场`, detail: n.retirementReason || "保留历史事实", nodeId: n.id })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return <section className={`canvas-ledger ${tab ? "is-open" : ""}`}>
    <nav aria-label="画布数据明细"><div>{[["nodes", "节点明细", v.nodes.length], ["issues", "待处理", signals.length], ["history", "流转记录", events.length]].map(([key, label, count]) => <button key={key} aria-expanded={tab === key} onClick={() => setTab(tab === key ? "" : String(key))}>{label}<b>{count}</b></button>)}</div><button aria-label={tab ? "收起画布明细" : "展开画布明细"} onClick={() => setTab(tab ? "" : "nodes")}><DownOutlined rotate={tab ? 180 : 0} /></button></nav>
    {tab === "nodes" && <Table size="small" rowKey="id" pagination={false} scroll={{ x: 1000, y: 220 }} dataSource={v.nodes} columns={[
      { title: "节点 / 产物", width: 220, render: (_, n) => <Button type="link" onClick={() => onSelect(n.id)}>{n.title}</Button> },
      { title: "关联项目与范围", width: 200, render: (_, n) => n.kind === "router" ? "上游产出引用" : n.platformRef || "待关联" },
      { title: "投入", render: (_, n) => v.edges.some(e => e.to === n.id) ? quantity(nodeMeasure(p, chain.id, v, n.id).input) : "源头" },
      { title: "累计输出", render: (_, n) => { const m = nodeMeasure(p, chain.id, v, n.id); return m.known ? `${quantity(m.output)} ${n.flowUnit}` : "待回传"; } },
      { title: "未被领取", render: (_, n) => quantity(nodeMeasure(p, chain.id, v, n.id).remaining) },
      { title: "计划日产", render: (_, n) => quantity(n.dailyPlan) },
      { title: "成本", render: (_, n) => n.kind === "router" ? "不重复计入" : money(nodeMeasure(p, chain.id, v, n.id).cost) },
    ]} />}
    {tab === "issues" && <div className="canvas-ledger-events">{signals.length ? signals.map(s => <button key={s.key} onClick={() => s.nodeId ? onSelect(s.nodeId) : onIssue(s)}><WarningOutlined /><span><strong>{s.title}</strong><small>{s.detail} · {s.impact}</small></span><ArrowRightOutlined /></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已识别问题" />}</div>}
    {tab === "history" && <div className="canvas-ledger-events">{events.length ? events.map(e => <button key={e.id} onClick={() => onSelect(e.nodeId)}><time>{e.at.slice(0, 16).replace("T", " ")}</time><span><strong>{e.title}</strong><small>{e.detail}</small></span><ArrowRightOutlined /></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无流转事实" />}</div>}
  </section>;
}

export function CanvasLineage({ p, chain, version: v, nodeId, onSelect }: {
  p: ProductionData; chain: Chain; version: ProductionVersion; nodeId: string; onSelect: (id: string) => void;
}) {
  const n = v.nodes.find(n => n.id === nodeId);
  if (!n) return null;
  const receipts = (p.pullReceipts || []).filter(r => r.chainId === chain.id && r.to === nodeId);
  return <div className="canvas-lineage">
    <h4>这批数据从哪里来</h4>
    <p>已领取凭证保存当时的来源、范围与规则。后续调整不会改写已有事实。</p>
    {receipts.length ? receipts.map(r => <details key={r.id} className="canvas-lineage-item"><summary><Tag>领取</Tag>{v.nodes.find(n => n.id === r.from)?.title || r.from}<small>{r.at.slice(0, 10)}</small></summary><dl><dt>凭证</dt><dd>{r.id}</dd><dt>规则快照</dt><dd>{r.rules.length ? r.rules.map(x => `${x.field} ${x.operator} ${String(x.value)}`).join("；") : "无字段筛选"}</dd><dt>来源标识</dt><dd>{r.results.map(x => x.externalId).join("、")}</dd></dl><Button size="small" onClick={() => onSelect(r.from)}>查看上游节点</Button></details>) : <div className="canvas-lineage-empty">{v.edges.some(e => e.to === nodeId) ? "尚无已领取记录，连线本身不代表已传输。" : "输入源头：原始文件保留在关联上游平台。"}</div>}
    <h4>输出与处理后的结构</h4>
    {(n.flowResults || []).length ? n.flowResults!.map(r => <details className="canvas-lineage-item" key={r.id}><summary><Tag>{r.unit}</Tag>{r.externalId}<small>{quantity(r.quantity ?? 1)}</small></summary><dl><dt>关联项目</dt><dd>{r.platformRef || "待关联"}</dd><dt>批次</dt><dd>{r.externalBatchId || "未登记"}</dd><dt>源结果标识</dt><dd>{r.sourceIds.join("、") || "源头登记"}</dd><dt>领取凭证</dt><dd>{r.receiptId || "无"}</dd><dt>登记时间</dt><dd>{r.at}</dd></dl><pre>{JSON.stringify(r.fields, null, 2)}</pre></details>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无输出引用" />}
    <p>这里展示平台回传的引用与字段。原始CSV下载及媒体预览需要上游平台接口，不能凭引用还原文件内容。</p>
    {!!v.processUnits?.some(u => u.nodeIds.includes(nodeId)) && <p>所属环节：{v.processUnits.filter(u => u.nodeIds.includes(nodeId)).map(u => `${u.name}（计划${quantity(processUnitCapacity(u).dailyOutput)} ${u.outputUnit}/天）`).join("、")}</p>}
  </div>;
}
