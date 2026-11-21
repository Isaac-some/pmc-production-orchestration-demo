import React, { useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Descriptions,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from "antd";
import { NodeDialog } from "./NodeDialog";
import { ProductionTable } from "./Baseline";
import { usePMC } from "../../api";
import {
  platforms,
  grainNames,
  conditionFields,
  conditionOperators,
  operatorNames,
  statisticalUpstream,
  productionData,
  nodeDays,
  productionFacts,
  scopeKey,
  dynamicPlan,
  type ProductionNode,
  type ProductionVersion,
  type Chain,
  money,
} from "../../../shared/production";
import {
  DatabaseOutlined,
  RobotOutlined,
  TeamOutlined,
  DownOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { day } from "../../../shared/types";
/** The prototype exposes all node sections together, so facts stay visible while editing. */
function NodeSections({
  items,
}: {
  items: {
    key: string;
    label: React.ReactNode;
    disabled?: boolean;
    children: React.ReactNode;
  }[];
  activeKey?: string;
  onChange?: (key: string) => void;
}) {
  return (
    <div className="production-node-sections">
      {items
        .filter((i) => !i.disabled)
        .map((i) => (
          <details
            key={i.key}
            className={`production-node-section production-node-section-${i.key}`}
            open
          >
            <summary>
              <strong>{i.label}</strong>
              <QuestionCircleOutlined />
              <DownOutlined />
            </summary>
            <div>{i.children}</div>
          </details>
        ))}
    </div>
  );
}
export function NodeEditor({
  businessId,
  chain,
  version,
  node,
  onChange,
  onClose,
  disabled,
  configurationDirty,
  saveDraft,
  onPreview,
  onDelete,
}: {
  businessId: string;
  chain: Chain;
  version: ProductionVersion;
  node: ProductionNode;
  onChange: (v: ProductionVersion) => void;
  onClose: () => void;
  disabled: boolean;
  configurationDirty: boolean;
  saveDraft: (v: ProductionVersion) => Promise<any>;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const { modal: confirmation } = App.useApp();
  const { state, command } = usePMC(),
    p = productionData(state, businessId),
    [tab, setTab] = useState("settings"),
    [modal, setModal] = useState(""),
    [form] = Form.useForm(),
    [dimension, setDimension] = useState("day"),
    [search, setSearch] = useState(""),
    [ack, setAck] = useState(false),
    [deleteId, setDeleteId] = useState("");
  const [outputOpen, setOutputOpen] = useState(false),
    [outputSelection, setOutputSelection] = useState<string[]>([]),
    [outputNote, setOutputNote] = useState(""),
    [outputConfirmed, setOutputConfirmed] = useState(false),
    [batchView, setBatchView] = useState<any>(null);
  const closeOutput = () => {
    if (
      JSON.stringify(outputSelection) !== JSON.stringify(node.selected) ||
      outputNote !== node.note ||
      outputConfirmed !== node.finalConfirmed
    )
      confirmation.confirm({
        title: "放弃未保存修改？",
        content: "当前范围尚未保存。",
        okText: "放弃修改",
        cancelText: "继续编辑",
        onOk: () => setOutputOpen(false),
      });
    else setOutputOpen(false);
  };
  const openOutput = () => {
    setOutputSelection([...node.selected]);
    setOutputNote(node.note);
    setOutputConfirmed(node.finalConfirmed);
    setOutputOpen(true);
  };
  const final = version.output === node.id,
    task = p.tasks.find((t) => t.id === node.taskId),
    outs = version.edges.filter((e) => e.from === node.id),
    a = version.allocations[node.id] || {
      mode: "percent",
      values: {},
      conditions: {},
      confirmed: false,
    };
  const cmd = (action: string, v: any) =>
    command("production." + action, {
      businessId,
      chainId: chain.id,
      versionId: version.id,
      nodeId: node.id,
      ...v,
    });
  const change = (patch: Partial<ProductionNode>) =>
    onChange({
      ...version,
      nodes: version.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  const incoming = version.edges
    .filter((e) => e.to === node.id)
    .map((e) => version.nodes.find((n) => n.id === e.from)!);
  let days: any[] = nodeDays(node);
  if (dimension !== "day") {
    const groups = new Map<string, any>();
    for (const r of days) {
      const d = new Date(r.date + "T12:00:00Z"),
        key =
          dimension === "month"
            ? r.date.slice(0, 7)
            : r.date.slice(0, 7) +
              "-W" +
              Math.ceil(
                (d.getUTCDate() +
                  ((new Date(r.date.slice(0, 7) + "-01T12:00:00Z").getUTCDay() +
                    6) %
                    7)) /
                  7,
              );
      const old = groups.get(key) || {
        date: key,
        quantity: 0,
        platform: 0,
        cost: 0,
        corrected: null,
      };
      old.quantity =
        old.quantity == null || r.quantity == null
          ? null
          : old.quantity + r.quantity;
      old.platform =
        old.platform == null || r.platform == null
          ? null
          : old.platform + r.platform;
      old.cost = old.cost == null || r.cost == null ? null : old.cost + r.cost;
      groups.set(key, old);
    }
    days = [...groups.values()];
  }
  days = days
    .filter((r) =>
      r.date.replaceAll("-", "").includes(search.replaceAll("-", "")),
    )
    .reverse();
  const baseline = version.baseline?.rows.find((r) => r.nodeId === node.id);
  const fact = productionFacts(state, businessId).nodes.find(
    (n) =>
      n.chainId === chain.id &&
      n.id === node.id &&
      n.scopeKey === scopeKey(chain.id, node),
  );
  const validReports = node.reports.filter(
    (r) =>
      r.kind === "production" &&
      [...r.selected].sort().join("|") === [...node.selected].sort().join("|"),
  );
  const sumReport = (field: "input" | "processing" | "eliminated") =>
    validReports.length
      ? validReports.reduce((sum, r) => sum + r[field], 0)
      : null;
  const number = (value: number | null | undefined) =>
    value == null ? "待回传" : value.toLocaleString("zh-CN");
  const todayFacts = fact?.daily.find((r: any) => r.date === day());
  const todayOutput = todayFacts?.platform;
  const platformTotal = nodeDays(node).some((r) => r.platform != null)
    ? nodeDays(node).reduce((sum, r) => sum + (r.platform ?? 0), 0)
    : fact?.output;
  const liveMetrics = [
    ["输入", sumReport("input")],
    ["已输出", fact?.output],
    ["处理中", sumReport("processing")],
    ["已淘汰", sumReport("eliminated")],
    [
      "平台转化率",
      fact?.output != null && sumReport("input")
        ? ((fact.output / sumReport("input")!) * 100).toFixed(1) + "%"
        : "—",
    ],
  ];
  const planMetrics = [
    ["总输入需求", baseline?.totalInput],
    ["合格输出需求", baseline?.totalOutput],
    ["初始日计划", baseline?.dailyInput],
    ["今日动态目标", dynamicPlan(version, node, day())?.daily],
    [
      "基线转化率",
      baseline?.ratio != null ? (baseline.ratio * 100).toFixed(1) + "%" : "—",
    ],
  ];
  const edit = (kind: string, values: any = {}) => {
    form.resetFields();
    form.setFieldsValue({
      date: day(),
      kind: "production",
      processing: kind === "report" ? undefined : 0,
      eliminated: kind === "report" ? undefined : 0,
      costYuan: kind === "report" ? undefined : 0,
      selected: [...node.selected],
      ...values,
    });
    setModal(kind);
  };
  return (
    <Drawer
      title="编排节点详情"
      rootClassName="production-node-drawer"
      width={820}
      push={false}
      mask={false}
      keyboard={false}
      open
      onClose={onClose}
      maskClosable={false}
      footer={
        <div className="production-node-drawer-footer">
          <span>
            {configurationDirty
              ? "当前为草稿，录入日报和修正前请先发布编排"
              : "当前节点已与编排版本同步"}
          </span>
          <div>
            <Button onClick={onClose}>关闭</Button>
            <Button
              type="primary"
              disabled={disabled || !configurationDirty}
              onClick={() => saveDraft(version)}
            >
              保存当前节点
            </Button>
          </div>
        </div>
      }
    >
      <header className="production-node-detail-heading">
        <span className="production-node-detail-icon">
          {node.platform === "RESOURCE" ? (
            <DatabaseOutlined />
          ) : node.platform === "MANUAL_LABELING" ? (
            <TeamOutlined />
          ) : (
            <RobotOutlined />
          )}
        </span>
        <div>
          <small>
            {chain.name} · R{version.revision} · {platforms[node.platform]}
          </small>
          <h3>{node.title}</h3>
        </div>
        <Tag>
          {version.inputs.includes(node.id)
            ? "输入源头"
            : final
              ? "最终输出"
              : "中间节点"}
        </Tag>
        <Space className="production-node-title-actions">
          <Button type="link" size="small" onClick={onPreview}>
            查看全链路基线
          </Button>
          <Button
            type="text"
            size="small"
            danger
            disabled={disabled}
            onClick={onDelete}
          >
            删除节点
          </Button>
        </Space>
      </header>
      <section className="production-node-capacity">
        <h4>编排已选范围</h4>
        <div>
          <span>
            <small>
              累计产能 <QuestionCircleOutlined />
            </small>
            <strong>{number(platformTotal)}</strong>
            <small className="production-capacity-explainer">
              有效累计 {number(fact?.output)}
            </small>
          </span>
          <span>
            <small>实际成本</small>
            <strong>{money(fact?.cost)}</strong>
          </span>
          <span>
            <small>今日产出 / 日基线</small>
            <strong>
              {number(todayOutput)} / {number(baseline?.dailyOutput)}
            </strong>
            <small className="production-capacity-explainer">
              修正后{" "}
              {todayFacts?.corrected == null
                ? "跟随平台"
                : number(todayFacts.corrected)}{" "}
              · 有效 {number(todayFacts?.quantity)}
            </small>
          </span>
        </div>
      </section>
      <section className="production-node-live">
        {[
          ["生产实况", liveMetrics],
          ["基线与日计划", planMetrics],
        ].map(([title, rows]) => (
          <div className="production-node-live-row" key={String(title)}>
            <h4>
              {title as string} <QuestionCircleOutlined />
            </h4>
            <div>
              {(rows as (string | number | null | undefined)[][]).map(
                ([label, value]) => (
                  <span key={String(label)}>
                    <small>{label}</small>
                    <strong>
                      {typeof value === "string" ? value : number(value)}
                    </strong>
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
        <p>
          最近回放：
          {validReports.at(-1)?.at.slice(0, 19).replace("T", " ") || "尚未回放"}
        </p>
      </section>
      <NodeSections
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "settings",
            label: "节点设置",
            children: (
              <Space
                className="production-node-settings"
                direction="vertical"
                style={{ width: "100%" }}
              >
                <Alert
                  message={
                    configurationDirty
                      ? "当前为草稿；录入日报和修正前请先发布编排。"
                      : "修改配置后请保存草稿并发布新修订。"
                  }
                  type="info"
                />
                <label>
                  节点名称
                  <Input
                    aria-label="节点名称"
                    value={node.title}
                    disabled={disabled}
                    maxLength={50}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </label>
                <label>
                  节点说明
                  <Input.TextArea
                    aria-label="节点说明"
                    value={node.note}
                    disabled={disabled}
                    maxLength={500}
                    onChange={(e) => change({ note: e.target.value })}
                  />
                </label>
                <Space>
                  <span className="production-node-platform">
                    <small>所属生产平台</small>
                    <strong>{platforms[node.platform]}</strong>
                  </span>
                  <Button
                    size="small"
                    aria-pressed={version.inputs.includes(node.id)}
                    disabled={
                      disabled ||
                      statisticalUpstream(version, node.id).length > 0 ||
                      node.platform === "COLLECTION"
                    }
                    onClick={() =>
                      onChange({
                        ...version,
                        inputs: !version.inputs.includes(node.id)
                          ? [...version.inputs, node.id]
                          : version.inputs.filter((id) => id !== node.id),
                        output:
                          !version.inputs.includes(node.id) &&
                          version.output === node.id
                            ? ""
                            : version.output,
                      })
                    }
                  >
                    {version.inputs.includes(node.id)
                      ? "✓ 输入源头"
                      : "设为输入源头"}
                  </Button>
                  <Button
                    disabled={
                      disabled ||
                      outs.length > 0 ||
                      node.platform === "COLLECTION"
                    }
                    onClick={() =>
                      onChange({
                        ...version,
                        output: node.id,
                        inputs: version.inputs.filter((id) => id !== node.id),
                      })
                    }
                  >
                    {final ? "✓ 最终输出" : "设为最终输出"}
                  </Button>
                </Space>
                <Card size="small" title="来自 · 上游信息">
                  {incoming.length
                    ? incoming.map((n) => (
                        <p key={n.id}>
                          {n.title} · 任务 {n.taskId || "未绑定"} · 已选{" "}
                          {n.selected.length} 项
                        </p>
                      ))
                    : "当前没有上游"}
                </Card>
                <Card size="small" title="流向 · 下游数据分配">
                  {outs.length ? (
                    <>
                      <Select
                        aria-label="分流方式"
                        value={a.mode}
                        disabled={disabled}
                        onChange={(mode) =>
                          onChange({
                            ...version,
                            allocations: {
                              ...version.allocations,
                              [node.id]: { ...a, mode, confirmed: false },
                            },
                          })
                        }
                        options={[
                          { value: "percent", label: "按占比" },
                          { value: "quantity", label: "按数量" },
                          { value: "condition", label: "按条件" },
                        ]}
                      />
                      {outs.map((e) => {
                        const target = version.nodes.find(
                          (n) => n.id === e.to,
                        )!;
                        return (
                          <div style={{ marginTop: 10 }} key={e.to}>
                            <strong>{target.title} </strong>
                            {a.mode === "condition" ? (
                              <Space>
                                <Select
                                  disabled={disabled}
                                  aria-label={target.title + "素材类型"}
                                  value={
                                    a.conditions[e.to]?.dataType || "image"
                                  }
                                  options={[
                                    "image",
                                    "video",
                                    "audio",
                                    "text",
                                  ].map((value) => ({
                                    value,
                                    label: {
                                      image: "图像",
                                      video: "视频",
                                      audio: "音频",
                                      text: "文本",
                                    }[value],
                                  }))}
                                  onChange={(dataType) =>
                                    onChange({
                                      ...version,
                                      allocations: {
                                        ...version.allocations,
                                        [node.id]: {
                                          ...a,
                                          confirmed: false,
                                          conditions: {
                                            ...a.conditions,
                                            [e.to]: {
                                              ...a.conditions[e.to],
                                              dataType,
                                            },
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                                <Select
                                  disabled={disabled}
                                  aria-label={target.title + "条件字段"}
                                  placeholder="选择字段"
                                  style={{ width: 140 }}
                                  value={a.conditions[e.to]?.field}
                                  options={(
                                    conditionFields[
                                      a.conditions[e.to]?.dataType || "image"
                                    ] || []
                                  ).map((f) => ({
                                    value: f.key,
                                    label: f.label,
                                  }))}
                                  onChange={(field) =>
                                    onChange({
                                      ...version,
                                      allocations: {
                                        ...version.allocations,
                                        [node.id]: {
                                          ...a,
                                          confirmed: false,
                                          conditions: {
                                            ...a.conditions,
                                            [e.to]: {
                                              ...a.conditions[e.to],
                                              dataType:
                                                a.conditions[e.to]?.dataType ||
                                                "image",
                                              field,
                                              operator: "eq",
                                              value: "",
                                            },
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                                <Select
                                  disabled={disabled}
                                  value={a.conditions[e.to]?.operator || "eq"}
                                  options={conditionOperators(
                                    conditionFields[
                                      a.conditions[e.to]?.dataType || "image"
                                    ]?.find(
                                      (f) =>
                                        f.key === a.conditions[e.to]?.field,
                                    )?.type || "text",
                                  ).map((value) => ({
                                    value,
                                    label: operatorNames[value],
                                  }))}
                                  onChange={(operator) =>
                                    onChange({
                                      ...version,
                                      allocations: {
                                        ...version.allocations,
                                        [node.id]: {
                                          ...a,
                                          confirmed: false,
                                          conditions: {
                                            ...a.conditions,
                                            [e.to]: {
                                              ...a.conditions[e.to],
                                              operator,
                                            },
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                                <Input
                                  disabled={disabled}
                                  placeholder="条件值"
                                  value={a.conditions[e.to]?.value}
                                  onChange={(event) =>
                                    onChange({
                                      ...version,
                                      allocations: {
                                        ...version.allocations,
                                        [node.id]: {
                                          ...a,
                                          confirmed: false,
                                          conditions: {
                                            ...a.conditions,
                                            [e.to]: {
                                              ...a.conditions[e.to],
                                              value: event.target.value,
                                            },
                                          },
                                        },
                                      },
                                    })
                                  }
                                />
                              </Space>
                            ) : (
                              <InputNumber
                                aria-label={target.title + "分配值"}
                                min={0}
                                precision={a.mode === "percent" ? 2 : 0}
                                suffix={a.mode === "percent" ? "%" : undefined}
                                value={
                                  a.mode === "percent"
                                    ? (a.values[e.to] || 0) / 100
                                    : a.values[e.to] || 0
                                }
                                disabled={disabled}
                                onChange={(value) =>
                                  onChange({
                                    ...version,
                                    allocations: {
                                      ...version.allocations,
                                      [node.id]: {
                                        ...a,
                                        confirmed: false,
                                        values: {
                                          ...a.values,
                                          [e.to]: Math.round(
                                            Number(value) *
                                              (a.mode === "percent" ? 100 : 1),
                                          ),
                                        },
                                      },
                                    },
                                  })
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                      <p>
                        占比合计{" "}
                        {(Object.values(a.values) as number[]).reduce(
                          (sum, n) => sum + n,
                          0,
                        ) / 100}
                        % · 不执行真实数据搬运
                      </p>
                      <Checkbox
                        disabled={disabled}
                        checked={a.confirmed}
                        onChange={(e) =>
                          onChange({
                            ...version,
                            allocations: {
                              ...version.allocations,
                              [node.id]: { ...a, confirmed: e.target.checked },
                            },
                          })
                        }
                      >
                        确认分流配置
                      </Checkbox>
                    </>
                  ) : (
                    "没有下游，拖动节点端点建立连接"
                  )}
                </Card>
                <label>
                  手工日计划（选填）
                  <InputNumber
                    aria-label="手工日计划"
                    min={1}
                    value={node.dailyPlan}
                    disabled={disabled}
                    onChange={(dailyPlan) => change({ dailyPlan })}
                  />
                </label>
              </Space>
            ),
          },
          {
            key: "scope",
            label: `任务与产出 · 基线与进度（${node.taskId ? 1 : 0}）`,
            children:
              node.platform === "COLLECTION" ? (
                <Alert message="采集入库仅用于流程展示，不关联任务，不统计生产成本与产能。" />
              ) : (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Select
                    aria-label="节点关联任务"
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择模拟平台任务"
                    value={node.taskId || undefined}
                    disabled={disabled}
                    options={p.tasks
                      .filter((t) => t.platform === node.platform)
                      .map((t) => ({
                        value: t.id,
                        label: t.name + " / " + t.id,
                      }))}
                    onChange={(taskId) => change({ taskId, selected: [] })}
                  />
                  <Select
                    aria-label="节点最小颗粒度范围"
                    mode="multiple"
                    style={{ width: "100%" }}
                    placeholder={"选择" + grainNames[node.platform]}
                    disabled={disabled}
                    value={node.selected}
                    options={(task?.details || []).map((d) => ({
                      value: d.id,
                      label: d.id + " / " + d.name,
                    }))}
                    onChange={(selected) => change({ selected })}
                  />
                  <p>
                    每个节点一个任务，同一链路中的同一明细只能分配一个节点。内部圈选不统计成本和产能。
                  </p>
                  <Button
                    type="primary"
                    disabled={disabled || !node.selected.length}
                    onClick={async () => {
                      await saveDraft(version);
                      await cmd("scope", {
                        taskId: node.taskId,
                        selected: node.selected,
                        note: node.note,
                        expectedScopeVersion: node.scopeVersion,
                      });
                    }}
                  >
                    保存节点产出范围
                  </Button>
                  <Button
                    disabled={
                      disabled ||
                      configurationDirty ||
                      !version.confirmedAt ||
                      !node.selected.length
                    }
                    onClick={() => edit("report")}
                  >
                    回放试跑 / 正式日报
                  </Button>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={task ? [task] : []}
                    columns={[
                      {
                        title: "任务 ID / 名称",
                        render: (_, r) => (
                          <div>
                            <strong>{r.id}</strong>
                            <br />
                            {r.name}
                          </div>
                        ),
                      },
                      {
                        title: "创建时间",
                        dataIndex: "createdAt",
                        render: (x) => x.slice(0, 19).replace("T", " "),
                      },
                      {
                        title: "操作",
                        render: () => (
                          <Button type="link" onClick={openOutput}>
                            确认产出
                          </Button>
                        ),
                      },
                    ]}
                  />
                  <details className="production-report-evidence">
                    <summary>
                      试跑与正式日报回放记录（{node.reports.length}）
                    </summary>
                    <Table
                      size="small"
                      rowKey={(r) => r.kind + r.date}
                      dataSource={node.reports}
                      columns={[
                        { title: "日期", dataIndex: "date" },
                        {
                          title: "类型",
                          dataIndex: "kind",
                          render: (x) => (x === "trial" ? "试跑" : "正式生产"),
                        },
                        { title: "输入", dataIndex: "input" },
                        { title: "输出", dataIndex: "output" },
                        { title: "成本", dataIndex: "cost", render: money },
                        { title: "依据", dataIndex: "note" },
                      ]}
                    />{" "}
                  </details>
                </Space>
              ),
          },
          {
            key: "daily",
            label: "日产出列表",
            children: (
              <>
                <div className="production-daily-controls">
                  <Tabs
                    activeKey={dimension}
                    onChange={setDimension}
                    items={[
                      { key: "day", label: "日" },
                      { key: "week", label: "周" },
                      { key: "month", label: "月" },
                    ]}
                  />
                  <Input
                    aria-label="搜索生产日期"
                    placeholder="搜索日期"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Table
                  size="small"
                  rowKey="date"
                  pagination={{ pageSize: 8 }}
                  dataSource={days}
                  columns={[
                    {
                      title: "生产日期",
                      dataIndex: "date",
                      render: (x) =>
                        x.replaceAll("-", "") +
                        (x === day() ? " · 当日暂计" : ""),
                    },
                    {
                      title: "平台产能",
                      dataIndex: "platform",
                      render: (x) => x ?? "待回传",
                    },
                    {
                      title: "修正产能",
                      dataIndex: "corrected",
                      render: (x) => x ?? "—",
                    },
                    {
                      title: "有效产能",
                      dataIndex: "quantity",
                      render: (x) => x ?? "待回传",
                    },
                    {
                      title: "日基线",
                      render: () =>
                        baseline?.dailyOutput || node.dailyPlan || "未设置",
                    },
                    {
                      title: "基线达标率",
                      render: (_, r) => {
                        const target = baseline?.dailyOutput ?? node.dailyPlan;
                        return target && r.quantity != null
                          ? ((r.quantity / target) * 100).toFixed(1) + "%"
                          : "—";
                      },
                    },
                    {
                      title: "操作",
                      hidden: !final,
                      render: (_, r) =>
                        final && dimension === "day" ? (
                          <Space>
                            <Button
                              size="small"
                              disabled={disabled || configurationDirty}
                              onClick={() =>
                                edit("correction", {
                                  date: r.date,
                                  value: r.corrected ?? r.platform ?? 0,
                                })
                              }
                            >
                              修正
                            </Button>
                            {r.corrected != null && (
                              <Button
                                size="small"
                                disabled={disabled || configurationDirty}
                                onClick={() =>
                                  edit("restore", { date: r.date })
                                }
                              >
                                恢复平台值
                              </Button>
                            )}
                          </Space>
                        ) : (
                          "—"
                        ),
                    },
                  ]}
                />
                {!final && <p>非末端节点仅展示平台事实；仅末端可修正。</p>}
              </>
            ),
          },
          {
            key: "acceptance",
            label: "客户验收批次",
            disabled: !final,
            children: (
              <>
                <Alert
                  type="info"
                  message="本页保存客户反馈批次；项目流程中的客户验收提交后才登记为项目接受量。历史提交快照保持不变。"
                />
                <Button
                  style={{ marginTop: 12 }}
                  type="primary"
                  disabled={
                    disabled || configurationDirty || !node.selected.length
                  }
                  onClick={() =>
                    edit("batch", {
                      quantity: 0,
                      name: `第 ${node.batches.length + 1} 批客户反馈`,
                    })
                  }
                >
                  添加验收批次
                </Button>
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={node.batches}
                  columns={[
                    { title: "名称", dataIndex: "name" },
                    { title: "接受量", dataIndex: "quantity" },
                    { title: "反馈", dataIndex: "feedback" },
                    {
                      title: "最近操作",
                      dataIndex: "at",
                      render: (x) => x.slice(0, 16).replace("T", " "),
                    },
                    {
                      title: "操作",
                      render: (_, r) => (
                        <Space>
                          <Button
                            type="link"
                            disabled={disabled}
                            onClick={() => edit("batch", r)}
                          >
                            编辑
                          </Button>
                          <Button
                            danger
                            type="link"
                            disabled={
                              disabled ||
                              p.acceptances.some((a) =>
                                (a.rows || []).some((z) => z.batchId === r.id),
                              )
                            }
                            onClick={() => {
                              setDeleteId(r.id);
                              setAck(false);
                              setModal("delete");
                            }}
                          >
                            删除
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Drawer
        title="确认产出范围"
        rootClassName="production-output-drawer"
        width={880}
        open={outputOpen}
        onClose={closeOutput}
        maskClosable={false}
        footer={
          <div className="production-output-footer">
            <span>已保存的产出范围</span>
            <Space>
              <Button onClick={closeOutput}>取消</Button>
              <Button
                type="primary"
                disabled={disabled || !outputSelection.length}
                onClick={async () => {
                  await saveDraft(version);
                  await cmd("scope", {
                    taskId: node.taskId,
                    selected: outputSelection,
                    note: outputNote,
                    finalConfirmed: outputConfirmed,
                    expectedScopeVersion: node.scopeVersion,
                  });
                  setOutputOpen(false);
                }}
              >
                保存
              </Button>
            </Space>
          </div>
        }
      >
        <section className="production-output-basic">
          <h3>基本信息</h3>
          <Descriptions
            size="small"
            column={2}
            items={[
              { key: "name", label: "任务名称", children: task?.name },
              { key: "id", label: "任务 ID", children: task?.id },
              {
                key: "created",
                label: "创建时间",
                children: task?.createdAt.slice(0, 16).replace("T", " "),
              },
              {
                key: "platform",
                label: "生产平台",
                children: platforms[node.platform],
              },
            ]}
          />
        </section>
        <label className="production-output-label">
          * 最小颗粒度 ID / 名称
        </label>
        <Select
          aria-label="最小颗粒度 ID / 名称"
          mode="multiple"
          style={{ width: "100%" }}
          disabled={disabled}
          value={outputSelection}
          options={(task?.details || []).map((d) => ({
            value: d.id,
            label: d.id + " / " + d.name,
          }))}
          onChange={setOutputSelection}
        />
        {final && (
          <section className="production-output-acceptance">
            <header>
              <h3>客户验收批次</h3>
              <Button
                type="primary"
                size="small"
                disabled={
                  disabled || configurationDirty || !node.selected.length
                }
                onClick={() =>
                  edit("batch", {
                    quantity: 0,
                    name: `第 ${node.batches.length + 1} 批验收`,
                  })
                }
              >
                添加验收批次
              </Button>
            </header>
            <div className="production-output-metrics">
              <div>
                <small>当前节点累计客户接受</small>
                <strong>
                  {node.batches
                    .reduce((s, r) => s + r.quantity, 0)
                    .toLocaleString()}{" "}
                  {state.businesses.find((b) => b.id === businessId)?.unit}
                </strong>
                <small>{node.batches.length} 个验收批次</small>
              </div>
              <div>
                <small>项目客户接受 / 交付目标</small>
                <strong>
                  {productionFacts(state, businessId).accepted.toLocaleString()}{" "}
                  /{" "}
                  {state.businesses
                    .find((b) => b.id === businessId)
                    ?.target.toLocaleString()}{" "}
                  {state.businesses.find((b) => b.id === businessId)?.unit}
                </strong>
                <small>
                  剩余{" "}
                  {Math.max(
                    0,
                    state.businesses.find((b) => b.id === businessId)!.target -
                      productionFacts(state, businessId).accepted,
                  ).toLocaleString()}{" "}
                  {state.businesses.find((b) => b.id === businessId)?.unit}
                </small>
              </div>
            </div>
            <Progress
              showInfo={false}
              percent={Math.min(
                100,
                (productionFacts(state, businessId).accepted /
                  state.businesses.find((b) => b.id === businessId)!.target) *
                  100,
              )}
            />
            <ProductionTable
              headers={[
                "验收批次",
                "客户验收量",
                "客户反馈",
                "最近提交",
                "操作",
              ]}
              rows={node.batches.map((r) => [
                <>
                  <strong>{r.name}</strong>
                  <small>关联 {r.selected.length} 项生产明细</small>
                </>,
                <strong>{r.quantity.toLocaleString()}</strong>,
                r.feedback,
                <>
                  {r.at.slice(0, 16).replace("T", " ")}
                  <small>{r.actor}</small>
                </>,
                <Space size={0}>
                  <Button type="link" onClick={() => setBatchView(r)}>
                    查看
                  </Button>
                  <Button
                    type="link"
                    disabled={disabled || configurationDirty}
                    onClick={() => edit("batch", r)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    disabled={
                      disabled ||
                      p.acceptances.some((a) =>
                        (a.rows || []).some((x: any) => x.batchId === r.id),
                      )
                    }
                    onClick={() => {
                      setDeleteId(r.id);
                      setAck(false);
                      setModal("delete");
                    }}
                  >
                    删除
                  </Button>
                </Space>,
              ])}
            />
            <Checkbox
              disabled={disabled}
              checked={outputConfirmed}
              onChange={(e) => setOutputConfirmed(e.target.checked)}
            >
              确认本轮验收结果（仍按各批次接受量累计）
            </Checkbox>
          </section>
        )}
        <label className="production-output-label">范围备注（选填）</label>
        <Input.TextArea
          aria-label="产出范围备注"
          rows={3}
          value={outputNote}
          disabled={disabled}
          onChange={(e) => setOutputNote(e.target.value)}
        />
      </Drawer>
      <Modal
        title="查看验收批次"
        width={600}
        open={!!batchView}
        onCancel={() => setBatchView(null)}
        footer={<Button onClick={() => setBatchView(null)}>关闭</Button>}
      >
        <Descriptions
          column={1}
          bordered
          size="small"
          items={
            batchView
              ? [
                  { key: "name", label: "验收批次", children: batchView.name },
                  {
                    key: "quantity",
                    label: "客户验收量",
                    children: batchView.quantity,
                  },
                  {
                    key: "selected",
                    label: "生产范围",
                    children: batchView.selected.join("、"),
                  },
                  {
                    key: "feedback",
                    label: "客户反馈",
                    children: batchView.feedback,
                  },
                  {
                    key: "created",
                    label: "创建时间",
                    children: batchView.createdAt
                      ?.slice(0, 16)
                      .replace("T", " "),
                  },
                  {
                    key: "at",
                    label: "操作时间",
                    children: batchView.at.slice(0, 16).replace("T", " "),
                  },
                  { key: "actor", label: "操作人", children: batchView.actor },
                ]
              : []
          }
        />
      </Modal>
      <NodeDialog
        report={modal === "report"}
        title={
          modal === "report"
            ? node.title + " · 日汇总离线回放"
            : modal === "batch"
              ? form.getFieldValue("id")
                ? "编辑验收批次"
                : "添加验收批次"
              : modal === "delete"
                ? "删除验收批次 · 知情确认"
                : modal === "restore"
                  ? "恢复平台产能"
                  : "修正日产能 · " +
                    String(form.getFieldValue("date") || "").replaceAll("-", "")
        }
        open={!!modal}
        onCancel={() => setModal("")}
        onOk={() =>
          modal === "delete"
            ? cmd("batch", {
                id: deleteId,
                remove: true,
                acknowledged: ack,
              }).then(() => setModal(""))
            : form.submit()
        }
        okDisabled={modal === "delete" && !ack}
        okText={modal === "correction" ? "保存修正" : undefined}
      >
        {modal === "delete" ? (
          <>
            <p>
              删除“{node.batches.find((r) => r.id === deleteId)?.name}
              ”后，节点客户接受量将减少{" "}
              {node.batches.find((r) => r.id === deleteId)?.quantity}
              。尚未提交的自动带入数量会相应更新；已登记批次不能删除，历史快照保留。
            </p>
            <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)}>
              我已知晓删除及进度影响，确认删除
            </Checkbox>
          </>
        ) : (
          <Form
            form={form}
            layout="vertical"
            requiredMark={modal === "report" ? false : undefined}
            onFinish={async (values) => {
              if (modal === "report")
                await cmd("report", {
                  ...values,
                  cost: Math.round(values.costYuan * 100),
                });
              else if (modal === "batch") await cmd("batch", values);
              else
                await cmd("correction", {
                  ...values,
                  value: modal === "restore" ? null : values.value,
                });
              setModal("");
            }}
          >
            {modal === "batch" ? (
              <>
                <Form.Item hidden name="id">
                  <Input />
                </Form.Item>
                <Form.Item
                  name="name"
                  label="验收批次名称"
                  rules={[{ required: true }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
                <Form.Item
                  name="selected"
                  label="本批验收关联生产明细"
                  rules={[{ required: true, type: "array", min: 1 }]}
                >
                  <Select
                    mode="multiple"
                    aria-label="本批验收关联生产明细"
                    options={node.selected.map((id) => ({
                      value: id,
                      label:
                        id +
                        " / " +
                        (task?.details.find((d) => d.id === id)?.name || ""),
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="quantity"
                  label="客户验收量"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0} precision={0} />
                </Form.Item>
                <Form.Item
                  name="feedback"
                  label="客户反馈 / 原因"
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                  {() => (
                    <p className="production-batch-related">
                      本批关联：
                      {(form.getFieldValue("selected") || []).join("、")}
                    </p>
                  )}
                </Form.Item>
              </>
            ) : (
              <>
                {modal === "report" && (
                  <>
                    <p className="production-baseline-notice">
                      用于离线评审，不提交真实平台。输入/输出/处理中/淘汰须来自同口径汇总，后三项之和不得超过输入量。
                    </p>
                    <Form.Item label="关联任务">
                      <Select
                        value={node.taskId}
                        options={[
                          {
                            value: node.taskId,
                            label: node.taskId + " / " + task?.name,
                          },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="kind" label="数据用途">
                      <Select
                        options={[
                          { value: "production", label: "正式生产（日汇总）" },
                          { value: "trial", label: "小批量试跑" },
                        ]}
                      />
                    </Form.Item>
                  </>
                )}
                <Form.Item
                  name="date"
                  hidden={modal !== "report"}
                  label={modal === "report" ? "自然日" : "生产日期"}
                  rules={[{ required: true }]}
                >
                  <input aria-label="回放生产日期" type="date" max={day()} />
                </Form.Item>
                {modal === "report" ? (
                  <>
                    <div className="production-report-fields">
                      {[
                        ["input", "节点输入量"],
                        ["output", "已输出量"],
                        ["processing", "处理中数量"],
                        ["eliminated", "已淘汰数量"],
                        ["production", "生产产能（未质检）"],
                        ["costYuan", "当日成本（元）"],
                      ].map(([name, label]) => (
                        <Form.Item
                          key={name}
                          name={name}
                          label={label}
                          rules={[{ required: true }]}
                        >
                          <InputNumber
                            min={0}
                            precision={name === "costYuan" ? 2 : 0}
                          />
                        </Form.Item>
                      ))}
                    </div>
                    <Form.Item
                      name="note"
                      label="数据依据 / 备注"
                      rules={[{ required: true }]}
                    >
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Button
                      onClick={() =>
                        form.setFieldsValue({
                          input: 100,
                          output: 80,
                          processing: 15,
                          eliminated: 5,
                          production: 100,
                          costYuan: 12.5,
                          note: "离线回放示例，仅用于评审",
                        })
                      }
                    >
                      填入离线示例
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="production-correction-facts">
                      {[
                        [
                          "平台产能",
                          nodeDays(node).find(
                            (r) => r.date === form.getFieldValue("date"),
                          )?.platform,
                        ],
                        [
                          "当前有效产能",
                          nodeDays(node).find(
                            (r) => r.date === form.getFieldValue("date"),
                          )?.quantity,
                        ],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <small>{label}</small>
                          <strong>
                            {value == null
                              ? "待回传"
                              : Number(value).toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                    {modal !== "restore" && (
                      <Form.Item
                        name="value"
                        label="修正产能"
                        rules={[{ required: true }]}
                      >
                        <InputNumber min={0} precision={0} />
                      </Form.Item>
                    )}
                    <Form.Item
                      name="reason"
                      label="原因"
                      rules={[{ required: true }]}
                    >
                      <Input.TextArea rows={3} />
                    </Form.Item>
                  </>
                )}
              </>
            )}
          </Form>
        )}
      </NodeDialog>
    </Drawer>
  );
}
