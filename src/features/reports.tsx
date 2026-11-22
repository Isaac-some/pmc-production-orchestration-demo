/** GUI reference: test platform report table, period controls, followup layout and immutable archives. */
import React, { useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  ColumnWidthOutlined,
  EllipsisOutlined,
  ExpandOutlined,
  FontSizeOutlined,
  HistoryOutlined,
  SaveOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";

import { usePMC } from "../api";
import { day, stageNames } from "../../shared/types";
import {
  reportRows,
  reportPeriod,
  filteredReportRows,
  reportColumnTitles,
  reportExportTable,
  reportFollowups,
  reportFollowupTime,
} from "../../shared/reports";
import { riskBusinessPath } from "../../shared/risk";
import "./reports.css";
export function ReportsPage({ history = false }: { history?: boolean }) {
  const { state, user, command } = usePMC(),
    navigate = useNavigate(),
    { message } = App.useApp(),
    [params] = useSearchParams();
  const [kind, setKind] = useState(
      params.get("kind") === "project" ? "project" : "opportunity",
    ),
    [period, setPeriod] = useState("week"),
    [range, setRange] = useState(reportPeriod("week", day())),
    [filters, setFilters] = useState<any>({ status: ["L1潜在商机", "L2活跃商机", "L3需求验证", "L4方案验证"] }),
    [expanded, setExpanded] = useState(false),
    [merged, setMerged] = useState(false),
    [font, setFont] = useState(14),
    [full, setFull] = useState(false),
    [archive, setArchive] = useState(false),
    [saving, setSaving] = useState(false),
    [archiveId, setArchiveId] = useState(params.get("id") || ""),
    [expandedCells, setExpandedCells] = useState<Record<string,boolean>>({});
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setFull(document.fullscreenElement === pageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const [form] = Form.useForm();
  const archives = state.settings.reportArchives || [],
    snapshot = archives.find((a: any) => a.id === archiveId) || archives[0],
    start = history ? snapshot?.start : range[0],
    end = history ? snapshot?.end : range[1];
  const rows = filteredReportRows(
    history ? snapshot?.rows || [] : reportRows(state),
    kind,
    history ? snapshot?.filters || {} : filters,
  );
  const people = state.users.map((u) => ({ value: u.id, label: u.name })),
    field = (key: string, v: any) => setFilters({ ...filters, [key]: v });
  const dateRange = (p: string) => {
    setPeriod(p);
    if (p !== "custom") setRange(reportPeriod(p, day()));
  };
  const follow = (b: any, which: "current" | "history" | "merged") => {
    const fs = reportFollowups(b, start, end, which);
    const key = b.id + ":" + which, isExpanded = expanded || expandedCells[key];
    if (!fs.length) return "暂无记录";
    return (
      <div className="report-followups">
        <ul className="report-timeline">{(isExpanded ? fs : fs.slice(0, 2)).map((f: any) => (
          <li className="report-followup" key={f.id}>
            <time>{reportFollowupTime(f.createdAt)}</time>
            <div className={!isExpanded ? "report-clamp-followup" : ""}>{f.text}</div>
          </li>
        ))}</ul>
        {!expanded && fs.length > 2 && (
          <Button
            type="link"
            aria-expanded={!!isExpanded}
            onClick={() => setExpandedCells({...expandedCells,[key]:!isExpanded})}
          >
            {isExpanded ? "收起" : `查看全部 ${fs.length} 条`}
          </Button>
        )}
      </div>
    );
  };
  const open = (b: any) => {
    if (history) return;
    navigate(riskBusinessPath(b, "workflow"));
  };
  const nameColumn = {
    title: "项目名称",
    width: 244,
    render: (_: any, b: any) => (
      <>
        {history ? <span>{b.name}</span> : <Button
          type="link"
          className="report-business-name"
          disabled={history}
          onClick={() => open(b)}
        >
          {b.name}
        </Button>}
        <div className="report-code">
          {kind === "project" ? b.pid : b.crmId || b.pid}
        </div>
      </>
    ),
  };
  const followColumns = merged
    ? [
        {
          title: "跟进记录",
          width: 440,
          render: (_: any, b: any) => follow(b, "merged"),
        },
      ]
    : [
        {
          title: "区间内跟进",
          className: "report-current",
          width: 320,
          render: (_: any, b: any) => follow(b, "current"),
        },
        {
          title: "历史跟进",
          className:"report-history",
          width: 320,
          render: (_: any, b: any) => follow(b, "history"),
        },
      ];
  const projectColumns = [
    nameColumn,
    { title: "DDL", dataIndex: "deadline", width: 122, className:"report-nowrap" },
    {
      title: "数据类型",
      width: 100,
      render: (_: any, b: any) => b.dataTypes.join("、"),
    },
    { title: "项目经理", dataIndex: "ownerName", width: 100, className:"report-nowrap" },
    ...followColumns,
  ];
  const opportunityColumns = [
    {
      title: "提报日期",
      width: 122,
      render: (_: any, b: any) => b.createdAt.slice(0, 10),
    },
    {
      title: "区域",
      width: 96,
      render: (_: any, b: any) => b.common.region || "—",
    },
    { title: "售前", dataIndex: "presalesName", width: 88 },
    {
      title: "素材类型",
      width: 100,
      render: (_: any, b: any) => b.dataTypes.join("、"),
    },
    { title: "销售", dataIndex: "salesName", width: 88 },
    nameColumn,
    { title: "需求 brief", dataIndex: "description", width: 280, render:(v:any) => <div className={expanded ? "report-brief" : "report-clamp-brief"}>{v || "—"}</div> },
    ...followColumns,
    {
      title: "承诺/争取",
      width: 100,
      render: (_: any, b: any) => b.common.commitment || "—",
    },
    {
      title: "需求量级",
      width: 100,
      render: (_: any, b: any) => b.target ?? "—",
    },
    { title: "进展状态", dataIndex: "stageLabel", width: 110 },
  ];
  const projectEligible = rows.filter((b) =>
    ["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY", "CUSTOMER_ACCEPTANCE"].includes(
      b.stage,
    ),
  );
  const groups =
    kind === "opportunity"
      ? [{ title: "商机", rows }]
      : [
          {
            title: "交付中 · 风险项目",
            rows: projectEligible.filter(
              (b) => b.stage !== "CUSTOMER_ACCEPTANCE" && b.riskLevel,
            ),
          },
          {
            title: "交付中 · 无风险项目",
            rows: projectEligible.filter(
              (b) =>
                b.stage !== "CUSTOMER_ACCEPTANCE" &&
                !b.riskLevel &&
                ["NONE", "无风险"].includes(
                  b.common.deliveryRisk || b.common.riskLevel,
                ),
            ),
          },
          {
            title: "交付中 · 风险未记录",
            rows: projectEligible.filter(
              (b) =>
                b.stage !== "CUSTOMER_ACCEPTANCE" &&
                !b.riskLevel &&
                !["NONE", "无风险"].includes(
                  b.common.deliveryRisk || b.common.riskLevel,
                ),
            ),
          },
          {
            title: "验收中 · 风险项目",
            rows: projectEligible.filter(
              (b) => b.stage === "CUSTOMER_ACCEPTANCE" && b.riskLevel,
            ),
          },
          {
            title: "待验收",
            rows: projectEligible.filter(
              (b) => b.stage === "CUSTOMER_ACCEPTANCE" && !b.riskLevel,
            ),
          },
        ];
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  async function csv(bs: any[], title: string, format: "csv" | "xlsx" = "csv") {
    const XLSX = await import("xlsx");
    const values = reportExportTable(bs, kind, { start, end, merged });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([values.headers, ...values.rows]),
      "报告",
    );
    XLSX.writeFile(wb, title + "_" + start + "." + format, {
      bookType: format,
    });
  }
  const tools = (
    <div className="reports-tools">
      <Dropdown
        menu={{
          items: [{type:"group",label:"字号",children:[
            { key: "12", label: "小" },
            { key: "14", label: "标准" },
            { key: "16", label: "大" },
            { key: "18", label: "特大" },
          ]}],
          selectedKeys:[String(font)],
          onClick: ({ key }) => setFont(Number(key)),
        }}
      >
        <Button aria-label="字号" icon={<FontSizeOutlined />} />
      </Dropdown>
      <Button
        aria-label="全屏"
        icon={<ExpandOutlined />}
        onClick={async () => {
          if(document.fullscreenElement) await document.exitFullscreen();
          else if(full) setFull(false);
          else { try { await pageRef.current?.requestFullscreen(); } catch { setFull(true); } }
        }}
      />
    </div>
  );
  const tableGroup = (g: any) => (
    <section className={"reports-section" + (!g.rows.length ? " reports-empty" : "")} key={g.title} aria-label={g.title}>
      <div className="reports-section-title">
        {kind === "project" && (
          <h2>
            {g.title}
            {!!g.rows.length && <small>{" " + g.rows.length + " 项"}</small>}
          </h2>
        )}
        {kind === "opportunity" && (
          <>
            <span>{g.rows.length} 项</span>
            <Button size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? "收起全部" : "展开全部"}
            </Button>
          </>
        )}
        {!!g.rows.length && (
          <div className="reports-section-tools">
            <Space.Compact>
              <Tooltip title="分栏显示跟进记录">
                <Button
                  type={!merged ? "primary" : "default"}
                  aria-label="分栏显示跟进记录"
                  onClick={() => setMerged(false)}
                  icon={<ColumnWidthOutlined />}
                />
              </Tooltip>
              <Tooltip title="合并显示跟进记录">
                <Button
                  type={merged ? "primary" : "default"}
                  aria-label="合并显示跟进记录"
                  onClick={() => setMerged(true)}
                  icon={<UnorderedListOutlined />}
                />
              </Tooltip>
            </Space.Compact>
            <Space.Compact><Button onClick={() => csv(g.rows, g.title)}>
              导出 CSV
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: "xlsx", label: "Excel (.xlsx)" },
                  { key: "pdf", label: "PDF (.pdf)" },
                ],
                onClick: ({ key }) =>
                  key === "xlsx"
                    ? csv(g.rows, g.title, "xlsx")
                    : window.print(),
              }}
            >
              <Button icon={<EllipsisOutlined />} />
            </Dropdown>
            </Space.Compact>
          </div>
        )}
      </div>
      {g.rows.length ? (
        <Table
          size="small"
          rowKey="id"
          columns={(kind === "project"
            ? projectColumns
            : opportunityColumns
          ).map((column, i) => ({
            ...column,
            title: reportColumnTitles(kind, merged)[i],
          }))}
          dataSource={g.rows}
          scroll={{
            x:
              kind === "project"
                ? merged
                  ? 1006
                  : 1206
                : merged
                  ? 1768
                  : 1968,
          }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
      )}
    </section>
  );
  const content = (
    <>
      <div className="reports-toolbar"><Segmented className="reports-kind"
        value={kind}
        onChange={(v) => setKind(String(v))}
        options={[
          { value: "opportunity", label: "商机" },
          { value: "project", label: "项目" },
        ]}
      />
      {history && snapshot?.note && <span className="reports-note">{snapshot.note}</span>}</div>
      {kind === "project" && (
        <div className="reports-summary">
          共 {count} 项
          <Button size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起全部" : "展开全部"}
          </Button>
        </div>
      )}
      {groups.map(tableGroup)}
    </>
  );
  return (
    <div
      className={"pmc-reports" + (history ? " reports-archive-page" : "") + (full ? " fullscreen" : "")}
      ref={pageRef}
      style={{ "--report-font": font + "px" } as React.CSSProperties}
    >
      {history ? (
        <>
          <div className="reports-history-top">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/reports")}
            >
              返回报表
            </Button>
            {tools}
          </div>
          <div className="reports-history">
            <aside className="reports-directory">
              <h2>归档目录</h2>
              <div className="reports-archive-list">{archives.length ? (
                archives.map((a: any) => (
                  <button
                    key={a.id}
                    className={snapshot?.id === a.id ? "selected" : ""}
                    onClick={() => {
                      setArchiveId(a.id);
                      setKind(a.kind);
                    }}
                  >
                    {a.start} 至 {a.end}
                    <small>
                      V{a.version} · {a.actor}
                    </small>
                  </button>
                ))
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无归档"
                />
              )}
              </div>
            </aside>
            <div className="reports-history-content">
              {snapshot ? (
                content
              ) : (
                <Empty description="选择或归档报告后查看" />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="reports-toolbar">
            <div className="reports-criteria"><Segmented className="reports-kind"
              value={kind}
              onChange={(v) => {
                setKind(String(v));
                setFilters({ status: v === "project" ? [] : ["L1潜在商机", "L2活跃商机", "L3需求验证", "L4方案验证"] });
              }}
              options={[
                { value: "opportunity", label: "商机" },
                { value: "project", label: "项目" },
              ]}
            />
            <Space size={8}><Segmented
              value={period}
              onChange={(v) => dateRange(String(v))}
              options={[
                { label: "周", value: "week" },
                { label: "季度", value: "quarter" },
                { label: "自定义", value: "custom" },
              ]}
            />
            <DatePicker.RangePicker
              allowClear={false}
              value={[dayjs(range[0]), dayjs(range[1])]}
              onChange={(v) => {
                if (v?.[0] && v[1]) {
                  setRange([
                    v[0].format("YYYY-MM-DD"),
                    v[1].format("YYYY-MM-DD"),
                  ]);
                  setPeriod("custom");
                }
              }}
            />
            <small>不含截止日</small></Space></div>
            <div className="reports-tools">
              <Tooltip title="历史归档">
                <Button
                  aria-label="历史归档"
                  icon={<HistoryOutlined />}
                  onClick={() => navigate("/reports/history")}
                />
              </Tooltip>
              <Tooltip title="归档报告">
                <Button
                  aria-label="归档报告"
                  type="primary"
                  disabled={!["pm", "approver"].includes(user.role)}
                  icon={<SaveOutlined />}
                  onClick={() => {
                    form.resetFields();
                    setArchive(true);
                  }}
                />
              </Tooltip>
            </div>
            {tools}
          </div>
          <div className="reports-filter" aria-label="报表筛选">
            <Input
              prefix={<SearchOutlined />}
              allowClear
              placeholder="名称或编号"
              value={filters.search}
              onChange={(e) => field("search", e.target.value)}
            />
            {kind === "project" ? (
              <Select
                allowClear
                placeholder="数据类型"
                value={filters.dataType}
                options={[
                  ...new Set(state.businesses.flatMap((b) => b.dataTypes)),
                ].map((value) => ({ value, label: value }))}
                onChange={(v) => field("dataType", v)}
              />
            ) : null}
            <Select
              allowClear
              placeholder={kind === "project" ? "项目经理" : "售前"}
              value={filters.person}
              options={people}
              onChange={(v) => field("person", v)}
            />
            {kind === "opportunity" && (
              <>
                <Select
                  className="reports-crm-select"
                  mode="multiple"
                  maxTagCount={2}
                  placeholder="销售易状态"
                  value={filters.status}
                  options={[
                    "L1潜在商机",
                    "L2活跃商机",
                    "L3需求验证",
                    "L4方案验证",
                    "L5商务谈判",
                    "赢单",
                    "输单",
                  ].map((value) => ({ value, label: value }))}
                  onChange={(v) => field("status", v)}
                />
                <Select
                  allowClear
                  placeholder="销售"
                  value={filters.sales}
                  options={people}
                  onChange={(v) => field("sales", v)}
                />
              </>
            )}
            <Button onClick={() => setFilters({ status: [] })}>清空筛选</Button>
          </div>
          {kind === "project" && (
            <div className="reports-summary">
              共 {count} 项
              <Button size="small" onClick={() => setExpanded(!expanded)}>
                {expanded ? "收起全部" : "展开全部"}
              </Button>
            </div>
          )}
          {groups.map(tableGroup)}
        </>
      )}
      <Modal
        className="reports-archive-modal"
        title="归档报告"
        okText="确认归档"
        open={archive}
        confirmLoading={saving}
        onCancel={() => setArchive(false)}
        onOk={async () => {
          const v = await form.validateFields();
          setSaving(true);
          try {
            await command("reports.archive", {
              ...v,
              kind,
              start: range[0],
              end: range[1],
              filters,
            });
            setArchive(false);
            message.success("报告已归档至本地");
          } finally {
            setSaving(false);
          }
        }}
      >
        <p>
          {range[0]} 至 {range[1]}（不含截止日）。归档包含完整商机和项目报表。
        </p>
        <Form form={form} layout="vertical">
          <Form.Item name="note" style={{marginBottom:0}}>
            <Input.TextArea rows={2} maxLength={4000} placeholder="归档备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
