/** Workspace pages observed from the deployed test GUI, backed by local mock facts. */
import React, { useState } from "react";
import {
  Button,
  Card,
  Empty,
  Input,
  Popover,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  RiseOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { usePMC } from "../api";
import { stageNames, day, addDays, type Business } from "../../shared/types";
import { displayProjectRisk } from "../../shared/reports";
import { currentBlockers } from "../../shared/process";
import "./workspace-parity.css";
import { workspacePeriodStart } from "../../shared/workspace";
const link = (b: Business) =>
  `/${b.kind === "project" ? "projects" : "opportunities"}?detail=${b.id}&pid=${b.pid}`;
function useWorkItems() {
  const { state, user } = usePMC();
  return state.businesses
    .filter((b) =>
      [b.ownerId, b.salesId, b.presalesId, b.developerId].includes(user.id),
    )
    .map((b) => {
      const riskLevel = displayProjectRisk(state, b),
        overdue = !b.completed && !!b.deadline && b.deadline < day(),
        near = !b.completed && b.deadline >= day() && b.deadline <= addDays(7),
        stale =
          !b.completed &&
          Date.parse(day()) - Date.parse(b.updatedAt.slice(0, 10)) >= 7 * 864e5;
      return {
        ...b,
        overdue,
        near,
        stale,
        riskLevel,
        risky: !!riskLevel,
        signals: [
          ...(overdue ? ["逾期"] : []),
          ...(riskLevel ? ["风险"] : []),
          ...(near ? ["临期"] : []),
          ...(stale ? ["待跟进"] : []),
        ],
      };
    });
}
export function MemberDashboard() {
  const { state, user } = usePMC(),
    navigate = useNavigate(),
    items = useWorkItems(),
    [period, setPeriod] = useState("近30天"),
    [tab, setTab] = useState("progress"),
    [kind, setKind] = useState(""),
    [signal, setSignal] = useState(""),
    [query, setQuery] = useState("");
  const active = items.filter((b) => !b.completed && b.stage !== "LOST"),
    need = active.filter((b) => b.signals.length),
    due = active.filter((b) => b.near),
    risk = active.filter((b) => b.risky || b.overdue),
    mine = state.tasks.filter(
      (t) => t.owners.includes(user.id) && t.status !== "已完成",
    ),
    cutoff = workspacePeriodStart(period),
    done = items.filter(
      (b) => b.completed && (!cutoff || b.updatedAt.slice(0, 10) >= cutoff),
    );
  const rows = items.filter(
    (b) =>
      (tab === "owned"
        ? b.ownerId === user.id
        : tab === "participating"
          ? b.ownerId !== user.id
          : !b.completed && b.signals.length) &&
      (!kind || b.kind === kind) &&
      (!signal ||
        (signal === "risk-overdue"
          ? b.risky || b.overdue
          : signal === "overdue"
            ? b.overdue
            : signal === "risk"
              ? b.risky
              : signal === "near"
                ? b.near
                : b.stale)) &&
      (!query ||
        (b.name + " " + b.pid).toLowerCase().includes(query.toLowerCase())),
  );
  const stats = [
    {
      label: "待推进事项",
      value: need.length,
      desc: "逾期、风险、临期与久未更新",
      icon: <ClockCircleOutlined />,
      tone: "blue",
    },
    {
      label: "进行中商机",
      value: active.filter((b) => b.kind === "opportunity").length,
      desc: "当前仍需我负责或协同",
      icon: <RiseOutlined />,
      tone: "blue",
    },
    {
      label: "进行中项目",
      value: active.filter((b) => b.kind === "project").length,
      desc: `覆盖 ${new Set(active.filter((b) => b.kind === "project").map((b) => b.stage)).size} 个当前节点`,
      icon: <ProjectOutlined />,
      tone: "blue",
    },
    {
      label: "7日内到期",
      value: due.length,
      desc: "需确认交付准备情况",
      icon: <ExclamationCircleOutlined />,
      tone: "gold",
    },
    {
      label: "风险与逾期",
      value: risk.length,
      desc: (
        <Button type="link" onClick={() => setSignal("risk-overdue")}>
          查看风险与逾期
        </Button>
      ),
      icon: <WarningOutlined />,
      tone: "red",
    },
    {
      label: "本期完成",
      value: done.length,
      desc: `交付 ${items.filter((b) => b.history.some((h) => h.action.includes("交付") && (!cutoff || h.at.slice(0, 10) >= cutoff))).length} · 验收 ${items.filter((b) => b.history.some((h) => h.action.includes("验收") && (!cutoff || h.at.slice(0, 10) >= cutoff))).length} · 结项 ${done.length}`,
      icon: <FileDoneOutlined />,
      tone: "green",
    },
  ];
  return (
    <div className="workspace-parity">
      <div className="workspace-scope">
        <div className="workspace-scope-group">
          <span>数据范围</span>
          <strong>我当前负责与协同的商机、项目</strong>
        </div>
        <div className="workspace-scope-group">
          <span>统计周期</span>
          <Segmented
            size="small"
            value={period}
            onChange={(v) => setPeriod(String(v))}
            options={["本周", "近30天", "全部"]}
          />
        </div>
      </div>
      <div className="workspace-section-heading">
        <h2>工作概览</h2>
        <span>先看今天需要关注什么</span>
      </div>
      <div className="workspace-stats">
        {stats.map((s) => (
          <div key={s.label} className={"workspace-stat tone-" + s.tone}>
            <div className="workspace-stat-top">
              <span>{s.label}</span>
              {s.icon}
            </div>
            <b>{s.value}</b>
            <small>{s.desc}</small>
          </div>
        ))}
      </div>
      <div className="workspace-main">
        <section className="workspace-panel">
          <h2>我的事项</h2>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "progress", label: "待我推进" },
              { key: "owned", label: "我负责的" },
              { key: "participating", label: "我参与的" },
            ]}
          />
          <Space wrap className="workspace-item-filters">
            <Select
              aria-label="事项类型"
              value={kind || undefined}
              placeholder="全部类型"
              allowClear
              onChange={(v) => setKind(v || "")}
              style={{ width: 115 }}
              options={[
                { value: "project", label: "项目" },
                { value: "opportunity", label: "商机" },
              ]}
            />
            <Select
              aria-label="关注信号"
              value={signal || undefined}
              placeholder="全部关注信号"
              allowClear
              onChange={(v) => setSignal(v || "")}
              style={{ width: 126 }}
              options={[
                { value: "risk-overdue", label: "风险与逾期" },
                { value: "overdue", label: "逾期" },
                { value: "risk", label: "风险" },
                { value: "near", label: "临期" },
                { value: "stale", label: "待跟进" },
              ]}
            />
            <Input
              aria-label="搜索事项"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称或 PID"
              style={{ width: 210 }}
            />
          </Space>
          <Table<any>
            className="workspace-priority-table"
            size="small"
            rowKey="id"
            pagination={{ pageSize: 8 }}
            dataSource={rows}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无符合条件的事项"
                />
              ),
            }}
            columns={[
              {
                title: "业务对象",
                render: (_, b) => (
                  <>
                    <a onClick={() => navigate(link(b))}>{b.name}</a>
                    <div className="workspace-muted">
                      {b.kind === "project" ? "项目" : "商机"} · PID {b.pid}
                    </div>
                  </>
                ),
              },
              { title: "当前节点", render: (_, b) => stageNames[b.stage] },
              {
                title: "需要关注",
                render: (_, b) =>
                  b.signals.length
                    ? b.signals.map((x) => (
                        <Tag key={x} color={x === "逾期" ? "red" : "gold"}>
                          {x}
                        </Tag>
                      ))
                    : "—",
              },
              { title: "截止时间", dataIndex: "deadline" },
              {
                title: "操作",
                render: (_, b) => (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate(link(b))}
                  >
                    去处理
                  </Button>
                ),
              },
            ]}
          />
        </section>
        <section className="workspace-panel workspace-todo-panel">
          <h2>我的待办</h2>
          <div className="workspace-all-tasks">
            <Button type="link" onClick={() => navigate("/tasks")}>
              查看全部待办 <ArrowRightOutlined />
            </Button>
          </div>
          {mine.length ? (
            mine.slice(0, 5).map((t) => (
              <div className="workspace-todo" key={t.id}>
                <a onClick={() => navigate("/tasks")}>{t.title}</a>
                <p>
                  {state.businesses.find((b) => b.id === t.businessId)?.name}
                </p>
                <small>{t.due || "未安排截止时间"}</small>
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无待处理的跟进待办"
            />
          )}
        </section>
      </div>
    </div>
  );
}
export function WorkspaceTasksPage() {
  const { state, user, command } = usePMC(),
    navigate = useNavigate(),
    location = useLocation(),
    [tab, setTab] = useState(location.hash.slice(1) || "pending"),
    [source, setSource] = useState(""),
    [kind, setKind] = useState(""),
    [due, setDue] = useState("all"),
    [stage, setStage] = useState("");
  const items = useWorkItems(),
    progress = items.filter(
      (b) => !b.completed && b.stage !== "LOST" && b.ownerId === user.id,
    ),
    isMine = (t: any) =>
      t.owners.includes(user.id) ||
      state.notifications.some(
        (n) => n.userId === user.id && n.taskId === t.id,
      ) ||
      t.subtasks.some((x) => x.ownerId === user.id && !x.done),
    tasks = state.tasks
      .filter((t) =>
        tab === "sent"
          ? t.history.some(
              (h) => h.action.includes("创建") && h.actor === user.name,
            )
          : tab === "completed"
            ? t.status === "已完成" && isMine(t)
            : t.status !== "已完成" && isMine(t),
      )
      .filter((t) => {
        const b = state.businesses.find((b) => b.id === t.businessId);
        return (
          !!b &&
          (!kind || b.kind === kind) &&
          (!source || (source === "followup" ? !!t.followupId : !t.followupId))
        );
      });
  const counts = {
      all: progress.length,
      overdue: progress.filter((b) => b.deadline && b.deadline < day()).length,
      near: progress.filter(
        (b) => b.deadline >= day() && b.deadline <= addDays(7),
      ).length,
      none: progress.filter((b) => !b.deadline).length,
    },
    progressRows = progress.filter(
      (b) =>
        (!kind || b.kind === kind) &&
        (!stage || b.stage === stage) &&
        (due === "all" ||
          (due === "overdue" && b.deadline && b.deadline < day()) ||
          (due === "near" && b.deadline >= day() && b.deadline <= addDays(7)) ||
          (due === "none" && !b.deadline)),
    );
  const open = (t: any) => {
    command("task.read", { taskId: t.id }).catch(() => {});
    const b = state.businesses.find((b) => b.id === t.businessId)!;
    navigate(link(b) + "&tab=tasks&task=" + t.id);
  };
  const kindFilter = (
    <Select
      aria-label={tab === "progress" ? "事项类型" : "关联对象"}
      style={{ width: 98 }}
      placeholder={tab === "progress" ? "全部类型" : "全部对象"}
      value={kind || undefined}
      allowClear
      onChange={(v) => setKind(v || "")}
      options={[
        { value: "project", label: "项目" },
        { value: "opportunity", label: "商机" },
      ]}
    />
  );
  return (
    <section className="tasks-parity">
      <Tabs
        activeKey={tab}
        onChange={(v) => {
          setTab(v);
          navigate("/tasks" + (v === "pending" ? "" : "#" + v), {
            replace: true,
          });
        }}
        tabBarExtraContent={
          <Space>
            <Button
              type="link"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/member-dashboard")}
            >
              返回我的工作台
            </Button>
            <Popover
              trigger="click"
              placement="bottomRight"
              content={
                <Space direction="vertical">
                  <Button
                    type="text"
                    onClick={() => navigate("/tasks?view=risks")}
                  >
                    项目风险台账
                  </Button>
                  <Button
                    type="text"
                    onClick={() =>
                      command("task.read", { all: true }).catch(() => {})
                    }
                  >
                    全部标为已读
                  </Button>
                </Space>
              }
            >
              <Button type="text">更多</Button>
            </Popover>
          </Space>
        }
        items={[
          { key: "pending", label: "待处理跟进" },
          { key: "progress", label: "待我推进" },
          { key: "completed", label: "已完成跟进" },
          { key: "sent", label: "我发出的" },
        ]}
      />
      {tab === "progress" ? (
        <>
          <Space wrap className="tasks-filters tasks-progress-toolbar">
            <span>截止状态</span>
            <Segmented
              value={due}
              onChange={(v) => setDue(String(v))}
              options={[
                { value: "all", label: "全部 " + counts.all },
                { value: "overdue", label: "已逾期 " + counts.overdue },
                { value: "near", label: "7 日内 " + counts.near },
                { value: "none", label: "待安排 " + counts.none },
              ]}
            />
            <span className="tasks-secondary-start">事项类型</span>
            {kindFilter}
            <span>当前节点</span>
            <Select
              aria-label="当前节点"
              allowClear
              style={{ width: 150 }}
              placeholder="全部节点"
              value={stage || undefined}
              onChange={(v) => setStage(v || "")}
              options={[...new Set(progress.map((b) => b.stage))].map(
                (value) => ({ value, label: stageNames[value] }),
              )}
            />
          </Space>
          <Table<any>
            className="tasks-progress-table"
            rowKey="id"
            dataSource={progressRows}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无待推进事项"
                />
              ),
            }}
            columns={[
              { title: "名称", dataIndex: "name" },
              {
                title: "类型",
                render: (_, b) => (b.kind === "project" ? "项目" : "商机"),
              },
              { title: "PID", dataIndex: "pid" },
              {
                title: (
                  <span className="tasks-column-title">
                    当前节点
                    <Tooltip title="该事项当前所在的业务流程节点。">
                      <button
                        type="button"
                        className="tasks-column-help"
                        aria-label="当前节点说明"
                      >
                        <QuestionCircleOutlined />
                      </button>
                    </Tooltip>
                  </span>
                ),
                render: (_, b) => stageNames[b.stage],
              },
              {
                title: (
                  <span className="tasks-column-title">
                    截止时间
                    <Tooltip title="按自然日区分已逾期、未来 7 日内到期、正常和待安排。">
                      <button
                        type="button"
                        className="tasks-column-help"
                        aria-label="截止时间说明"
                      >
                        <QuestionCircleOutlined />
                      </button>
                    </Tooltip>
                  </span>
                ),
                dataIndex: "deadline",
              },
              {
                title: "操作",
                render: (_, b) => (
                  <Button type="link" onClick={() => navigate(link(b))}>
                    去提交
                  </Button>
                ),
              },
            ]}
          />
        </>
      ) : (
        <div className="tasks-followup-panel">
          <Space className="tasks-filters">
            <Select
              aria-label="待办来源"
              style={{ width: 98 }}
              placeholder="全部来源"
              value={source || undefined}
              allowClear
              onChange={(v) => setSource(v || "")}
              options={[
                { value: "followup", label: "跟进记录" },
                { value: "manual", label: "手动创建" },
              ]}
            />
            {kindFilter}
          </Space>
          {tasks.length ? (
            <div className="tasks-cards">
              {tasks.map((t) => {
                const b = state.businesses.find((b) => b.id === t.businessId)!;
                return (
                  <Card
                    key={t.id}
                    size="small"
                    title={<a onClick={() => open(t)}>{t.title}</a>}
                    extra={
                      <Tag color={t.status === "已完成" ? "green" : "blue"}>
                        {t.status}
                      </Tag>
                    }
                  >
                    <p>{t.description || "暂无描述"}</p>
                    <Space wrap>
                      <Tag>{t.followupId ? "跟进记录" : "手动创建"}</Tag>
                      <span>{b.name}</span>
                      {currentBlockers(t).length > 0 && (
                        <Tag color="orange"># 阻塞</Tag>
                      )}
                    </Space>
                    <div className="tasks-card-footer">
                      <span>截止：{t.due || "未安排"}</span>
                      <Button type="link" onClick={() => open(t)}>
                        查看待办 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="tasks-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  tab === "completed"
                    ? "暂无已完成待办"
                    : tab === "sent"
                      ? "暂无我发出的待办"
                      : "暂无待处理的跟进待办"
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
