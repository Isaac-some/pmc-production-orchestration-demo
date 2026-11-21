/** F09/F12: chain revision history, operation and production-budget audit. */
import React from "react";
import { Button } from "antd";
import { latest, money, type ProductionData } from "../../../shared/production";
import { ProductionTable, fmtProduction } from "./Baseline";
export function ProductionHistory({
  p,
  unit,
  cost,
  onChoose,
}: {
  p: ProductionData;
  unit: string;
  cost: number | null;
  onChoose: (chainId: string, versionId?: string) => void;
}) {
  const time = (s: string) => s?.slice(0, 19).replace("T", " ") || "—";
  const budgets = [
    ...p.budgetHistory.map((r) => ({ ...r, object: "项目生产总预算" })),
    ...p.chains.flatMap((c) =>
      c.budgetHistory.map((r) => ({ ...r, object: c.name })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const statuses: Record<string, string> = {
    DRAFT: "草稿",
    CONFIRMED: "待开始",
    RUNNING: "生产中",
    PAUSED: "已暂停",
  };
  return (
    <div className="production-history-page">
      <section className="production-section-card">
        <h3>生产链路与版本管理</h3>
        <p className="production-section-muted">
          A/B 是可独立并行的链路；R1/R2
          是同一链路的配置修订。历史在列表与版本下拉框查看，不平铺全部画布。
        </p>
        <ProductionTable
          headers={[
            "生产链路",
            "最新版",
            "版本交付目标",
            "状态",
            "节点数",
            "操作",
          ]}
          rows={p.chains.map((ch) => {
            const head = latest(ch);
            return [
              <>
                <strong>{ch.name}</strong>
                <details className="production-history-list">
                  <summary>{ch.versions.length} 个编排修订</summary>
                  {[...ch.versions].reverse().map((v) => (
                    <div key={v.id}>
                      <span>
                        R{v.revision}
                        <small>{time(v.createdAt)}</small>
                      </span>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => onChoose(ch.id, v.id)}
                      >
                        查看
                      </Button>
                    </div>
                  ))}
                </details>
              </>,
              `R${head.revision}`,
              `${fmtProduction(head.target)} ${unit}`,
              <span
                className={`production-version-pill ${head.status === "RUNNING" ? "running" : ""}`}
              >
                ● {ch.voided ? "已作废" : statuses[head.status]}
              </span>,
              head.nodes.length,
              <Button type="link" onClick={() => onChoose(ch.id)}>
                打开最新版
              </Button>,
            ];
          })}
        />
      </section>
      <section className="production-section-card">
        <h3>操作审计</h3>
        <ProductionTable
          headers={["时间", "链路 / 修订", "操作", "说明", "操作人"]}
          rows={p.audit.map((r) => [
            time(r.at),
            r.version || r.snapshot?.versionId || "—",
            r.action,
            r.detail || "—",
            r.actor,
          ])}
        />
      </section>
      <section className="production-section-card">
        <h3>生产预算记录</h3>
        <ProductionTable
          headers={["时间 / 对象", "金额变化", "原因", "操作人 / 通知"]}
          rows={budgets.map((r) => [
            <>
              {time(r.at)}
              <small>{r.object}</small>
            </>,
            `${r.before == null ? "未分配" : money(r.before)} → ${money(r.after)}`,
            r.reason || "首次填写",
            <>
              {r.actor}
              <small>未请求通知</small>
            </>,
          ])}
        />
      </section>
      <section className="production-section-card">
        <h3>统计与保留规则</h3>
        <p>
          新建 B 不继承 A 的任务和生产记录；修改 A
          时生成新修订，历史保留。项目剩余目标只抵扣已确认的客户验收量；同一输出任务跨修订只计一次。
        </p>
        <p>
          当前项目有效生产成本 {money(cost)}
          ；以已保存范围与正式回传统计，缺失成本保留待核算。
        </p>
      </section>
    </div>
  );
}
