import {
  PlatformBusinessList,
  PlatformCore,
  PlatformDetailed,
  PlatformWorkflow,
} from "./process/platform";
import { PlatformProductionPanel } from "./platform-production";
import {
  LeftOutlined,
  RightOutlined,
  QuestionCircleOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { WorkspaceTasksPage } from "./workspace-parity";
import "./process/process.css";
import React, { useEffect, useMemo, useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Progress,
  Form,
  Input,
  InputNumber,
  List,
  Mentions,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  DownloadOutlined,
  UploadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { usePMC } from "../api";
import { ProductionPanel } from "./production";
import { RiskPanel, RiskLedger } from "./risk";
import { Files } from "../components/Files";
import {
  type Business,
  type Task,
  type FileRef,
  stageNames,
  roleNames,
} from "../../shared/types";
import { productionFacts, money } from "../../shared/production";
import { riskSummary } from "../../shared/risk";
import {
  businessBlockers,
  currentBlockers,
  draftKey,
  DATA_TYPES,
  PROJECT_STAGES,
  OPPORTUNITY_STAGES,
  IMPORT_TEMPLATE_HEADERS,
  parseImportCSV,
} from "../../shared/process";
const { Text, Paragraph } = Typography;
const today = () => dayjs().format("YYYY-MM-DD");
const safe = (p: Promise<any>) => p.catch(() => undefined);
const canEdit = (b: Business, user: any) =>
  (user.role === "approver" || (user.role === "pm" && b.ownerId === user.id)) &&
  !b.completed &&
  b.stage !== "LOST";
const download = (name: string, data: string, type = "application/json") => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
function Person({ id }: { id?: string }) {
  const { state } = usePMC();
  return <>{state.users.find((u) => u.id === id)?.name || "—"}</>;
}
function UserSelect({
  value,
  onChange,
  multiple = false,
  disabled = false,
}: {
  value?: any;
  onChange?: (x: any) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const { state } = usePMC();
  return (
    <Select
      showSearch
      optionFilterProp="label"
      allowClear
      mode={multiple ? "multiple" : undefined}
      value={value || undefined}
      onChange={onChange}
      disabled={disabled}
      options={state.users.map((u) => ({
        value: u.id,
        label: u.name + " · " + roleNames[u.role],
      }))}
    />
  );
}
function DateField({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <DatePicker
      style={{ width: "100%" }}
      value={value ? dayjs(value) : null}
      onChange={(v) => onChange?.(v?.format("YYYY-MM-DD") || "")}
    />
  );
}
export function BusinessList({ kind }: { kind: "project" | "opportunity" }) {
  return <PlatformBusinessList kind={kind} />;
}
let panelRenderers: {
  production?: (id: string) => React.ReactNode;
  risk?: (id: string) => React.ReactNode;
} = {};
export function registerBusinessPanels(renderers: typeof panelRenderers) {
  panelRenderers = renderers;
}
export function BusinessDetail({
  id,
  onClose,
  tab = "workflow",
  production,
  risk,
  taskId,
  commentId,
  subtaskId,
}: {
  id: string;
  onClose: () => void;
  tab?: string;
  production?: React.ReactNode;
  risk?: React.ReactNode;
  taskId?: string;
  commentId?: string;
  subtaskId?: string;
}) {
  const { state, user, command, busy } = usePMC();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { modal } = App.useApp();
  const b = state.businesses.find((x) => x.id === id);
  const normalize = (v: string) =>
    ["overview", "summary", "records", "followups", "flow"].includes(v)
      ? "workflow"
      : v === "production" &&
          ["chainId", "versionId", "nodeId", "scopeKey"].some((key) =>
            params.has(key),
          )
        ? "orchestration"
        : v === "delivery"
          ? "orchestration"
          : v === "info"
            ? "details"
            : v;
  const [active, setActive] = useState(normalize(tab));
  const [visited, setVisited] = useState<string[]>([normalize(tab)]);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  useEffect(() => {
    setActive(normalize(tab));
    setVisited((v) =>
      v.includes(normalize(tab)) ? v : [...v, normalize(tab)],
    );
  }, [id, tab]);
  if (!b) return null;
  function switchTab(next: string, context?: Record<string, string>) {
    const apply = () => {
      setActive(next);
      setVisited((v) => (v.includes(next) ? v : [...v, next]));
      const p = new URLSearchParams(params);
      p.set("tab", next);
      if (context?.chainId)
        ["nodeId", "versionId", "scopeKey"].forEach((key) => p.delete(key));
      if (context?.riskId) p.set("riskView", "ledger");
      Object.entries(context || {}).forEach(([key, value]) =>
        p.set(key, value),
      );
      setParams(p, { replace: true });
    };
    if (
      document.querySelector('[data-production-dirty="true"]') &&
      context?.chainId &&
      context.chainId !== params.get("chainId")
    ) {
      modal.confirm({
        title: "当前编排尚未保存",
        content: "跳转到另一条链路会放弃未保存修改，请先保存或确认放弃。",
        okText: "放弃修改并跳转",
        cancelText: "继续编辑",
        onOk: apply,
        onCancel: () => setActive("orchestration"),
      });
    } else if (
      document.querySelector('[data-production-dirty="true"]') &&
      next !== active
    )
      modal.confirm({
        title: "当前生产画布尚未保存",
        content: "继续切换会保留本页画布，关闭详情前请保存草稿。",
        okText: "继续切换并保留画布",
        cancelText: "返回生产保存",
        onOk: apply,
        onCancel: () => setActive("orchestration"),
      });
    else apply();
  }
  const ids =
    params.get("detailIds")?.split(",") ||
    state.businesses.filter((x) => x.kind === b.kind).map((x) => x.id);
  const index = ids.indexOf(id);
  const go = (n: number) => {
    if (document.querySelector('[data-production-dirty="true"]')) {
      modal.warning({
        title: "请先保存生产画布",
        content: "切换业务前请先在生产流程编排中保存草稿。",
      });
      return;
    }
    const p = new URLSearchParams(params);
    p.set("detail", ids[n]);
    p.set("tab", "workflow");
    [
      "pid",
      "task",
      "comment",
      "subtask",
      "chainId",
      "versionId",
      "nodeId",
      "scopeKey",
      "riskId",
      "riskView",
      "submit",
    ].forEach((key) => p.delete(key));
    setParams(p);
  };
  const items: any[] = [
    {
      key: "workflow",
      label: "流程与提交",
      children: <PlatformWorkflow key={b.id} business={b} />,
    },
    {
      key: "production",
      label: "生产作业",
      children: <PlatformProductionPanel key={b.id} businessId={b.id} />,
    },
    ...(!b.common.selfCreated && b.kind === "opportunity"
      ? [
          {
            key: "crm",
            label: "销售易信息",
            children: (
              <Descriptions
                bordered
                column={3}
                items={[
                  { key: "id", label: "销售易商机编号", children: b.crmId },
                  {
                    key: "stage",
                    label: "销售易商机阶段",
                    children: b.common.crmStage || "L1潜在商机",
                  },
                  {
                    key: "sync",
                    label: "同步时间",
                    children: state.settings.crmSyncedAt || "-",
                  },
                ]}
              />
            ),
          },
        ]
      : []),
    {
      key: "details",
      label: "详细信息",
      children: <PlatformDetailed business={b} />,
    },
    { key: "orchestration", label: "生产流程编排" },
  ];
  const extensions: any[] = [
    {
      key: "orchestration",
      label: "生产流程编排",
      children: production || panelRenderers.production?.(b.id) || (
        <ProductionPanel businessId={b.id} />
      ),
    },
    {
      key: "tasks",
      label: "事务性任务",
      children: (
        <BusinessTasks
          business={b}
          focusId={taskId}
          commentId={commentId}
          subtaskId={subtaskId}
        />
      ),
    },
    {
      key: "risk",
      label: "风险评估扩展",
      children: risk || panelRenderers.risk?.(b.id) || (
        <RiskPanel businessId={b.id} />
      ),
    },
  ];
  return (
    <Drawer
      title={b.kind === "project" ? "项目详情" : "商机详情"}
      open
      onClose={onClose}
      width="calc(100vw - 220px)"
      className="platform-detail"
      extra={
        <Space>
          <Tooltip title="使用上一条和下一条查看当前筛选列表中的记录">
            <QuestionCircleOutlined />
          </Tooltip>
          <Button
            icon={<LeftOutlined />}
            disabled={index <= 0}
            onClick={() => go(index - 1)}
          >
            上一条
          </Button>
          <Button
            disabled={index < 0 || index >= ids.length - 1}
            onClick={() => go(index + 1)}
          >
            下一条 <RightOutlined />
          </Button>
        </Space>
      }
    >
      <PlatformCore
        business={b}
        onBaseEdit={() => {
          form.setFieldsValue(b);
          setEditing(true);
        }}
      />
      <Tabs
        activeKey={active}
        onChange={switchTab}
        items={items}
        tabBarExtraContent={
          <Dropdown
            menu={{
              items: extensions
                .filter((x) => x.key !== "orchestration")
                .map((x) => ({ key: x.key, label: x.label })),
              onClick: ({ key }) => switchTab(key),
            }}
            trigger={["click"]}
          >
            <Tooltip title="扩展功能">
              <Button
                type="text"
                aria-label="扩展功能"
                icon={<MoreOutlined />}
              />
            </Tooltip>
          </Dropdown>
        }
      />
      {extensions.map((x) => (
        <div
          key={x.key}
          style={{ display: active === x.key ? "block" : "none" }}
        >
          {visited.includes(x.key) ? x.children : null}
        </div>
      ))}
      <Modal
        title="编辑独立商机基础信息"
        open={editing}
        onCancel={() => setEditing(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={busy}
        onOk={() =>
          safe(
            form
              .validateFields()
              .then((v) =>
                command("process.platformUpdate", {
                  ...v,
                  businessId: b.id,
                  version: b.version,
                }),
              )
              .then(() => setEditing(false)),
          )
        }
      >
        <Form layout="vertical" form={form}>
          {[
            ["name", "商机名称"],
            ["customer", "客户名称"],
            ["description", "需求描述"],
            ["clarification", "需求澄清记录"],
          ].map(([k, label]) => (
            <Form.Item
              key={k}
              name={k}
              label={label}
              rules={[{ required: true }]}
            >
              {["description", "clarification"].includes(k) ? (
                <Input.TextArea rows={3} />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Drawer>
  );
}
function TaskForm({ form, business }: { form: any; business: Business }) {
  return (
    <Form form={form} layout="vertical">
      <Form.Item
        name="title"
        label="任务标题"
        rules={[{ required: true, max: 200 }]}
      >
        <Input maxLength={200} showCount />
      </Form.Item>
      <Form.Item name="description" label="任务说明">
        <Input.TextArea rows={4} maxLength={4000} showCount />
      </Form.Item>
      <div className="form-grid">
        <Form.Item name="owners" label="负责人" rules={[{ required: true }]}>
          <UserSelect multiple />
        </Form.Item>
        <Form.Item name="followers" label="关注人">
          <UserSelect multiple />
        </Form.Item>
        <Form.Item name="due" label="截止日期">
          <DateField />
        </Form.Item>
        <Form.Item name="stage" label="关联流程阶段">
          <Select
            allowClear
            options={(business.kind === "project"
              ? PROJECT_STAGES
              : OPPORTUNITY_STAGES
            ).map((value) => ({ value, label: stageNames[value] }))}
          />
        </Form.Item>
      </div>
      <Form.Item name="files" label="任务附件（每个≤2 MB）">
        <Files maxMB={2} />
      </Form.Item>
    </Form>
  );
}
function BusinessTasks({
  business,
  focusId,
  commentId,
  subtaskId,
}: {
  business: Business;
  focusId?: string;
  commentId?: string;
  subtaskId?: string;
}) {
  const { state, user, command, busy } = usePMC();
  const [params, setParams] = useSearchParams();
  const [selected, setLocalSelected] = useState(focusId || "");
  const setSelected = (id: string) => {
    setLocalSelected(id);
    const next = new URLSearchParams(params);
    if (id) next.set("task", id);
    else {
      next.delete("task");
      next.delete("comment");
      next.delete("subtask");
    }
    setParams(next);
  };
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [filter, setFilter] = useState(
    business.kind === "project" ? "pending" : "all",
  );
  const [q, setQ] = useState("");
  const allTasks = state.tasks.filter((t) => t.businessId === business.id);
  const pending = allTasks.filter((t) => t.status !== "已完成");
  const overdue = pending.filter((t) => t.due && t.due < today());
  const blocking = pending.filter((t) => currentBlockers(t).length > 0);
  const rows = state.tasks.filter(
    (t) =>
      t.businessId === business.id &&
      (!q || (t.title + t.description).includes(q)) &&
      (filter === "all" ||
        (filter === "overdue" && overdue.includes(t)) ||
        (filter === "blocking" && blocking.includes(t)) ||
        (filter === "pending" && t.status !== "已完成") ||
        (filter === "done" && t.status === "已完成") ||
        (filter === "mine" && t.owners.includes(user.id))),
  );
  useEffect(() => {
    setLocalSelected(focusId || "");
  }, [focusId]);
  return (
    <>
      {business.kind === "project" && (
        <div className="project-task-summary">
          {[
            { key: "pending", label: "未完成待办", count: pending.length },
            { key: "overdue", label: "已过期", count: overdue.length },
            { key: "blocking", label: "存在阻塞意见", count: blocking.length },
          ].map((item) => (
            <button
              key={item.key}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              <span>{item.label}</span>
              <strong>
                {item.count}
                <small>项</small>
              </strong>
            </button>
          ))}
        </div>
      )}
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          disabled={!canEdit(business, user)}
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({
              stage: business.stage,
              owners: [business.ownerId],
              followers: [],
              files: [],
            });
            setCreating(true);
          }}
        >
          新建任务
        </Button>
        <Select
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部任务" },
            { value: "pending", label: "未完成" },
            { value: "overdue", label: "已过期" },
            { value: "blocking", label: "有阻塞意见" },
            { value: "done", label: "已完成" },
            { value: "mine", label: "我负责的" },
          ]}
        />
        <Input.Search
          placeholder="搜索任务"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Space>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          {
            title: "任务",
            dataIndex: "title",
            render: (v, t) => (
              <>
                <Button type="link" onClick={() => setSelected(t.id)}>
                  {v}
                </Button>
                {t.followupId && <Tag>来自跟进</Tag>}
                {currentBlockers(t).length > 0 && (
                  <Tag color="orange"># 阻塞 {currentBlockers(t).length}</Tag>
                )}
              </>
            ),
          },
          {
            title: "阶段",
            dataIndex: "stage",
            render: (v) => stageNames[v] || "无绑定",
          },
          {
            title: "负责人",
            dataIndex: "owners",
            render: (v) =>
              v.map((id: string) => (
                <Tag key={id}>
                  <Person id={id} />
                </Tag>
              )),
          },
          {
            title: "截止",
            dataIndex: "due",
            render: (v, t) => (
              <Text
                type={
                  v && v < today() && t.status !== "已完成"
                    ? "danger"
                    : undefined
                }
              >
                {v || "—"}
              </Text>
            ),
          },
          {
            title: "子任务",
            render: (_, t) =>
              `${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length}`,
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (v) => (
              <Tag
                color={
                  v === "已完成" ? "green" : v === "进行中" ? "blue" : "default"
                }
              >
                {v}
              </Tag>
            ),
          },
        ]}
        pagination={{ pageSize: 10 }}
      />
      <Modal
        title="新建任务"
        width={760}
        open={creating}
        onCancel={() => setCreating(false)}
        confirmLoading={busy}
        onOk={() =>
          safe(
            form
              .validateFields()
              .then((v) =>
                command("task.create", { businessId: business.id, ...v }),
              )
              .then((t) => {
                setCreating(false);
                setSelected(t.id);
              }),
          )
        }
        destroyOnHidden
      >
        <TaskForm form={form} business={business} />
      </Modal>
      {selected && (
        <TaskDetail
          id={selected}
          onClose={() => setSelected("")}
          commentId={commentId}
          subtaskId={subtaskId}
        />
      )}
    </>
  );
}
function TaskDetail({
  id,
  onClose,
  commentId,
  subtaskId,
}: {
  id: string;
  onClose: () => void;
  commentId?: string;
  subtaskId?: string;
}) {
  const { state, user, command, busy } = usePMC();
  const t = state.tasks.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const [subEditing, setSubEditing] = useState<any>();
  const [subform] = Form.useForm();
  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<FileRef[]>([]);
  const [commentEdit, setCommentEdit] = useState("");
  const [release, setRelease] = useState<any>();
  const [reason, setReason] = useState("");
  useEffect(() => {
    const target = commentId
      ? "comment-" + commentId
      : subtaskId
        ? "subtask-" + subtaskId
        : "";
    if (target) {
      requestAnimationFrame(() =>
        document
          .getElementById(target)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
  }, [id, commentId, subtaskId]);
  if (!t) return null;
  const b = state.businesses.find((b) => b.id === t.businessId)!;
  const editable = canEdit(b, user);
  const blockers = currentBlockers(t);
  async function postComment() {
    await command("task.comment", {
      taskId: t!.id,
      id: commentEdit || undefined,
      text: comment,
      files: commentFiles,
    });
    setComment("");
    setCommentFiles([]);
    setCommentEdit("");
  }
  function moveSub(index: number, delta: number) {
    const ids = t!.subtasks.map((x) => x.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    safe(command("task.subtask", { taskId: t!.id, operation: "reorder", ids }));
  }
  return (
    <Drawer
      title={t.title}
      open
      onClose={onClose}
      width={850}
      destroyOnHidden
      extra={
        <Space>
          <Button
            disabled={!editable}
            onClick={() => {
              form.setFieldsValue(t);
              setEditing(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="primary"
            disabled={!editable}
            onClick={() =>
              safe(
                command("task.update", {
                  taskId: t.id,
                  status: t.status === "已完成" ? "待处理" : "已完成",
                }),
              )
            }
          >
            {t.status === "已完成" ? "重新打开" : "完成任务"}
          </Button>
        </Space>
      }
    >
      <Descriptions
        size="small"
        column={2}
        bordered
        items={[
          { key: "business", label: "所属业务", children: b.name },
          {
            key: "stage",
            label: "关联阶段",
            children: stageNames[t.stage] || "未绑定",
          },
          {
            key: "owner",
            label: "负责人",
            children: t.owners.map((id) => (
              <Tag key={id}>
                <Person id={id} />
              </Tag>
            )),
          },
          {
            key: "followers",
            label: "关注人",
            children: t.followers.map((id) => (
              <Tag key={id}>
                <Person id={id} />
              </Tag>
            )),
          },
          { key: "due", label: "截止", children: t.due || "—" },
          {
            key: "status",
            label: "状态",
            children: (
              <Select
                size="small"
                disabled={!editable}
                value={t.status}
                onChange={(status) =>
                  safe(command("task.update", { taskId: t.id, status }))
                }
                options={["待处理", "进行中", "已完成"].map((value) => ({
                  value,
                }))}
              />
            ),
          },
          {
            key: "desc",
            label: "说明",
            span: 2,
            children: (
              <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {t.description || "—"}
              </Paragraph>
            ),
          },
        ]}
      />
      <Files value={t.files} disabled />
      {blockers.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="当前 # 阻塞"
          description={blockers.map((x) => (
            <div key={x.userId}>
              等待 <Person id={x.userId} /> 回复当前任务
              {user.role === "approver" && editable && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setRelease(x);
                    setReason("");
                  }}
                >
                  有理由解除
                </Button>
              )}
            </div>
          ))}
        />
      )}
      <Divider orientation="left">
        子任务 ({t.subtasks.filter((x) => x.done).length}/{t.subtasks.length})
      </Divider>
      <Space>
        <Button
          disabled={!editable}
          icon={<PlusOutlined />}
          onClick={() => {
            subform.resetFields();
            subform.setFieldsValue({ content: "", done: false, files: [] });
            setSubEditing({});
          }}
        >
          添加子任务
        </Button>
        <Button
          disabled={!editable || !t.subtasks.length}
          onClick={() =>
            safe(
              command("task.subtask", { taskId: t.id, operation: "restore" }),
            )
          }
        >
          恢复创建顺序
        </Button>
      </Space>
      <List
        dataSource={t.subtasks}
        locale={{ emptyText: "暂无子任务" }}
        renderItem={(sub, i) => (
          <List.Item
            id={"subtask-" + sub.id}
            style={{ background: sub.id === subtaskId ? "#fffbe6" : undefined }}
            actions={[
              <Button
                disabled={!editable}
                size="small"
                onClick={() => {
                  subform.setFieldsValue(sub);
                  setSubEditing(sub);
                }}
              >
                编辑
              </Button>,
              <Button
                disabled={!editable || i === 0}
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={() => moveSub(i, -1)}
              />,
              <Button
                disabled={!editable || i === t.subtasks.length - 1}
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={() => moveSub(i, 1)}
              />,
              <Popconfirm
                title="删除此子任务？"
                onConfirm={() =>
                  safe(
                    command("task.subtask", {
                      taskId: t.id,
                      id: sub.id,
                      operation: "delete",
                    }),
                  )
                }
              >
                <Button size="small" danger disabled={!editable}>
                  删除
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Checkbox
                  checked={sub.done}
                  disabled={!editable}
                  onChange={(e) =>
                    safe(
                      command("task.subtask", {
                        taskId: t.id,
                        id: sub.id,
                        done: e.target.checked,
                      }),
                    )
                  }
                >
                  <Text delete={sub.done}>{sub.content}</Text>
                </Checkbox>
              }
              description={
                <>
                  <Person id={sub.ownerId} /> · {sub.due || "无截止日期"}
                  <Files value={sub.files || []} disabled />
                </>
              }
            />
          </List.Item>
        )}
      />
      <Divider orientation="left">
        评论 ({t.comments.filter((x) => !x.deleted).length})
      </Divider>
      <Alert
        type="info"
        showIcon
        message="@姓名 通知成员；#姓名 设置当前阻塞。被 # 的成员回复此任务后解除自己的阻塞。最新一条包含 # 的有效评论决定当前阻塞。"
      />
      <List
        dataSource={t.comments.filter((x) => !x.deleted)}
        locale={{ emptyText: "暂无评论" }}
        renderItem={(row) => (
          <List.Item
            id={"comment-" + row.id}
            style={{ background: row.id === commentId ? "#fffbe6" : undefined }}
            actions={
              row.actor === user.id && editable
                ? [
                    <Button
                      type="link"
                      onClick={() => {
                        setCommentEdit(row.id);
                        setComment(row.text);
                        setCommentFiles(row.files || []);
                      }}
                    >
                      编辑
                    </Button>,
                    <Popconfirm
                      title="删除评论并移除对应阻塞？"
                      onConfirm={() =>
                        safe(
                          command("task.comment", {
                            taskId: t.id,
                            id: row.id,
                            operation: "delete",
                          }),
                        )
                      }
                    >
                      <Button type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>,
                  ]
                : []
            }
          >
            <List.Item.Meta
              title={
                <Space>
                  <Person id={row.actor} />
                  <Text type="secondary">
                    {dayjs(row.createdAt).format("MM-DD HH:mm")}
                    {row.updatedAt ? " · 已编辑" : ""}
                  </Text>
                </Space>
              }
              description={
                <>
                  <Paragraph style={{ whiteSpace: "pre-wrap" }}>
                    {row.text}
                  </Paragraph>
                  <Files value={row.files || []} disabled />
                  {row.blockers?.map((uid: string) => (
                    <Tag
                      key={uid}
                      color={
                        row.resolvedUsers?.includes(uid) ? "green" : "orange"
                      }
                    >
                      #<Person id={uid} />
                      {row.resolvedUsers?.includes(uid)
                        ? " 已回复 / 已解除"
                        : " 等待回复"}
                    </Tag>
                  ))}
                </>
              }
            />
          </List.Item>
        )}
      />
      <Card size="small" title={commentEdit ? "编辑评论" : "发表评论"}>
        <Mentions
          rows={4}
          value={comment}
          onChange={setComment}
          maxLength={4000}
          prefix={["@", "#"]}
          options={state.users.map((u) => ({
            value: u.name,
            label: u.name + " · " + u.account,
          }))}
          disabled={!editable}
          placeholder="输入评论，可使用 @姓名 或 #姓名"
        />
        <div style={{ marginTop: 12 }}>
          <Files
            value={commentFiles}
            onChange={setCommentFiles}
            maxMB={2}
            disabled={!editable}
          />
        </div>
        <Space style={{ marginTop: 12 }}>
          <Button
            type="primary"
            loading={busy}
            disabled={!editable || (!comment.trim() && !commentFiles.length)}
            onClick={() => safe(postComment())}
          >
            {commentEdit ? "保存修改" : "发送评论"}
          </Button>
          {commentEdit && (
            <Button
              onClick={() => {
                setCommentEdit("");
                setComment("");
                setCommentFiles([]);
              }}
            >
              取消编辑
            </Button>
          )}
        </Space>
      </Card>
      <Collapse
        style={{ marginTop: 16 }}
        items={[
          {
            key: "audit",
            label: "任务操作记录",
            children: (
              <Timeline
                items={t.history.map((h) => ({
                  children: (
                    <>
                      <Text strong>{h.action}</Text> · {h.detail}
                      <div className="muted">
                        {h.actor} · {dayjs(h.at).format("MM-DD HH:mm")}
                      </div>
                    </>
                  ),
                }))}
              />
            ),
          },
        ]}
      />
      <Modal
        title="编辑任务"
        width={720}
        open={editing}
        onCancel={() => setEditing(false)}
        confirmLoading={busy}
        onOk={() =>
          safe(
            form
              .validateFields()
              .then((v) => command("task.update", { ...v, taskId: t.id }))
              .then(() => setEditing(false)),
          )
        }
        destroyOnHidden
      >
        <TaskForm form={form} business={b} />
      </Modal>
      <Modal
        title={subEditing?.id ? "编辑子任务" : "新建子任务"}
        open={subEditing !== undefined}
        width={620}
        onCancel={() => setSubEditing(undefined)}
        confirmLoading={busy}
        onOk={() =>
          safe(
            subform
              .validateFields()
              .then((v) =>
                command("task.subtask", {
                  ...v,
                  taskId: t.id,
                  id: subEditing?.id,
                }),
              )
              .then(() => setSubEditing(undefined)),
          )
        }
        destroyOnHidden
      >
        <Form layout="vertical" form={subform}>
          <Form.Item
            name="content"
            label="子任务内容"
            rules={[{ required: true, max: 4000 }]}
          >
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
          <Form.Item name="ownerId" label="负责人">
            <UserSelect />
          </Form.Item>
          <Form.Item name="due" label="截止日期">
            <DateField />
          </Form.Item>
          <Form.Item name="files" label="附件">
            <Files maxMB={2} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="解除任务阻塞"
        open={!!release}
        onCancel={() => setRelease(undefined)}
        onOk={() =>
          safe(
            command("task.release", { taskId: t.id, ...release, reason }).then(
              () => setRelease(undefined),
            ),
          )
        }
      >
        <Alert type="warning" message="此操作会记录授权人与解除原因。" />
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={5}
          placeholder="至少5字解除原因"
        />
      </Modal>
    </Drawer>
  );
}
export function TasksPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return params.get("view") === "risks" ? (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate("/tasks")}>返回我的待办</Button>
        <Tag>扩展功能</Tag>
      </Space>
      <RiskLedger />
    </>
  ) : (
    <WorkspaceTasksPage />
  );
}
export function ImportPage() {
  const { state, user, command, busy } = usePMC();
  const { message, modal } = App.useApp();
  const [batchId, setBatchId] = useState("");
  const [category, setCategory] = useState("all");
  const [fileData, setFileData] = useState<any>();
  const batch = state.imports.find((x) => x.id === batchId);
  const disabled = !["pm", "approver"].includes(user.role);
  const counts: any = {};
  for (const r of batch?.rows || [])
    counts[r.status] = (counts[r.status] || 0) + 1;
  const label: Record<string, string> = {
    ready: "可导入",
    applied: "已导入",
    error: "错误",
    filtered: "已过滤",
    skipped: "已跳过",
  };
  async function parse(file: File) {
    if (disabled) return false;
    try {
      if (/\.csv$/i.test(file.name) && file.size > 800000)
        throw Error("CSV不能超过800KB");
      if (!/\.(csv|xlsx|xls)$/i.test(file.name))
        throw Error("请选择CSV、XLS或XLSX文件");
      let headers: string[], rows: any[];
      if (/\.csv$/i.test(file.name)) {
        ({ headers, rows } = parseImportCSV(await file.text()));
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), {
          type: "array",
          cellDates: false,
        });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });
        if (matrix.length < 2) throw Error("文件没有数据行");
        headers = matrix[0].map((v) =>
          String(v)
            .replace(/^\uFEFF/, "")
            .trim(),
        );
        if (headers.some((x) => !x)) throw Error("表头不能为空");
        if (new Set(headers).size !== headers.length)
          throw Error("表头不能重复");
        rows = matrix
          .slice(1)
          .filter((a) => a.some((v) => String(v).trim()))
          .map((a, i) => {
            if (a.length > headers.length)
              throw Error("第" + (i + 2) + "行列数超出表头");
            return Object.fromEntries(headers.map((h, i) => [h, a[i] ?? ""]));
          });
      }
      if (rows.length > 2000) throw Error("最多导入2000行");
      const p = { filename: file.name, headers, rows };
      setFileData(p);
      const result = await command("import.preview", p);
      setBatchId(result.id);
      setCategory("all");
    } catch (e) {
      message.error((e as Error).message);
    }
    return false;
  }
  async function apply() {
    modal.confirm({
      title: "确认应用历史数据导入",
      content: `将应用 ${counts.ready || 0} 条预检通过的数据。错误、过滤与重复行保留在报告中。此操作只恢复历史记录，不模拟完成整个流程。`,
      okText: "确认导入",
      onOk: async () => {
        await command("import.apply", { batchId });
        message.success("导入完成，请查看逐行报告");
      },
    });
  }
  return (
    <section className="import-parity">
      <div className="import-parity-info">
        <span>ⓘ CSV 格式最佳 · 单次最多 2000 条 · 选择文件后自动预检查</span>
        <Tooltip
          trigger="click"
          title="支持 CSV、XLS、XLSX；Excel 读取首个工作表。按销售易商机编号关联，重复数据自动跳过，仅处理预检查通过的记录。"
        >
          <Button type="link" size="small">
            导入说明
          </Button>
        </Tooltip>
      </div>
      <div className="import-parity-toolbar">
        <div className="import-parity-file">
          <Upload
            beforeUpload={parse}
            accept=".csv,.xls,.xlsx"
            showUploadList={false}
          >
            <Button
              icon={<UploadOutlined />}
              disabled={disabled}
              loading={busy}
            >
              选择文件
            </Button>
          </Upload>
          <div>
            <strong>
              {fileData?.filename || batch?.filename || "尚未选择文件"}
            </strong>
            <small>支持 .csv / .xls / .xlsx</small>
          </div>
        </div>
        <Space>
          <Button
            icon={<SearchOutlined />}
            disabled={!fileData || disabled}
            loading={busy}
            onClick={() =>
              safe(
                command("import.preview", fileData).then((r) => {
                  setBatchId(r.id);
                  setCategory("all");
                }),
              )
            }
          >
            预检查
          </Button>
          <Button
            disabled={
              disabled || !batch || batch.status === "applied" || !counts.ready
            }
            loading={busy}
            onClick={() => safe(apply())}
          >
            ✓ 确认导入
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!batch}
            onClick={() =>
              download(
                "导入报告-" + batch.id + ".json",
                JSON.stringify(batch, null, 2),
              )
            }
          >
            下载报告
          </Button>
        </Space>
      </div>
      {batch ? (
        <Card
          className="import-parity-report"
          title={batch.filename || "预检查报告"}
          extra={
            <Space>
              <Select
                value={batchId}
                style={{ width: 220 }}
                onChange={(id) => {
                  setBatchId(id);
                  setCategory("all");
                }}
                options={state.imports.map((x) => ({
                  value: x.id,
                  label:
                    (x.filename || "未命名导入") +
                    " · " +
                    (x.status === "applied" ? "已导入" : "预检查"),
                }))}
              />
              <Button
                onClick={() =>
                  download(
                    "历史数据导入模板.csv",
                    "\uFEFF" + IMPORT_TEMPLATE_HEADERS.join(",") + "\r\n",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                下载CSV模板
              </Button>
            </Space>
          }
        >
          <Space wrap style={{ marginBottom: 16 }}>
            {Object.entries(counts).map(([k, v]: any) => (
              <Tag
                key={k}
                color={
                  k === "error"
                    ? "red"
                    : k === "ready" || k === "applied"
                      ? "green"
                      : "default"
                }
              >
                {label[k]} {v}
              </Tag>
            ))}
            {batch.status === "applied" && (
              <Tag color="blue">本批次已应用，再次应用将返回原报告</Tag>
            )}
          </Space>
          <Tabs
            activeKey={category}
            onChange={setCategory}
            items={[
              "all",
              "ready",
              "applied",
              "error",
              "filtered",
              "skipped",
            ].map((k) => ({
              key: k,
              label: k === "all" ? "全部" : label[k] + ` (${counts[k] || 0})`,
            }))}
          />
          <Table<any>
            rowKey="row"
            scroll={{ x: 900 }}
            dataSource={batch.rows.filter(
              (r: any) => category === "all" || r.status === category,
            )}
            columns={[
              { title: "行号", dataIndex: "row", width: 70 },
              {
                title: "销售易商机ID",
                render: (_, r) => r.source["销售易商机ID"],
              },
              {
                title: "项目名称",
                render: (_, r) =>
                  r.changes?.name ||
                  r.before?.name ||
                  r.source["项目名称"] ||
                  "—",
              },
              {
                title: "状态",
                dataIndex: "status",
                render: (v) => (
                  <Tag
                    color={
                      v === "error"
                        ? "red"
                        : v === "ready" || v === "applied"
                          ? "green"
                          : "default"
                    }
                  >
                    {label[v]}
                  </Tag>
                ),
              },
              {
                title: "问题与警告",
                render: (_, r) => (
                  <>
                    {r.errors?.map((x: string) => (
                      <div key={x} style={{ color: "#cf1322" }}>
                        {x}
                      </div>
                    ))}
                    {r.warnings?.map((x: string) => (
                      <div key={x} style={{ color: "#ad6800" }}>
                        {x}
                      </div>
                    ))}
                  </>
                ),
              },
            ]}
            expandable={{
              expandedRowRender: (r) => (
                <div className="form-grid">
                  <div>
                    <Text strong>导入前</Text>
                    <pre className="snapshot">
                      {JSON.stringify(r.before || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <Text strong>计划变更</Text>
                    <pre className="snapshot">
                      {JSON.stringify(r.changes || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              ),
            }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
          />
          <details style={{ marginTop: 16 }}>
            <summary>本地模拟导入说明与辅助操作</summary>
            <p>
              仅处理本地模拟 CRM 中已存在的商机。支持 CSV（≤800KB）、XLS/XLSX
              首张表，最多 2000 行。历史导入不会连接外部 CRM。
            </p>
            <Button
              disabled={!fileData || disabled}
              onClick={() =>
                safe(
                  command("process.sync")
                    .then(() => command("import.preview", fileData))
                    .then((r) => setBatchId(r.id)),
                )
              }
            >
              模拟同步并重新预检
            </Button>
          </details>
        </Card>
      ) : (
        <div className="import-parity-empty">
          <Empty description="选择文件并预检查后，结果将在这里显示" />
        </div>
      )}
      {!batch && !!state.imports.length && (
        <details style={{ marginTop: 16 }}>
          <summary>查看历史导入批次（{state.imports.length}）</summary>
          <List
            dataSource={state.imports}
            renderItem={(x) => (
              <List.Item>
                <Button type="link" onClick={() => setBatchId(x.id)}>
                  {x.filename} · {dayjs(x.createdAt).format("MM-DD HH:mm")} ·{" "}
                  {x.status === "applied" ? "已导入" : "预检查"}
                </Button>
              </List.Item>
            )}
          />
        </details>
      )}
    </section>
  );
}
