import React, { useState } from "react";
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Mentions,
  Modal,
  Popover,
  Progress,
  Select,
  Segmented,
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
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudSyncOutlined,
  CopyOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LeftOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  RollbackOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  UpOutlined,
  DownOutlined,
  UploadOutlined,
  DeleteOutlined,
  IdcardOutlined,
  UserOutlined,
  ProjectOutlined,
  CalendarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  BranchesOutlined,
  StopOutlined,
  CheckOutlined,
  BankOutlined,
  DollarOutlined,
  LockOutlined,
  ArrowRightOutlined,
  TeamOutlined,
  ExperimentOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePMC } from "../../api";
import { Files } from "../../components/Files";
import type { Business } from "../../../shared/types";
import { stageNames } from "../../../shared/types";
import {
  DATA_TYPES,
  PROJECT_STAGES,
  OPPORTUNITY_STAGES,
  businessBlockers,
  draftKey,
  mentionsIn,
} from "../../../shared/process";
import { money } from "../../../shared/production";
import { reportCrmStage } from "../../../shared/reports";
const stageTones: Record<string, string> = {
  ESTABLISHED: "purple",
  FORMAL_DELIVERY: "pink",
  CUSTOMER_ACCEPTANCE: "coral",
  SUPPLEMENT_DELIVERY: "gold",
  INITIATE_CLOSE: "orange",
  CLOSE: "orange",
  CLOSED: "green",
  DEMO_DELIVERY: "teal",
  DEMO_FEEDBACK: "blue",
  INITIATE_PROJECT: "indigo",
  LOST: "red",
  SUSPENDED: "neutral",
};
const tone = (v: string) =>
  stageTones[v] ||
  (
    {
      图片: "orange",
      视频: "purple",
      文本: "green",
      音频: "blue",
      高风险: "red",
      中风险: "orange",
      低风险: "blue",
      无风险: "green",
    } as Record<string, string>
  )[v] ||
  "neutral";
const pastel = (v: string) => "platform-pastel tone-" + tone(v);
const flowColors = ["#76639e", "#97617f", "#ad644f", "#a76a3e", "#4f8064"];
const safe = (p: Promise<any>) => p.catch(() => undefined);
export const platformNames: Record<string, string> = {
  ...stageNames,
  CLOSE: "结项",
  LOST: "已终止",
};
const countNames: Record<string, string> = {
  ...platformNames,
  FORMAL_DELIVERY: "正式交付中",
  CUSTOMER_ACCEPTANCE: "客户验收中",
  SUPPLEMENT_DELIVERY: "补交付中",
  CLOSE: "结项中",
};
export const flowProgress = (b: Business) =>
  b.kind === "project"
    ? (
        {
          ESTABLISHED: 0,
          FORMAL_DELIVERY: 20,
          CUSTOMER_ACCEPTANCE: 40,
          SUPPLEMENT_DELIVERY: 40,
          INITIATE_CLOSE: 60,
          CLOSE: 80,
          CLOSED: 100,
        } as any
      )[b.stage] || 0
    : Math.max(0, OPPORTUNITY_STAGES.indexOf(b.stage)) * 33;
export const platformInfoEditable = (b: Business, user: any) =>
  user.role === "approver" || (user.role === "pm" && b.ownerId === user.id);
export const platformEditable = (b: Business, user: any) =>
  (user.role === "approver" || (user.role === "pm" && b.ownerId === user.id)) &&
  !b.completed &&
  b.stage !== "LOST";
const opts = (a: string[]) => a.map((x) => ({ label: x, value: x }));
const methods = ["对象存储", "CSV", "JSON", "Excel", "API", "其他"];
function DateValue({ value, onChange, disabled = false }: any) {
  return (
    <DatePicker
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange?.(d?.format("YYYY-MM-DD") || "")}
      disabled={disabled}
      style={{ width: "100%" }}
    />
  );
}
function People({
  value,
  onChange,
  multiple = false,
  disabled = false,
  placeholder = "请选择",
}: any) {
  const { state } = usePMC();
  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      mode={multiple ? "multiple" : undefined}
      allowClear
      showSearch
      optionFilterProp="label"
      disabled={disabled}
      placeholder={placeholder}
      options={state.users.map((u) => ({ label: u.name, value: u.id }))}
    />
  );
}
function PlatformFiles({ value = [], onChange }: any) {
  const { user, refresh } = usePMC();
  const { message } = App.useApp();
  const current = React.useRef<any[]>(value);
  React.useEffect(() => {
    current.current = value;
  }, [value]);
  const total = value.reduce((n: number, f: any) => n + f.size, 0);
  return (
    <div className="platform-upload">
      <div className="platform-upload-summary">
        <Space>
          <span>
            图片 {value.filter((f: any) => f.mime?.startsWith("image/")).length}
          </span>
          <span>
            文件{" "}
            {value.filter((f: any) => !f.mime?.startsWith("image/")).length}
          </span>
          <span>TOS 地址 0</span>
        </Space>
        <span>
          已上传 {value.length} / 10 个 ·{" "}
          {total < 1024 ? total + " B" : (total / 1024).toFixed(1) + " KB"}
        </span>
      </div>
      {!!value.length && (
        <List
          size="small"
          dataSource={value}
          renderItem={(f: any) => (
            <List.Item
              actions={[
                <Button
                  type="text"
                  size="small"
                  aria-label={"移除" + f.name}
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    onChange?.(value.filter((x: any) => x.id !== f.id))
                  }
                />,
              ]}
            >
              <Typography.Link href={"/api/files/" + f.id} target="_blank">
                {f.name}
              </Typography.Link>
            </List.Item>
          )}
        />
      )}
      <Upload.Dragger
        multiple
        showUploadList={false}
        beforeUpload={async (file) => {
          try {
            if (!file.size || file.size > 50 * 1024 * 1024)
              throw Error("文件须非空且单文件不超过50 MB");
            if (
              current.current.filter((f) => f.name !== file.name).length >= 10
            )
              throw Error("最多10个附件");
            const body = new FormData();
            body.append("file", file);
            const r = await fetch("/api/files", {
              method: "POST",
              headers: { "X-Actor": user.id },
              body,
            });
            const f = await r.json();
            if (!r.ok) throw Error(f.error);
            current.current = [
              ...current.current.filter((x) => x.name !== f.name),
              f,
            ];
            onChange?.(current.current);
            await refresh();
          } catch (e) {
            message.error((e as Error).message);
          }
          return false;
        }}
      >
        <div className="platform-upload-content">
          <UploadOutlined className="platform-upload-icon" />
          <div className="platform-upload-copy">
            <strong>点击选择，或将文件拖到这里</strong>
            <span>
              支持多文件上传；单文件 ≤ 50 MB，超大文件可添加 TOS 地址。
            </span>
          </div>
          <span className="platform-choose-file">选择文件</span>
        </div>
      </Upload.Dragger>
    </div>
  );
}
export function Storage({ value = [], onChange, disabled = false }: any) {
  return (
    <div className="platform-storage">
      <div className="platform-storage-heading">
        TOS 地址<span>（{value.length}）</span>
      </div>
      <div className="platform-storage-hint">
        已有存储地址，或超大文件，可使用{" "}
        <Typography.Link href="tosbrowser://tos">TOS Browser</Typography.Link>{" "}
        上传后添加地址。
      </div>
      {value.map((x: any, i: number) => (
        <Space.Compact block key={i} style={{ marginTop: 8 }}>
          <Input
            value={x.url}
            disabled={disabled}
            placeholder="tos://桶/路径 或 https://"
            onChange={(e) =>
              onChange?.(
                value.map((a: any, n: number) =>
                  n === i ? { ...a, url: e.target.value } : a,
                ),
              )
            }
          />
          {!disabled && (
            <Button
              onClick={() =>
                onChange?.(value.filter((_: any, n: number) => n !== i))
              }
            >
              删除
            </Button>
          )}
        </Space.Compact>
      ))}
      <div className="platform-storage-footer">
        {!disabled && (
          <Button
            icon={<PlusOutlined />}
            disabled={value.length >= 10}
            style={{ marginTop: 10 }}
            onClick={() => onChange?.([...value, { url: "", note: "" }])}
          >
            添加 TOS 地址
          </Button>
        )}
        <div className="muted">{value.length} / 10 条</div>
      </div>
    </div>
  );
}
function Attachments() {
  return (
    <Form.Item label="附件" className="platform-full-field">
      <div className="platform-attachments-panel">
        <Form.Item name="files" noStyle>
          <PlatformFiles />
        </Form.Item>
        <Form.Item name="addresses" noStyle>
          <Storage />
        </Form.Item>
      </div>
    </Form.Item>
  );
}
const projectCols = [
  "name",
  "customer",
  "pid",
  "linked",
  "types",
  "stage",
  "owner",
  "presales",
  "deadline",
  "initiation",
  "risk",
  "deliveryMethod",
  "progress",
  "actions",
];
const opportunityCols = [
  "name",
  "customer",
  "crm",
  "pid",
  "stage",
  "linked",
  "crmStage",
  "types",
  "demoStatus",
  "grade",
  "forecast",
  "presales",
  "sales",
  "createdAt",
  "target",
  "budget",
  "actions",
];
const info = (label: string, description?: string) => (
  <Space size={4}>
    {label}
    {description && (
      <Tooltip title={description}>
        <QuestionCircleOutlined style={{ fontSize: 12, color: "#8c8c8c" }} />
      </Tooltip>
    )}
  </Space>
);
export function PlatformBusinessList({
  kind,
}: {
  kind: "project" | "opportunity";
}) {
  const { state, user, command, busy } = usePMC();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { modal, message } = App.useApp();
  const [form] = Form.useForm();
  const [applied, setApplied] = useState<any>(
    params.has("pids") ? {} : { status: ["ongoing"] },
  );
  const [collapsed, setCollapsed] = useState(false);
  React.useEffect(() => setCollapsed(false), [kind]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draftCols, setDraftCols] = useState<string[]>([]);
  const [dragColumn, setDragColumn] = useState("");
  const [create, setCreate] = useState(false);
  const [createForm] = Form.useForm();
  const defaults = kind === "project" ? projectCols : opportunityCols;
  const stored = state.settings.processColumns?.[user.id + ":" + kind];
  const cols: string[] = stored?.includes("pid") ? stored : defaults;
  const pids = params.has("pids")
    ? params.get("pids")!.split(",").filter(Boolean)
    : null;
  const scope = state.businesses.filter(
    (b) => !pids || pids.includes(String(b.pid)),
  );
  const all = scope.filter((b) => b.kind === kind);
  React.useEffect(() => {
    if (params.has("pids")) {
      form.setFieldValue("status", []);
      setApplied((f: any) => ({ ...f, status: [] }));
    }
  }, [params.get("pids"), kind]);
  const person = (id?: string) =>
    state.users.find((u) => u.id === id)?.name || "-";
  const counterpart = (b: Business) =>
    state.businesses.find((x) => x.pid === b.pid && x.kind !== b.kind);
  const open = (b: Business, submit = false) => {
    const p = new URLSearchParams(params);
    [
      "task",
      "comment",
      "subtask",
      "chainId",
      "versionId",
      "nodeId",
      "scopeKey",
      "riskId",
      "riskView",
    ].forEach((key) => p.delete(key));
    p.set("detail", b.id);
    p.set("tab", b.kind === "project" && !submit ? "summary" : "workflow");
    if (submit) p.set("submit", "1");
    else p.delete("submit");
    p.set("detailIds", rows.map((x) => x.id).join(","));
    setParams(p);
  };
  const matches = (b: Business, ignoreStatus = false) => {
    const f = applied;
    const ongoing =
      !b.completed && !["LOST", "SUSPENDED", "CLOSED"].includes(b.stage);
    return (
      (!f.name || b.name.toLowerCase().includes(f.name.toLowerCase())) &&
      (!f.customer || b.customer.includes(f.customer)) &&
      (!f.pid || String(b.pid).includes(f.pid)) &&
      (!f.crm || b.crmId?.includes(f.crm)) &&
      (ignoreStatus ||
        !f.status?.length ||
        f.status.some((x: string) =>
          x === "ongoing"
            ? ongoing
            : x === "converted"
              ? b.kind === "opportunity" && b.completed && b.stage !== "LOST"
              : b.stage === x,
        )) &&
      (!f.types?.length ||
        f.types.some((x: string) => b.dataTypes.includes(x))) &&
      (!f.owner || b.ownerId === f.owner) &&
      (!f.presales || b.presalesId === f.presales) &&
      (!f.sales || b.salesId === f.sales) &&
      (!f.grade || b.grade === f.grade) &&
      (!f.risk || b.common.deliveryRisk === f.risk) &&
      (!f.method || b.common.deliveryMethod === f.method) &&
      (!f.projectStatus || (f.projectStatus === "yes") === !!counterpart(b)) &&
      (!f.range ||
        f.range === "all" ||
        (f.range === "mine" && b.ownerId === user.id) ||
        (f.range === "self" && b.common.selfCreated) ||
        (f.range === "crm" && !b.common.selfCreated)) &&
      (!f.crmStages?.length ||
        f.crmStages.includes(reportCrmStage(b) || "L1潜在商机")) &&
      (!f.deadline?.[0] ||
        (b.common.formalDeadline || b.deadline) >=
          f.deadline[0].format("YYYY-MM-DD")) &&
      (!f.deadline?.[1] ||
        (b.common.formalDeadline || b.deadline) <=
          f.deadline[1].format("YYYY-MM-DD")) &&
      (!f.created?.[0] ||
        b.createdAt.slice(0, 10) >= f.created[0].format("YYYY-MM-DD")) &&
      (!f.created?.[1] ||
        b.createdAt.slice(0, 10) <= f.created[1].format("YYYY-MM-DD"))
    );
  };
  const rows = all.filter((b) => matches(b));
  const statusOptions =
    kind === "project"
      ? [
          { label: "进行中", value: "ongoing" },
          ...PROJECT_STAGES.map((s) => ({ label: countNames[s], value: s })),
          { label: "已终止", value: "LOST" },
        ]
      : [
          { label: "进行中", value: "ongoing" },
          ...OPPORTUNITY_STAGES.map((s, i) => ({
            label: stageNames[s] + ["（L1-L2）", "（L3）", "（L4-L5）"][i],
            value: s,
          })),
          { label: "已发起项目", value: "converted" },
          { label: "已挂起", value: "SUSPENDED" },
          { label: "已终止", value: "LOST" },
        ];
  const allColumns: any = {
    name: {
      title: kind === "project" ? "项目名称" : "商机名称",
      width: kind === "project" ? 235 : 230,
      render: (_: any, b: Business) => (
        <Space>
          {kind === "opportunity" && b.common.selfCreated && (
            <Tooltip title="自建商机，非销售易同步">
              <span className="platform-self">自</span>
            </Tooltip>
          )}
          <span className="platform-primary-name">{b.name}</span>
        </Space>
      ),
    },
    customer: {
      title: "客户名称",
      dataIndex: "customer",
      width: kind === "project" ? 125 : 150,
    },
    pid: {
      title: "PID",
      width: 110,
      render: (_: any, b: Business) =>
        kind === "project" ? (
          <Button type="link" size="small" onClick={() => open(b)}>
            {b.pid}
          </Button>
        ) : counterpart(b) ? (
          <Button
            type="link"
            onClick={() => navigate("/projects?detail=" + counterpart(b)!.id)}
          >
            {b.pid}
          </Button>
        ) : (
          b.pid
        ),
    },
    crm: {
      title: info("销售易商机", "销售易关联商机编号"),
      width: 145,
      render: (_: any, b: Business) =>
        b.common.selfCreated ? (
          "-"
        ) : (
          <Typography.Link
            onClick={() =>
              message.info("本地演示保留销售易编号，不连接真实CRM")
            }
          >
            {b.crmId}
          </Typography.Link>
        ),
    },
    linked: {
      title: info(
        kind === "project" ? "关联商机" : "项目名称",
        "同一PID的关联业务",
      ),
      width: 220,
      render: (_: any, b: Business) => {
        const x = counterpart(b);
        return x ? (
          <Button
            type="link"
            size="small"
            onClick={() =>
              navigate(
                (x.kind === "project" ? "/projects" : "/opportunities") +
                  "?detail=" +
                  x.id,
              )
            }
          >
            {x.name}
          </Button>
        ) : (
          "-"
        );
      },
    },
    types: {
      title: "数据类型",
      sorter: (a: Business, b: Business) =>
        a.dataTypes.join("、").localeCompare(b.dataTypes.join("、"), "zh-CN"),
      width: 140,
      render: (_: any, b: Business) => (
        <Tooltip title={b.dataTypes.join("、")}>
          <span>
            <Tag className={pastel(b.dataTypes[0])}>
              {b.dataTypes[0] || "-"}
            </Tag>
            {b.dataTypes.length > 1 && (
              <Tag
                className="platform-pastel tone-neutral"
                style={{ marginLeft: 4 }}
              >
                +{b.dataTypes.length - 1}
              </Tag>
            )}
          </span>
        </Tooltip>
      ),
    },
    stage: {
      sorter: (a: Business, b: Business) =>
        (kind === "project" ? PROJECT_STAGES : OPPORTUNITY_STAGES).indexOf(
          a.stage,
        ) -
        (kind === "project" ? PROJECT_STAGES : OPPORTUNITY_STAGES).indexOf(
          b.stage,
        ),
      title: info(kind === "project" ? "项目状态" : "商机状态", "当前流程节点"),
      width: kind === "project" ? 125 : 170,
      render: (_: any, b: Business) => (
        <Tag className={pastel(b.stage)}>
          {b.kind === "opportunity" && b.completed && b.stage !== "LOST"
            ? "已发起项目"
            : b.kind === "opportunity" && OPPORTUNITY_STAGES.includes(b.stage)
              ? stageNames[b.stage] +
                ["（L1-L2）", "（L3）", "（L4-L5）"][
                  OPPORTUNITY_STAGES.indexOf(b.stage)
                ]
              : platformNames[b.stage]}
        </Tag>
      ),
    },
    owner: {
      title: info("项目经理", "本系统流程中指定的项目经理"),
      width: 125,
      render: (_: any, b: Business) => person(b.ownerId),
    },
    presales: {
      title: info("售前负责人", "商机或项目售前负责人"),
      width: 130,
      render: (_: any, b: Business) => person(b.presalesId),
    },
    sales: {
      title: info("销售负责人", "销售易或本系统销售负责人"),
      width: 140,
      render: (_: any, b: Business) => person(b.salesId),
    },
    deadline: {
      title: info("正式交付截止时间", "公共信息中的正式交付截止日期"),
      width: 180,
      render: (_: any, b: Business) =>
        b.common.formalDeadline || b.deadline || "-",
    },
    initiation: {
      title: "立项时间",
      width: 120,
      sorter: (a: Business, b: Business) =>
        a.createdAt.localeCompare(b.createdAt),
      render: (_: any, b: Business) => b.createdAt.slice(0, 10),
    },
    createdAt: {
      title: info("商机创建时间", "商机首次创建时间"),
      width: 175,
      sorter: (a: Business, b: Business) =>
        a.createdAt.localeCompare(b.createdAt),
      render: (_: any, b: Business) =>
        dayjs(b.createdAt).format("YYYY-MM-DD HH:mm"),
    },
    risk: {
      title: info("预计交付风险", "业务跟进记录中的人工风险等级"),
      width: 145,
      render: (_: any, b: Business) => b.common.deliveryRisk || "-",
    },
    deliveryMethod: {
      title: "交付方式",
      width: 105,
      render: (_: any, b: Business) => b.common.deliveryMethod || "-",
    },
    progress: {
      title: info("进度", "流程节点完成进度"),
      width: 150,
      render: (_: any, b: Business) => (
        <Progress percent={flowProgress(b)} size="small" />
      ),
    },
    crmStage: {
      title: info("销售易商机阶段", "销售易同步的阶段"),
      width: 175,
      render: (_: any, b: Business) =>
        b.common.selfCreated
          ? "-"
          : b.common.crmStage || b.common.salesStatus || "L1潜在商机",
    },
    demoStatus: {
      title: info("Demo状态", "最近一次Demo反馈"),
      width: 120,
      render: (_: any, b: Business) => {
        const r =
          b.common.platformFlowForms?.DEMO_FEEDBACK?.at(-1)?.result ||
          b.common.flowForms?.DEMO_FEEDBACK?.result;
        return r === "pass" || b.stage === "INITIATE_PROJECT" ? (
          <Tag color="green">已通过</Tag>
        ) : r === "fail" ? (
          <Tag color="red">未通过</Tag>
        ) : (
          "-"
        );
      },
    },
    grade: {
      title: info("商机分级", "商机分类"),
      width: 125,
      render: (_: any, b: Business) =>
        b.grade === "UNRATED" ? "未分级" : b.grade + "商机",
    },
    forecast: {
      title: info("预测", "销售预测"),
      width: 100,
      render: (_: any, b: Business) => b.common.forecast || "-",
    },
    target: {
      title: "数据规模",
      width: 120,
      render: (_: any, b: Business) =>
        b.common.dataScale || b.common.demoScale || b.target || "-",
    },
    budget: {
      title: "预算",
      width: 130,
      render: (_: any, b: Business) => (b.budget ? money(b.budget) : "-"),
    },
    actions: {
      title: "操作",
      width: kind === "project" ? 180 : 150,
      fixed: "right",
      render: (_: any, b: Business) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => open(b)}
          >
            {kind === "project" ? "详情" : "查看"}
          </Button>
          {kind === "project" && (
            <Button
              type="link"
              size="small"
              icon={<SendOutlined />}
              disabled={!platformEditable(b, user)}
              onClick={() => open(b, true)}
            >
              去提交
            </Button>
          )}
        </Space>
      ),
    },
  };
  allColumns.risk.render = (_: any, b: Business) => {
    const r = b.common.deliveryRisk;
    return r ? <Tag className={pastel(r)}>{r}</Tag> : "-";
  };
  const field = (
    name: string,
    label: string,
    control: React.ReactNode,
    required = false,
  ) => (
    <Form.Item
      name={name}
      label={label}
      key={name}
      rules={required ? [{ required: true }] : []}
    >
      {control}
    </Form.Item>
  );
  const filterFields =
    kind === "project"
      ? [
          field("name", "项目名称", <Input placeholder="请输入项目名称" />),
          field("customer", "客户名称", <Input placeholder="请输入客户名称" />),
          field("pid", "PID", <Input placeholder="请输入 PID" />),
          field("crm", "来源商机", <Input placeholder="请输入来源商机编号" />),
          field(
            "status",
            "项目状态",
            <Select mode="multiple" options={statusOptions} />,
          ),
          field(
            "types",
            "数据类型",
            <Select
              mode="multiple"
              options={opts(DATA_TYPES)}
              placeholder="请选择数据类型（可多选）"
            />,
          ),
          field(
            "owner",
            "项目经理",
            <People placeholder="搜索并选择项目经理" />,
          ),
          field(
            "presales",
            "售前负责人",
            <People placeholder="搜索并选择售前负责人" />,
          ),
          field(
            "sales",
            "销售负责人",
            <People placeholder="搜索并选择销售负责人" />,
          ),
          field(
            "risk",
            "预计交付风险",
            <Select
              allowClear
              options={opts(["无风险", "低风险", "中风险", "高风险"])}
              placeholder="请选择交付风险"
            />,
          ),
          field(
            "method",
            "交付方式",
            <Select
              allowClear
              options={opts(methods)}
              placeholder="请选择交付方式"
            />,
          ),
          field("deadline", "正式交付截止", <DatePicker.RangePicker />),
          field("created", "立项时间", <DatePicker.RangePicker />),
        ]
      : [
          field("name", "商机名称", <Input placeholder="请输入商机名称" />),
          field(
            "status",
            "商机状态",
            <Select mode="multiple" options={statusOptions} />,
          ),
          field(
            "projectStatus",
            "转项目状态",
            <Select
              allowClear
              options={[
                { label: "已转项目", value: "yes" },
                { label: "未转项目", value: "no" },
              ]}
              placeholder="请选择转项目状态"
            />,
          ),
          field(
            "range",
            "数据范围",
            <Select
              allowClear
              options={[
                { label: "全部商机", value: "all" },
                { label: "我负责的", value: "mine" },
                { label: "非销售易商机", value: "self" },
                { label: "销售易商机", value: "crm" },
              ]}
              placeholder="请选择数据范围"
            />,
          ),
          field("customer", "客户名称", <Input placeholder="请输入客户名称" />),
          field("crm", "商机编号", <Input placeholder="请输入商机编号" />),
          field(
            "crmStages",
            "销售易状态",
            <Select
              mode="multiple"
              options={opts([
                "L1潜在商机",
                "L2活跃商机",
                "L3需求验证",
                "L4方案验证",
                "L5商务谈判",
                "赢单",
                "输单",
              ])}
              placeholder="请选择销售易状态（可多选）"
            />,
          ),
          field(
            "types",
            "数据类型",
            <Select
              mode="multiple"
              options={opts(DATA_TYPES)}
              placeholder="请选择数据类型（可多选）"
            />,
          ),
          field("created", "创建时间", <DatePicker.RangePicker />),
          field("deadline", "预计交付", <DatePicker.RangePicker />),
          field("pid", "PID", <Input placeholder="请输入 PID" />),
          field(
            "grade",
            "商机分级",
            <Select
              allowClear
              options={[
                { label: "A商机", value: "A" },
                { label: "B商机", value: "B" },
                { label: "未分级", value: "UNRATED" },
              ]}
            />,
          ),
          field(
            "presales",
            "售前负责人",
            <People placeholder="搜索并选择售前负责人" />,
          ),
          field(
            "sales",
            "销售负责人",
            <People placeholder="搜索并选择销售负责人" />,
          ),
          field(
            "owner",
            "项目经理",
            <People placeholder="搜索并选择项目经理" />,
          ),
        ];
  return (
    <div className="platform-business-list">
      <Form
        form={form}
        className="platform-filter-surface"
        layout="horizontal"
        colon={false}
        initialValues={params.has("pids") ? {} : { status: ["ongoing"] }}
        onFinish={setApplied}
      >
        <div className="platform-filters">
          {collapsed ? (
            filterFields.slice(0, 4)
          ) : kind === "project" ? (
            <>
              {filterFields.slice(0, 11)}
              <div className="platform-filter-dates">
                {filterFields.slice(11)}
              </div>
            </>
          ) : (
            <>
              {filterFields.slice(0, 8)}
              <div className="platform-filter-dates">
                {filterFields.slice(8, 10)}
              </div>
              {filterFields.slice(10)}
            </>
          )}
        </div>
        <div className="platform-filter-footer">
          {pids && (
            <Space wrap size={4} className="platform-scope-inline">
              已限定范围：项目{" "}
              {scope.filter((x) => x.kind === "project").length} / 商机{" "}
              {scope.filter((x) => x.kind === "opportunity").length}
              <Button
                size="small"
                onClick={() =>
                  navigate(
                    (kind === "project" ? "/opportunities" : "/projects") +
                      "?pids=" +
                      pids.join(","),
                  )
                }
              >
                切换到{kind === "project" ? "商机" : "项目"}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.delete("pids");
                  setParams(p);
                }}
              >
                清除下钻
              </Button>
              <Button size="small" onClick={() => navigate("/management")}>
                返回驾驶舱
              </Button>
            </Space>
          )}
          {kind === "project" ? (
            <div className="platform-stage-counts">
              {PROJECT_STAGES.map((s) => (
                <Button
                  key={s}
                  className="platform-stage-shortcut"
                  aria-pressed={!!applied.status?.includes(s)}
                  size="small"
                  onClick={() => {
                    form.setFieldValue("status", [s]);
                    setApplied({ ...form.getFieldsValue(), status: [s] });
                  }}
                >
                  <Tag className={pastel(s)}>
                    {countNames[s]}{" "}
                    <strong>
                      {
                        all.filter((b) => matches(b, true) && b.stage === s)
                          .length
                      }
                    </strong>
                  </Tag>
                </Button>
              ))}
            </div>
          ) : (
            <Space className="platform-opportunity-actions">
              <Button
                icon={<CloudSyncOutlined />}
                disabled={user.role === "viewer"}
                onClick={() =>
                  modal.confirm({
                    title: "同步销售易",
                    content: "本地使用虚构数据进行模拟同步，不连接真实销售易。",
                    onOk: () => command("process.sync", {}),
                  })
                }
              >
                同步销售易
              </Button>
              <Button
                icon={<PlusOutlined />}
                disabled={user.role === "viewer"}
                onClick={() =>
                  modal.confirm({
                    title: "新增非销售易商机确认",
                    content: (
                      <>
                        <p>此功能仅用于特殊无销售易 ID 项目的商机录入。</p>
                        <p>例如：字节、苹果等无销售易商机的项目。</p>
                        <p>
                          其余项目请点击“同步销售易”按钮，或等待系统自动同步。非必要请勿使用此功能，否则会影响项目正常跟进。
                        </p>
                      </>
                    ),
                    okText: "确认",
                    cancelText: "取消",
                    onOk: () => {
                      createForm.resetFields();
                      setCreate(true);
                    },
                  })
                }
              >
                非销售易商机
              </Button>
            </Space>
          )}
          <Space
            className={
              "platform-filter-tools " +
              (kind === "opportunity"
                ? "platform-filter-tools-opportunity"
                : "")
            }
          >
            <Popover
              title={
                <Space>
                  列设置
                  <Button type="link" onClick={() => setDraftCols(defaults)}>
                    恢复默认
                  </Button>
                </Space>
              }
              open={columnsOpen}
              onOpenChange={(o) => {
                setColumnsOpen(o);
                if (o) setDraftCols(cols);
              }}
              trigger="click"
              content={
                <div className="platform-column-settings">
                  {[
                    ...draftCols.filter((k) => k !== "actions"),
                    ...defaults.filter(
                      (k) => !draftCols.includes(k) && k !== "actions",
                    ),
                  ]
                    .filter((k) => k !== "actions")
                    .map((k) => (
                      <div
                        key={k}
                        draggable={k !== "name" && draftCols.includes(k)}
                        onDragStart={() => setDragColumn(k)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (k === "name" || !dragColumn || dragColumn === k)
                            return;
                          const next = draftCols.filter(
                            (x) => x !== dragColumn,
                          );
                          next.splice(next.indexOf(k), 0, dragColumn);
                          setDraftCols(next);
                          setDragColumn("");
                        }}
                      >
                        <Checkbox
                          checked={draftCols.includes(k)}
                          disabled={k === "name"}
                          onChange={(e) =>
                            setDraftCols(
                              e.target.checked
                                ? [
                                    ...draftCols.filter((x) => x !== "actions"),
                                    k,
                                    "actions",
                                  ]
                                : draftCols.filter((x) => x !== k),
                            )
                          }
                        >
                          {allColumns[k].title}
                        </Checkbox>
                        {k === "name" && <Tag>固定</Tag>}
                        {k !== "name" && (
                          <Space>
                            <Button
                              size="small"
                              icon={<ArrowUpOutlined />}
                              disabled={
                                !draftCols.includes(k) ||
                                draftCols.indexOf(k) < 2
                              }
                              onClick={() => {
                                const a = [...draftCols],
                                  i = a.indexOf(k);
                                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                                setDraftCols(a);
                              }}
                            />
                            <Button
                              size="small"
                              icon={<ArrowDownOutlined />}
                              disabled={
                                !draftCols.includes(k) ||
                                draftCols.indexOf(k) >= draftCols.length - 2
                              }
                              onClick={() => {
                                const a = [...draftCols],
                                  i = a.indexOf(k);
                                [a[i + 1], a[i]] = [a[i], a[i + 1]];
                                setDraftCols(a);
                              }}
                            />
                          </Space>
                        )}
                      </div>
                    ))}
                  <Divider />
                  <Space>
                    <Button onClick={() => setColumnsOpen(false)}>取消</Button>
                    <Button
                      type="primary"
                      onClick={() =>
                        safe(
                          command("process.columns", {
                            kind,
                            columns: draftCols,
                          }).then(() => setColumnsOpen(false)),
                        )
                      }
                    >
                      应用
                    </Button>
                  </Space>
                </div>
              }
            >
              <Button aria-label="列设置" icon={<SettingOutlined />} />
            </Popover>
            <Button onClick={() => navigate("/reports?kind=" + kind)}>
              生成报表
            </Button>
          </Space>
          <span className="platform-filter-spacer" />
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                form.resetFields();
                setApplied({ status: ["ongoing"] });
              }}
            >
              重置
            </Button>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询
            </Button>
            <Button
              type="link"
              icon={collapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? "展开" : "收起"}
            </Button>
          </Space>
        </div>
      </Form>
      <Table
        className="platform-table-surface"
        size="small"
        rowKey="id"
        dataSource={rows}
        columns={cols
          .filter((k) => allColumns[k])
          .map((k) => ({ ...allColumns[k], key: k }))}
        scroll={{ x: kind === "project" ? 2090 : 2395 }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (n) => "共 " + n + " 条",
        }}
      />
      <Drawer
        className="platform-form-drawer platform-create-drawer"
        title="新增非销售易商机"
        open={create}
        width={860}
        onClose={() => setCreate(false)}
        footer={
          <div className="platform-create-footer">
            <Button
              onClick={() =>
                createForm.setFieldsValue({
                  name: "星澜多模态演示商机（虚构）",
                  customer: "星澜科技（虚构）",
                  dataTypes: ["图片", "文本"],
                  description: "虚构需求：采集和标注多模态数据。",
                  clarification: "虚构确认：范围、标准及验收方式已记录。",
                  requirementUrl: "https://example.invalid/requirements/demo",
                  presalesId: "u6",
                  ownerId: user.id,
                  grade: "A",
                  nature: "需求承接",
                  demoDeadline: dayjs().add(7, "day").format("YYYY-MM-DD"),
                  demoScale: 1000,
                })
              }
            >
              填入测试数据
            </Button>
            <Space>
              <Button onClick={() => setCreate(false)}>取消</Button>
              <Button
                type="primary"
                loading={busy}
                onClick={() =>
                  safe(
                    createForm
                      .validateFields()
                      .then((v) =>
                        command("process.create", {
                          ...v,
                          budget: 0,
                          deadline: v.demoDeadline,
                        }),
                      )
                      .then((r) => {
                        setCreate(false);
                        navigate("/opportunities?detail=" + r.businessId);
                      }),
                  )
                }
              >
                创建商机
              </Button>
            </Space>
          </div>
        }
      >
        <Alert
          type="info"
          showIcon
          message="本表单用于创建无销售易编号的自建商机。已有销售易编号的商机，请通过“同步销售易”导入。"
        />
        <Form form={createForm} layout="vertical">
          <section className="platform-create-section">
            <header>
              <FileTextOutlined />
              <h3>基础信息</h3>
            </header>
            <div className="platform-form-grid">
              {field("name", "项目名称", <Input />, true)}
              {field(
                "customer",
                "公司名称",
                <Select
                  placeholder="请选择公司名称"
                  options={opts([
                    ...new Set(state.businesses.map((x) => x.customer)),
                  ])}
                />,
                true,
              )}
              <Form.Item
                className="platform-full-field"
                name="dataTypes"
                label="数据类型"
                rules={[{ required: true }]}
              >
                <Select
                  mode="multiple"
                  placeholder="请选择数据类型，可多选"
                  options={opts(DATA_TYPES)}
                />
              </Form.Item>
            </div>
            <Form.Item
              name="description"
              label="需求描述"
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={4} placeholder="填写业务需求详情" />
            </Form.Item>
            <Form.Item
              name="clarification"
              label="需求澄清记录"
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={3} placeholder="记录沟通澄清内容" />
            </Form.Item>
            <Form.Item
              name="requirementUrl"
              label="需求文档"
              rules={[{ required: true }, { type: "url" }]}
            >
              <Input
                placeholder="请输入以 http:// 或 https:// 开头的完整文档链接（最多2000字符）"
                maxLength={2000}
              />
            </Form.Item>
          </section>
          <section className="platform-create-section">
            <header>
              <TeamOutlined />
              <h3>人员信息</h3>
            </header>
            <div className="platform-form-grid">
              {["presalesId", "ownerId", "salesId", "developerId"].map(
                (k, i) => (
                  <Form.Item
                    key={k}
                    name={k}
                    label={["售前", "项目经理", "销售", "研发"][i]}
                    rules={i < 2 ? [{ required: true }] : []}
                  >
                    <People placeholder="" />
                  </Form.Item>
                ),
              )}
            </div>
          </section>
          <section className="platform-create-section">
            <header>
              <ExperimentOutlined />
              <h3>Demo 信息</h3>
            </header>
            <div className="platform-form-grid">
              <Form.Item
                name="demoDeadline"
                label="Demo交付截止时间"
                rules={[{ required: true }]}
              >
                <DateValue />
              </Form.Item>
              <Form.Item
                name="demoScale"
                label="Demo需求量级"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </div>
            <Form.Item name="demoStorage" label="Demo存储地址">
              <Input />
            </Form.Item>
          </section>
          <section className="platform-create-section">
            <header>
              <TagsOutlined />
              <h3>商机属性</h3>
            </header>
            <div className="platform-form-grid">
              <Form.Item
                name="grade"
                label="商机分类"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: "A商机", value: "A" },
                    { label: "B商机", value: "B" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="nature"
                label="商机性质"
                rules={[{ required: true }]}
              >
                <Select options={opts(["需求承接", "主动推荐"])} />
              </Form.Item>
              <Form.Item name="formalDeadline" label="正式交付截止时间">
                <DateValue />
              </Form.Item>
            </div>
          </section>
        </Form>
      </Drawer>
    </div>
  );
}
export function PlatformCore({
  business: b,
  onBaseEdit,
}: {
  business: Business;
  onBaseEdit?: () => void;
}) {
  const { state, user } = usePMC();
  const navigate = useNavigate();
  const person = (id?: string) =>
    state.users.find((u) => u.id === id)?.name || "-";
  const linked = state.businesses.find(
    (x) => x.pid === b.pid && x.kind !== b.kind,
  );
  const item = (label: string, value: React.ReactNode) => (
    <div className="platform-core-cell" key={label}>
      <i className="platform-core-icon">
        {(
          {
            客户名称: <BankOutlined />,
            预计金额: <DollarOutlined />,
            预期交付时间: <CalendarOutlined />,
            销售易商机阶段: <CalendarOutlined />,
            商机分级: <IdcardOutlined />,
            数据类型: <IdcardOutlined />,
            项目经理: <UserOutlined />,
            当前节点: <ProjectOutlined />,
            正式交付截止时间: <CalendarOutlined />,
            项目进度: <BarChartOutlined />,
            需求描述: <FileTextOutlined />,
            需求澄清记录: <FileTextOutlined />,
          } as Record<string, React.ReactNode>
        )[label] || <UserOutlined />}
      </i>
      <div className="platform-core-text">
        <span>{label}</span>
        <strong>{value || "-"}</strong>
      </div>
    </div>
  );
  return (
    <section className="platform-core" aria-label="核心信息">
      <div className="platform-core-title">
        <div className="platform-core-identity">
          <h2>
            {b.common.selfCreated && b.kind === "opportunity" && (
              <span className="platform-self">自</span>
            )}
            {b.name}
          </h2>
          <Space>
            <span className="platform-id">
              PID <b>{b.pid}</b>
            </span>
            <span className="platform-id">
              {b.kind === "project" ? "立项编号" : "商机编号"}{" "}
              <b>
                {b.kind === "project"
                  ? b.common.projectInitiationCode || "-"
                  : b.crmId}
              </b>
            </span>
            {b.kind === "opportunity" && b.common.selfCreated && (
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!platformInfoEditable(b, user)}
                onClick={onBaseEdit}
              >
                编辑基础信息
              </Button>
            )}
          </Space>
        </div>
        <Space className="platform-status-actions">
          <Tag className={pastel(b.stage)}>
            {b.kind === "opportunity" && OPPORTUNITY_STAGES.includes(b.stage)
              ? platformNames[b.stage] +
                ["（L1-L2）", "（L3）", "（L4-L5）"][
                  OPPORTUNITY_STAGES.indexOf(b.stage)
                ]
              : platformNames[b.stage]}
          </Tag>
          {linked && (
            <Button
              type="link"
              icon={<LinkOutlined />}
              onClick={() =>
                navigate(
                  (linked.kind === "project" ? "/projects" : "/opportunities") +
                    "?detail=" +
                    linked.id,
                )
              }
            >
              {linked.kind === "project" ? "关联项目" : "来源商机"}
            </Button>
          )}
        </Space>
      </div>
      <div
        className={
          "platform-core-grid " +
          (b.kind === "project" ? "project" : "opportunity")
        }
      >
        {b.kind === "project" ? (
          <>
            {item("数据类型", b.dataTypes.join("、"))}
            {item("项目经理", person(b.ownerId))}
            {item(
              "当前节点",
              <Space>
                {platformNames[b.stage]}
                <Tag className={pastel(b.common.deliveryRisk || "未记录")}>
                  {b.common.deliveryRisk || "未记录"}
                </Tag>
              </Space>,
            )}
            {item("正式交付截止时间", b.common.formalDeadline || b.deadline)}
            {item(
              "项目进度",
              <Progress percent={flowProgress(b)} size="small" />,
            )}
          </>
        ) : (
          <>
            {item("客户名称", b.customer)}
            {item("数据类型", b.dataTypes.join("、"))}
            {item(
              "销售易商机阶段",
              b.common.selfCreated
                ? "-"
                : b.common.crmStage || b.common.salesStatus || "L1潜在商机",
            )}
            {item(
              "商机分级",
              b.grade === "UNRATED" ? "未分级" : b.grade + "商机",
            )}
            {item("销售负责人", person(b.salesId))}
            {item("售前负责人", person(b.presalesId))}
            {item("预计金额", b.budget ? money(b.budget) : "-")}
            {item("预期交付时间", b.common.formalDeadline || b.deadline)}
          </>
        )}
      </div>
      <div className="platform-core-description">
        {item("需求描述", b.description)}
        {item("需求澄清记录", b.clarification)}
      </div>
      {b.kind === "project" && (
        <div className="platform-core-storage">
          <i className="platform-core-icon">
            <LinkOutlined />
          </i>
          <div className="platform-delivery-content">
            <span>正式交付存储地址</span>
            <Typography.Text copyable={!!b.common.formalDeliveryStorage}>
              {b.common.formalDeliveryStorage || "-"}
            </Typography.Text>
          </div>
        </div>
      )}
    </section>
  );
}
export function PlatformDetailed({ business: b }: { business: Business }) {
  const { state } = usePMC();
  const person = (id?: string) =>
    state.users.find((u) => u.id === id)?.name || "-";
  const linked = state.businesses.find(
    (x) => x.pid === b.pid && x.kind !== b.kind,
  );
  const values =
    b.kind === "project"
      ? [
          ["来源商机", linked?.crmId || "-"],
          ["来源商机名称", linked?.name || "-"],
          ["数据类型", b.dataTypes.join("、")],
          ["售前负责人", person(b.presalesId)],
          ["销售负责人", person(b.salesId)],
          ["交付方式", b.common.deliveryMethod || "-"],
          ["立项时间", b.createdAt.slice(0, 10)],
          ["当前进度", flowProgress(b) + "%"],
        ]
      : [
          ["销售易商机编号", b.common.selfCreated ? "-" : b.crmId],
          ["客户名称", b.customer],
          ["项目中枢状态", platformNames[b.stage]],
          [
            "销售易阶段",
            b.common.selfCreated
              ? "-"
              : b.common.crmStage || b.common.salesStatus || "L1潜在商机",
          ],
          ["商机分级", b.grade === "UNRATED" ? "未分级" : b.grade + "商机"],
          ["数据类型", b.dataTypes.join("、")],
          ["数据规模", String(b.common.demoScale || b.target || "-")],
          ["预计金额", b.budget ? money(b.budget) : "-"],
          ["售前负责人", person(b.presalesId)],
          ["销售负责人", person(b.salesId)],
          [
            "Demo状态",
            b.stage === "INITIATE_PROJECT" || b.completed ? "已通过" : "-",
          ],
          ["预测", b.common.forecast || "-"],
          ["关联项目状态", linked ? platformNames[linked.stage] : "-"],
          ["是否已转项目", linked ? "是" : "否"],
        ];
  return (
    <div className="platform-information">
      <Descriptions
        bordered
        column={3}
        size="middle"
        items={values.map(([label, value]) => ({
          key: label,
          label,
          children: value || "-",
        }))}
      />
    </div>
  );
}
export function PlatformCommon({ business: b }: { business: Business }) {
  const { user, command, busy } = usePMC();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const project = b.kind === "project";
  const labels: Record<string, string> = {
    projectInitiationCode: "项目立项编号",
    name: "项目名称",
    dataTypes: "数据类型",
    nature: "商机性质",
    requirementUrl: "需求文档",
    productionPlan: "生产方案",
    formalDeadline: "正式交付截止时间",
    formalScale: "正式交付量级",
    deliveryMethod: "交付方式",
    projectManagementDoc: "项目管理文档",
  };
  const keys = project
    ? [
        "projectInitiationCode",
        "name",
        "requirementUrl",
        "productionPlan",
        "formalDeadline",
        "formalScale",
        "deliveryMethod",
        "projectManagementDoc",
      ]
    : [
        "dataTypes",
        "nature",
        "requirementUrl",
        "formalDeadline",
        "formalScale",
        "deliveryMethod",
      ];
  const value = (k: string) =>
    k === "name"
      ? b.name
      : k === "dataTypes"
        ? b.dataTypes.join("、")
        : k === "requirementUrl"
          ? b.requirementUrl
          : k === "formalDeadline"
            ? b.common.formalDeadline || (project ? b.deadline : "")
            : k === "formalScale"
              ? b.common.formalScale || (project ? String(b.target) : "")
              : b.common[k];
  return (
    <>
      <Card
        className="platform-common-card"
        title={project ? "项目公共信息" : "商机公共信息"}
        extra={
          <Button
            type="link"
            icon={<EditOutlined />}
            disabled={!platformInfoEditable(b, user)}
            onClick={() => {
              form.setFieldsValue(
                Object.fromEntries(
                  keys.map((k) => [
                    k,
                    k === "dataTypes" ? b.dataTypes : value(k),
                  ]),
                ),
              );
              setOpen(true);
            }}
          >
            编辑
          </Button>
        }
      >
        <div className="platform-common-grid">
          {keys.map((k) => (
            <div key={k}>
              <span>{labels[k]}</span>
              <strong>
                {k === "requirementUrl" && value(k) ? (
                  <Typography.Link href={value(k)} target="_blank">
                    {value(k)}
                  </Typography.Link>
                ) : (
                  value(k) || "-"
                )}
              </strong>
            </div>
          ))}
        </div>
      </Card>
      <Drawer
        className="platform-form-drawer"
        title={project ? "项目公共信息" : "商机公共信息"}
        open={open}
        width={640}
        onClose={() => setOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={busy}
              onClick={() =>
                safe(
                  form
                    .validateFields()
                    .then((v) =>
                      command("process.platformUpdate", {
                        businessId: b.id,
                        version: b.version,
                        requirementUrl: v.requirementUrl,
                        ...(!project ? { dataTypes: v.dataTypes } : {}),
                        common: Object.fromEntries(
                          keys
                            .filter(
                              (k) =>
                                ![
                                  "name",
                                  "dataTypes",
                                  "requirementUrl",
                                ].includes(k),
                            )
                            .map((k) => [k, v[k] || ""]),
                        ),
                      }),
                    )
                    .then(() => setOpen(false)),
                )
              }
            >
              保存公共信息
            </Button>
          </Space>
        }
      >
        {!project && (
          <Alert
            message="支持信息不全时保存，但发起项目前都需要填写完整哦~"
            type="info"
            style={{ marginBottom: 20 }}
          />
        )}
        <Form layout="vertical" form={form} className="platform-public-form">
          <div className="platform-drawer-grid">
            {keys
              .filter((k) => k !== "name")
              .map((k) => (
                <Form.Item
                  key={k}
                  className={
                    [
                      "requirementUrl",
                      "productionPlan",
                      "projectManagementDoc",
                    ].includes(k)
                      ? "platform-full-field"
                      : k === "projectInitiationCode"
                        ? "platform-initiation-field"
                        : ""
                  }
                  name={k}
                  label={labels[k]}
                  extra={
                    ["productionPlan", "projectManagementDoc"].includes(k)
                      ? "请输入文本"
                      : undefined
                  }
                  rules={
                    k === "requirementUrl"
                      ? [{ type: "url", message: "请输入http(s)地址" }]
                      : []
                  }
                >
                  {k === "dataTypes" ? (
                    <Select mode="multiple" options={opts(DATA_TYPES)} />
                  ) : k === "nature" ? (
                    <Select options={opts(["需求承接", "主动推荐"])} />
                  ) : k === "deliveryMethod" ? (
                    <Select allowClear options={opts(methods)} />
                  ) : k === "formalDeadline" ? (
                    <DateValue />
                  ) : k === "productionPlan" ? (
                    <Input.TextArea rows={4} placeholder="请输入生产方案" />
                  ) : k === "projectManagementDoc" ? (
                    <Input placeholder="请输入文档地址" />
                  ) : (
                    <Input />
                  )}
                </Form.Item>
              ))}
          </div>
        </Form>
      </Drawer>
    </>
  );
}
const lossReasons: Record<string, string[]> = {
  "产品/能力原因": [
    "功能不满足客户核心需求",
    "产品稳定性/体验问题",
    "不支持API/对接/集成",
    "合规/安全不满足",
    "与竞品差距明显",
    "交付周期太长",
    "不支持定制化需求",
  ],
  "价格/商务原因": [
    "超出客户预算",
    "性价比不足",
    "竞品价格更低",
    "付款方式不支持(账期/分期/开票)",
    "客户预算削减/冻结",
    "商务条款无法达成共识",
  ],
  资源原因: ["无相关资源", "有相关资源,但数量不满足"],
  竞品对手赢单: [
    "竞品价格更低",
    "客户已选定竞品",
    "竞品关系更深/长期合作",
    "竞品功能更贴合",
    "竞品方案更完整",
    "竞品介入更早",
  ],
  "需求/时机原因": [
    "客户暂无真实采购计划",
    "项目暂停/延期",
    "需求发生变化",
    "内部优先级下降",
    "客户自己内部可解决",
    "只是比价/测试",
  ],
  客户决策原因: [
    "决策链复杂,无法触达关键人",
    "关键人变更",
    "多部门意见不统一",
    "内部流程卡死(财务/法务/IT)",
    "决策周期过长",
  ],
  "销售动作/服务原因": [
    "跟进不及时/断联",
    "需求理解错误",
    "解决方案不到位",
    "未触达真正决策人",
    "售前支持不足",
    "演示/测试效果差",
    "客情关系薄弱",
  ],
  "商机本身无效(假商机)": [
    "线索质量差",
    "无预算、无决策人、无时间",
    "仅调研/比价",
    "商机录入不规范",
  ],
};
function ReadonlySubmission({
  stage,
  value: v,
}: {
  stage: string;
  value: any;
}) {
  const { state } = usePMC();
  const userName = (id: any) =>
    state.users.find((u) => u.id === id)?.name || id || "-";
  const labels: Record<string, string> = {
    ownerId: "项目经理",
    presalesId: "售前",
    salesId: "销售",
    developerId: "研发",
    resourceId: "资源",
    suppliers: "供应商",
    result: stage === "CUSTOMER_ACCEPTANCE" ? "客户验收结果" : "Demo反馈",
    feedback: stage === "DEMO_FEEDBACK" ? "Demo客户反馈" : "客户验收反馈",
    costReview: "执行成本盘点",
    reviewDoc: "项目复盘文档",
    demoDeadline: "Demo 交付截止时间",
    demoScale: "Demo需求量级",
    reason: "原因",
    note: "备注",
    documentLinks: "文档链接",
    projectName: "项目名称",
    projectInitiationCode:
      stage === "INITIATE_CLOSE" ? "立项编号" : "项目立项编号",
    lossType: "主动/被动丢单",
    lossReason: "输单原因",
    lossSubReason: "输单二级归因",
    resumeDate: "预计启动时间",
    supplementReason: "补交付说明&原因",
    supplementScale: "补交付量级",
    supplementDeadline: "补交付截止时间",
  };
  const layouts: Record<string, string[]> = {
    ESTABLISHED: [
      "ownerId",
      "presalesId",
      "developerId",
      "resourceId",
      "suppliers",
    ],
    FORMAL_DELIVERY: ["ownerId", "presalesId", "developerId", "suppliers"],
    SUPPLEMENT_DELIVERY: [
      "feedback",
      "ownerId",
      "presalesId",
      "supplementReason",
      "supplementScale",
      "supplementDeadline",
    ],
    CUSTOMER_ACCEPTANCE: ["result", "ownerId", "presalesId", "feedback"],
    INITIATE_CLOSE: [
      "projectInitiationCode",
      "ownerId",
      "presalesId",
      "feedback",
      "costReview",
      "reviewDoc",
    ],
    CLOSE: ["presalesId", "ownerId", "reviewDoc"],
    DEMO_DELIVERY: [
      "presalesId",
      "salesId",
      "ownerId",
      "resourceId",
      "developerId",
      "demoScale",
      "demoDeadline",
      "suppliers",
      "documentLinks",
      "note",
    ],
    DEMO_FEEDBACK: [
      "result",
      "ownerId",
      "presalesId",
      "salesId",
      "resourceId",
      "developerId",
      "feedback",
      "suppliers",
    ],
    INITIATE_PROJECT: [
      "projectInitiationCode",
      "projectName",
      "ownerId",
      "presalesId",
      "developerId",
      "resourceId",
      "suppliers",
    ],
    SUSPEND: ["reason", "resumeDate"],
    LOSE: [
      "presalesId",
      "ownerId",
      "lossType",
      "lossReason",
      "lossSubReason",
      "reason",
      "reviewDoc",
    ],
  };
  const keys = layouts[stage] || Object.keys(v).filter((k) => labels[k]);
  const display = (key: string, value: any): React.ReactNode => {
    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      return <span className="platform-readonly-empty">未填写</span>;
    if (key.endsWith("Id")) return userName(value);
    if (key === "result")
      return value === "pass"
        ? stage === "CUSTOMER_ACCEPTANCE"
          ? "通过，进入发起结项"
          : "通过"
        : value === "fail"
          ? stage === "CUSTOMER_ACCEPTANCE"
            ? "不通过，进入补交付"
            : "不通过，重新交付"
          : String(value);
    if (Array.isArray(value))
      return (
        <span className="platform-readonly-tags">
          {value.map((x, i) => (
            <Tag key={i}>{String(x)}</Tag>
          ))}
        </span>
      );
    return String(value);
  };
  return (
    <>
      <Descriptions
        className="platform-readonly-meta"
        bordered
        column={1}
        size="small"
        items={[
          {
            key: "from",
            label: "流转前节点",
            children: stageNames[v.from || stage] || stage,
          },
          { key: "by", label: "提交人", children: userName(v.submittedBy) },
          {
            key: "at",
            label: "提交时间",
            children: v.submittedAt
              ? dayjs(v.submittedAt).format("YYYY-MM-DD HH:mm")
              : "-",
          },
        ]}
      />
      <div className="platform-readonly-grid">
        {keys.map((k) => {
          const long = [
              "feedback",
              "costReview",
              "reason",
              "note",
              "supplementReason",
            ].includes(k),
            full = long || k === "documentLinks";
          return (
            <div
              key={k}
              className={
                full
                  ? "platform-readonly-field platform-readonly-full"
                  : "platform-readonly-field"
              }
            >
              <div className="platform-readonly-label">
                <span>{labels[k] || k}</span>
                {k.endsWith("Id") && (
                  <Tag>
                    {(v.notifyUsers || []).includes(v[k])
                      ? "发送通知"
                      : "不发送通知"}
                  </Tag>
                )}
              </div>
              <div
                className={
                  "platform-readonly-value" +
                  (long ? " platform-readonly-long" : "")
                }
              >
                {display(k, v[k])}
              </div>
            </div>
          );
        })}
      </div>
      {!!v.files?.length && (
        <div className="platform-readonly-attachments">
          <div className="platform-readonly-label">附件</div>
          <Files value={v.files} disabled />
        </div>
      )}
      {!!v.addresses?.length && (
        <div className="platform-readonly-attachments">
          <div className="platform-readonly-label">TOS 地址</div>
          <div className="platform-readonly-value platform-readonly-long">
            {v.addresses.map((x: any, i: number) => (
              <div key={i}>
                <strong>地址 {i + 1}：</strong>
                <a href={x.url} target="_blank" rel="noreferrer">
                  {x.url}
                </a>
                {x.note && <div>{x.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
export function PlatformWorkflow({
  business: b,
  focused = false,
  onNavigate,
}: {
  business: Business;
  focused?: boolean;
  onNavigate?: (key: string) => void;
}) {
  const { state, user, command, busy } = usePMC();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm();
  const [action, setAction] = useState("");
  const [history, setHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("全部");
  const [readonly, setReadonly] = useState<any>();
  const [expandedChanges, setExpandedChanges] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>();
  const { modal, message } = App.useApp();
  const stages =
    b.kind === "project"
      ? [
          "ESTABLISHED",
          "FORMAL_DELIVERY",
          "CUSTOMER_ACCEPTANCE",
          "INITIATE_CLOSE",
          "CLOSE",
        ]
      : OPPORTUNITY_STAGES;
  const active = stages.indexOf(
    b.stage === "SUPPLEMENT_DELIVERY"
      ? "CUSTOMER_ACCEPTANCE"
      : b.stage === "CLOSED"
        ? "CLOSE"
        : b.stage,
  );
  const enabled = platformEditable(b, user);
  const blockers = businessBlockers(state, b);
  const title =
    action === "SUSPEND"
      ? "挂起流程"
      : action === "LOSE"
        ? "终止项目"
        : action === "ROLLBACK"
          ? "确认回退"
          : (
              {
                DEMO_DELIVERY: "提交 Demo 交付",
                DEMO_FEEDBACK: "提交Demo反馈",
                INITIATE_PROJECT: "发起项目",
                ESTABLISHED: "开始正式交付",
                FORMAL_DELIVERY: "提交正式交付",
                CUSTOMER_ACCEPTANCE: "提交客户验收",
                SUPPLEMENT_DELIVERY: "提交补交付",
                INITIATE_CLOSE: "发起结项",
                CLOSE: "结项",
              } as any
            )[b.stage];
  const open = (a = "SUBMIT") => {
    if (
      focused &&
      onNavigate &&
      a === "SUBMIT" &&
      [
        "FORMAL_DELIVERY",
        "SUPPLEMENT_DELIVERY",
        "CUSTOMER_ACCEPTANCE",
      ].includes(b.stage)
    ) {
      onNavigate("delivery");
      return;
    }
    const key = "PLATFORM_" + (a === "SUBMIT" ? b.stage : a);
    const draft = state.drafts[draftKey(user.id, b.id, key)];
    form.resetFields();
    form.setFieldsValue({
      ownerId: b.ownerId,
      presalesId: b.presalesId,
      salesId: b.salesId,
      developerId: b.developerId,
      demoDeadline: b.common.demoDeadline || b.deadline,
      demoScale: b.common.demoScale,
      projectName: b.name,
      projectInitiationCode: b.common.projectInitiationCode,
      feedback:
        b.common.platformFlowForms?.CUSTOMER_ACCEPTANCE?.at(-1)?.feedback || "",
      files: [],
      addresses: [],
      notifyUsers: [],
      ...draft?.values,
    });
    setAction(a);
    if (draft) message.info("已恢复当前节点草稿");
  };
  React.useEffect(() => {
    if (params.get("submit") === "1" && enabled) {
      open();
      const p = new URLSearchParams(params);
      p.delete("submit");
      setParams(p, { replace: true });
    }
  }, [b.id]);
  const submit = (v: any) =>
    command("process.platformTransition", {
      businessId: b.id,
      version: b.version,
      action,
      values: v,
      ...(action === "ROLLBACK" ? { target: v.target, reason: v.reason } : {}),
    }).then((r) => {
      setAction("");
      setPreview(undefined);
      if (r.businessId !== b.id) navigate("/projects?detail=" + r.businessId);
    });
  const person = (
    key: string,
    label: string,
    required = false,
    notification = true,
  ) => (
    <div className="platform-person-field" key={key}>
      <Form.Item
        name={key}
        label={label}
        rules={required ? [{ required: true, message: "请选择" + label }] : []}
      >
        <People />
      </Form.Item>
      {notification && (
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue, setFieldValue }) => (
            <Checkbox
              checked={(getFieldValue("notifyUsers") || []).includes(
                getFieldValue(key),
              )}
              disabled={!getFieldValue(key)}
              onChange={(e) => {
                const id = getFieldValue(key),
                  v = getFieldValue("notifyUsers") || [];
                setFieldValue(
                  "notifyUsers",
                  e.target.checked
                    ? [...new Set([...v, id])]
                    : v.filter((x: string) => x !== id),
                );
              }}
            >
              发送飞书通知
            </Checkbox>
          )}
        </Form.Item>
      )}
    </div>
  );
  const text = (
    key: string,
    label: string,
    required = false,
    textarea = false,
  ) => (
    <Form.Item
      key={key}
      className={
        textarea || ["reviewDoc"].includes(key) ? "platform-full-field" : ""
      }
      name={key}
      label={label}
      rules={required ? [{ required: true, message: "请填写" + label }] : []}
    >
      {textarea ? <Input.TextArea rows={3} /> : <Input />}
    </Form.Item>
  );
  const select = (
    key: string,
    label: string,
    options: any[],
    required = false,
  ) => (
    <Form.Item
      name={key}
      label={label}
      rules={required ? [{ required: true, message: "请选择" + label }] : []}
    >
      <Select options={options} />
    </Form.Item>
  );
  const suppliers = (
    <Form.Item name="suppliers" label="供应商">
      <Select
        mode="tags"
        options={opts(["云岫数据（虚构）", "松林标注（虚构）"])}
        placeholder="请选择"
      />
    </Form.Item>
  );
  const date = (key: string, label: string, required = true) => (
    <Form.Item
      name={key}
      label={label}
      rules={required ? [{ required: true }] : []}
    >
      <DateValue />
    </Form.Item>
  );
  const attachment = (label = "附件", required = false) => (
    <Form.Item
      className="platform-full-field"
      label={label}
      required={required}
    >
      <div className="platform-attachments-panel">
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => (
            <Form.Item
              noStyle
              name="files"
              rules={
                required
                  ? [
                      {
                        validator: (_, v) =>
                          v?.length ||
                          getFieldValue("addresses")?.some((x: any) => x.url)
                            ? Promise.resolve()
                            : Promise.reject(new Error("请添加" + label)),
                      },
                    ]
                  : []
              }
            >
              <PlatformFiles />
            </Form.Item>
          )}
        </Form.Item>
        <Form.Item name="addresses" noStyle>
          <Storage />
        </Form.Item>
      </div>
    </Form.Item>
  );
  const fields = () => {
    if (action === "ROLLBACK")
      return (
        <>
          {select(
            "target",
            "回退至节点",
            stages
              .filter(
                (s, i) =>
                  i < active ||
                  b.history.some(
                    (h) => h.snapshot?.from === s && s !== b.stage,
                  ),
              )
              .reverse()
              .map((s) => ({ label: stageNames[s], value: s })),
            true,
          )}
          {text("reason", "回退原因", true, true)}
        </>
      );
    if (action === "SUSPEND")
      return (
        <>
          {text("reason", "挂起原因", true, true)}
          {date("resumeDate", "预计启动时间")}
          {attachment()}
        </>
      );
    if (action === "LOSE" && b.kind === "project")
      return (
        <>
          {person("presalesId", "售前", true)}
          {person("ownerId", "项目经理", true)}
          {text("reviewDoc", "项目复盘文档", true)}
          {attachment()}
        </>
      );
    if (action === "LOSE")
      return (
        <>
          {person("presalesId", "售前", true)}
          {person("ownerId", "项目经理", true)}
          {select(
            "lossType",
            "主动/被动丢单",
            opts(["主动丢单", "被动丢单"]),
            true,
          )}
          <Form.Item
            name="lossReason"
            label="输单原因"
            rules={[{ required: true }]}
          >
            <Select
              options={opts(Object.keys(lossReasons))}
              onChange={() => form.setFieldValue("lossSubReason", undefined)}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              select(
                "lossSubReason",
                "输单二级归因",
                opts(lossReasons[getFieldValue("lossReason")] || []),
                true,
              )
            }
          </Form.Item>
          {text("reason", "输单描述", true, true)}
          {attachment()}
        </>
      );
    if (b.stage === "DEMO_DELIVERY")
      return (
        <>
          {person("presalesId", "售前", true)}
          {person("salesId", "销售", true, false)}
          {person("ownerId", "项目经理")}
          {person("resourceId", "资源")}
          {person("developerId", "研发")}
          {text("demoScale", "Demo需求量级")}
          {date("demoDeadline", "Demo 交付截止时间")}
          {suppliers}
          <Form.Item
            className="platform-full-field"
            name="documentLinks"
            label="文档链接"
          >
            <Select mode="tags" placeholder="粘贴文档链接，回车添加" />
          </Form.Item>
          {text("note", "备注", false, true)}
          {attachment("DEMO 存储位置")}
        </>
      );
    if (b.stage === "DEMO_FEEDBACK")
      return (
        <>
          {select(
            "result",
            "Demo反馈",
            [
              { label: "通过", value: "pass" },
              { label: "不通过，重新交付", value: "fail" },
            ],
            true,
          )}
          {person("ownerId", "项目经理", true)}
          {person("presalesId", "售前", true)}
          {person("salesId", "销售")}
          {person("resourceId", "资源")}
          {person("developerId", "研发")}
          {text("feedback", "Demo客户反馈", true, true)}
          {suppliers}
        </>
      );
    if (b.stage === "INITIATE_PROJECT")
      return (
        <>
          {text("projectInitiationCode", "项目立项编号", true)}
          {text("projectName", "项目名称", true)}
          {person("ownerId", "项目经理", true)}
          {person("presalesId", "售前")}
          {person("developerId", "研发")}
          {person("resourceId", "资源")}
          {suppliers}
        </>
      );
    if (b.stage === "SUPPLEMENT_DELIVERY")
      return (
        <>
          {text("feedback", "客户验收反馈", false, true)}
          {person("ownerId", "项目经理", true)}
          {person("presalesId", "售前", true)}
          {text("supplementReason", "补交付说明&原因", false, true)}
          {text("supplementScale", "补交付量级")}
          {date("supplementDeadline", "补交付截止时间", false)}
          {attachment("补交付存储地址", true)}
        </>
      );
    if (b.stage === "CUSTOMER_ACCEPTANCE")
      return (
        <>
          {select(
            "result",
            "客户验收结果",
            [
              { label: "通过，进入发起结项", value: "pass" },
              { label: "不通过，进入补交付", value: "fail" },
            ],
            true,
          )}
          {person("ownerId", "项目经理", true)}
          {person("presalesId", "售前", true)}
          {text("feedback", "客户验收反馈", true, true)}
          {attachment("客户验收附件", true)}
        </>
      );
    if (b.stage === "INITIATE_CLOSE")
      return (
        <>
          <Form.Item label="立项编号">
            <Input value={b.common.projectInitiationCode || "-"} readOnly />
          </Form.Item>
          {person("ownerId", "项目经理", true)}
          {person("presalesId", "售前", true)}
          {text("feedback", "客户验收反馈", true, true)}
          {text("costReview", "执行成本盘点", true, true)}
          {text("reviewDoc", "项目复盘文档")}
          {attachment("附件", true)}
        </>
      );
    if (b.stage === "CLOSE")
      return (
        <>
          {person("presalesId", "售前", true)}
          {person("ownerId", "项目经理", true)}
          {text("reviewDoc", "项目复盘文档", true)}
        </>
      );
    return (
      <>
        {person("ownerId", "项目经理", true)}
        {person("presalesId", "售前", true)}
        {person("developerId", "研发")}
        {b.stage === "ESTABLISHED" && person("resourceId", "资源")}
        {suppliers}
        {b.stage !== "ESTABLISHED" &&
          attachment(
            b.stage === "SUPPLEMENT_DELIVERY"
              ? "补交付存储地址"
              : "正式交付存储地址",
            true,
          )}
      </>
    );
  };
  const rounds = new Map<string, number>();
  let acceptanceRound = 0;
  for (const event of [...b.history].reverse()) {
    if (/回退|回滚|挂起|恢复/.test(event.action)) continue;
    if (event.snapshot?.from === "CUSTOMER_ACCEPTANCE") acceptanceRound++;
    if (
      ["CUSTOMER_ACCEPTANCE", "SUPPLEMENT_DELIVERY"].includes(
        event.snapshot?.from,
      )
    )
      rounds.set(event.id, acceptanceRound);
  }
  const inspect = (s: string, event?: Business["history"][number]) => {
    if (event?.snapshot?.values) {
      setReadonly({
        stage: s,
        submissions: [
          {
            ...event.snapshot.values,
            from: s,
            submittedAt: event.at,
            submittedBy: event.actor,
          },
        ],
      });
      return;
    }
    const values = b.common.platformFlowForms?.[s];
    if (values?.length) setReadonly({ stage: s, submissions: values });
    else if (b.common.flowForms?.[s])
      setReadonly({ stage: s, submissions: [b.common.flowForms[s]] });
    else
      setReadonly({
        stage: s,
        submissions: [],
        events: b.history.filter(
          (h) => h.snapshot?.from === s || h.snapshot?.to === s,
        ),
      });
  };
  return (
    <>
      <div
        className={
          focused
            ? "platform-workflow-layout project-workflow-focused"
            : "platform-workflow-layout"
        }
      >
        <div>
          <Card
            className="platform-flow-card"
            title={
              <Space>
                流程进度
                <Button
                  type="link"
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => setHistory(true)}
                >
                  查看操作记录
                </Button>
              </Space>
            }
            extra={
              <span className={"platform-flow-status " + pastel(b.stage)}>
                {b.completed ? (
                  <CheckCircleOutlined />
                ) : (
                  <ClockCircleOutlined />
                )}{" "}
                {b.completed
                  ? "已完成"
                  : b.stage === "SUSPENDED"
                    ? "已挂起"
                    : "进行中"}
              </span>
            }
          >
            <div className="platform-flow-viewport">
              <div className="platform-flow-canvas">
                <div
                  className={
                    "platform-flow-nodes " +
                    (b.kind === "opportunity" ? "opportunity" : "")
                  }
                  role="group"
                  aria-label={
                    b.kind === "project" ? "项目主流程" : "商机主流程"
                  }
                >
                  {stages.map((s, i) => (
                    <React.Fragment key={s}>
                      <Button
                        style={
                          {
                            "--flow-node-color":
                              b.kind === "project"
                                ? flowColors[i]
                                : ["#3e8588", "#477eaf", "#5f72aa"][i],
                          } as React.CSSProperties
                        }
                        className={
                          i === active && !b.completed
                            ? "current"
                            : i < active || b.completed
                              ? "done"
                              : ""
                        }
                        disabled={i >= active && !b.completed}
                        onClick={() => inspect(s)}
                        icon={
                          i < active || b.completed ? (
                            <span className="platform-node-circle">
                              <CheckOutlined />
                            </span>
                          ) : i === active ? (
                            <span className="platform-node-circle">
                              <ClockCircleOutlined />
                            </span>
                          ) : (
                            <span className="platform-node-circle">
                              {i + 1}
                            </span>
                          )
                        }
                      >
                        <strong>
                          {s === "CLOSE" ? "结项" : stageNames[s]}
                        </strong>
                        {b.kind === "opportunity" && (
                          <small>{["L1-L2", "L3", "L4-L5"][i]}</small>
                        )}
                      </Button>
                      {i < stages.length - 1 && (
                        <span
                          className={
                            "platform-node-arrow " + (i < active ? "done" : "")
                          }
                          style={
                            {
                              "--flow-node-color":
                                b.kind === "project"
                                  ? flowColors[i]
                                  : ["#3e8588", "#477eaf", "#5f72aa"][i],
                            } as React.CSSProperties
                          }
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {b.kind === "project" && (
                  <div className="platform-supplement">
                    <Button
                      className={
                        "platform-branch-node " +
                        (b.stage === "SUPPLEMENT_DELIVERY"
                          ? "current"
                          : b.common.platformFlowForms?.SUPPLEMENT_DELIVERY
                                ?.length
                            ? "done"
                            : "")
                      }
                      style={
                        {
                          "--flow-node-color": "#aa8136",
                        } as React.CSSProperties
                      }
                      disabled={
                        b.stage === "SUPPLEMENT_DELIVERY" ||
                        !b.common.platformFlowForms?.SUPPLEMENT_DELIVERY?.length
                      }
                      icon={
                        <span className="platform-node-circle">
                          <BranchesOutlined />
                        </span>
                      }
                      onClick={() =>
                        b.stage === "SUPPLEMENT_DELIVERY" && enabled
                          ? open()
                          : inspect("SUPPLEMENT_DELIVERY")
                      }
                    >
                      <strong>
                        补交付
                        {b.common.platformFlowForms?.SUPPLEMENT_DELIVERY?.length
                          ? "（" +
                            b.common.platformFlowForms.SUPPLEMENT_DELIVERY
                              .length +
                            "次）"
                          : "（可选）"}
                      </strong>
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {!b.completed && (
              <div className="platform-flow-actions">
                <Space>
                  <Button
                    icon={<RollbackOutlined />}
                    disabled={user.role !== "approver" || active < 1}
                    onClick={() => open("ROLLBACK")}
                  >
                    回退
                  </Button>
                  {b.kind === "opportunity" && (
                    <Button
                      disabled={!enabled}
                      onClick={() =>
                        b.stage === "SUSPENDED"
                          ? safe(
                              command("process.platformTransition", {
                                businessId: b.id,
                                version: b.version,
                                action: "RESUME",
                              }),
                            )
                          : open("SUSPEND")
                      }
                    >
                      {b.stage === "SUSPENDED" ? "恢复流程" : "挂起流程"}
                    </Button>
                  )}
                  <Button
                    danger
                    icon={<StopOutlined />}
                    disabled={!enabled}
                    onClick={() => open("LOSE")}
                  >
                    终止项目
                  </Button>
                </Space>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={
                    !enabled || !!blockers.length || b.stage === "SUSPENDED"
                  }
                  onClick={() => open()}
                >
                  {
                    (
                      {
                        DEMO_DELIVERY: "提交 Demo 交付",
                        DEMO_FEEDBACK: "提交Demo反馈",
                        INITIATE_PROJECT: "发起项目",
                        ESTABLISHED: "开始正式交付",
                        FORMAL_DELIVERY: "提交正式交付",
                        CUSTOMER_ACCEPTANCE: "提交客户验收",
                        SUPPLEMENT_DELIVERY: "提交补交付",
                        INITIATE_CLOSE: "发起结项",
                        CLOSE: "结项",
                      } as any
                    )[b.stage]
                  }
                </Button>
              </div>
            )}
            {!!blockers.length && (
              <Alert
                type="warning"
                message={
                  "当前节点有 " +
                  blockers.length +
                  " 个 # 任务阻塞，请在扩展任务中处理。"
                }
              />
            )}
          </Card>
          {!focused && <PlatformCommon business={b} />}
        </div>
        {!focused && <PlatformFollowups business={b} />}
      </div>
      <Drawer
        className="platform-form-drawer"
        title={title}
        open={!!action && action !== "ROLLBACK"}
        width={640}
        onClose={() => setAction("")}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setAction("")}>取消</Button>
            {action !== "ROLLBACK" && (
              <Button
                loading={busy}
                onClick={() =>
                  safe(
                    command("process.draft", {
                      businessId: b.id,
                      action:
                        "PLATFORM_" + (action === "SUBMIT" ? b.stage : action),
                      values: form.getFieldsValue(),
                    }).then(() => message.success("草稿已保存")),
                  )
                }
              >
                保存草稿
              </Button>
            )}
            <Button
              type="primary"
              loading={busy}
              onClick={() =>
                safe(
                  form
                    .validateFields()
                    .then((v) =>
                      action === "LOSE" ||
                      (b.stage === "INITIATE_CLOSE" && action === "SUBMIT")
                        ? setPreview(v)
                        : submit(v),
                    ),
                )
              }
            >
              {action === "ROLLBACK"
                ? "确认回退"
                : action === "LOSE" ||
                    (b.stage === "INITIATE_CLOSE" && action === "SUBMIT")
                  ? "预览并确认提交"
                  : "确认提交"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" className="platform-drawer-grid">
          <Form.Item name="notifyUsers" hidden>
            <Input />
          </Form.Item>
          {fields()}
        </Form>
      </Drawer>
      <Modal
        title="确认回退"
        open={action === "ROLLBACK"}
        onCancel={() => setAction("")}
        okText="确认回退"
        cancelText="取消"
        confirmLoading={busy}
        destroyOnHidden
        onOk={() => safe(form.validateFields().then(submit))}
      >
        <Form form={form} layout="vertical">
          {action === "ROLLBACK" ? fields() : null}
        </Form>
      </Modal>
      <Modal
        title="预览并确认提交"
        open={!!preview}
        onCancel={() => setPreview(undefined)}
        okText="确认提交"
        cancelText="返回修改"
        confirmLoading={busy}
        onOk={() => safe(submit(preview))}
      >
        <Alert
          type="info"
          message="请核对本次提交信息，确认后将流转到下一节点。"
        />
        <Descriptions
          column={1}
          bordered
          size="small"
          items={Object.entries(preview || {})
            .filter(([k, v]) => v && !Array.isArray(v))
            .map(([k, v]) => ({
              key: k,
              label:
                (
                  {
                    reason: "原因",
                    costReview: "执行成本盘点",
                    feedback: "客户验收反馈",
                    reviewDoc: "项目复盘文档",
                    lossType: "主动/被动丢单",
                    lossReason: "输单原因",
                    lossSubReason: "二级归因",
                  } as any
                )[k] || k,
              children: state.users.find((u) => u.id === v)?.name || String(v),
            }))}
        />
      </Modal>
      <Modal
        className="platform-history-modal"
        title="操作记录"
        open={history}
        width={760}
        onCancel={() => setHistory(false)}
        footer={null}
      >
        <div className="platform-history-body">
          <Segmented
            className="platform-history-filters"
            options={["全部", "提交", "回退", "挂起", "恢复", "丢单"]}
            value={historyFilter}
            onChange={(v) => setHistoryFilter(String(v))}
          />
          <div className="platform-history-scroll">
            {b.history.filter(
              (h) =>
                historyFilter === "全部" ||
                (historyFilter === "提交"
                  ? /提交|交付|结项|发起|进入/.test(h.action)
                  : h.action.includes(historyFilter)),
            ).length ? (
              <Timeline
                items={b.history
                  .filter(
                    (h) =>
                      historyFilter === "全部" ||
                      (historyFilter === "提交"
                        ? /提交|交付|结项|发起|进入/.test(h.action)
                        : h.action.includes(historyFilter)),
                  )
                  .map((h) => {
                    const before = h.snapshot?.before;
                    const after = h.snapshot?.after;
                    const flatten = (value: any) =>
                      value ? { ...value, ...(value.common || {}) } : {};
                    const oldValues = flatten(before),
                      newValues = flatten(after);
                    const keys =
                      after && before
                        ? Object.keys(newValues).filter(
                            (k) =>
                              ![
                                "common",
                                "history",
                                "version",
                                "updatedAt",
                              ].includes(k) &&
                              JSON.stringify(oldValues[k]) !==
                                JSON.stringify(newValues[k]),
                          )
                        : Object.keys(h.snapshot?.changes || {});
                    const showValue = (v: any) =>
                      v == null || v === ""
                        ? "未填写"
                        : typeof v === "object"
                          ? JSON.stringify(v)
                          : String(v);
                    const formEvent =
                      (h.snapshot?.from || h.snapshot?.to) &&
                      !/回退|回滚|挂起|恢复/.test(h.action);
                    return {
                      key: h.id,
                      children: (
                        <div className="platform-history-item">
                          <div className="platform-history-content">
                            <div className="platform-history-heading">
                              <span className="platform-history-title-group">
                                <strong>
                                  {h.action === "平台流程提交"
                                    ? h.snapshot?.from === "ESTABLISHED"
                                      ? "进入正式交付"
                                      : h.snapshot?.from === "INITIATE_CLOSE"
                                        ? "发起结项"
                                        : "提交" +
                                          (stageNames[h.snapshot?.from] ||
                                            "流程")
                                    : h.action}
                                </strong>
                                {acceptanceRound > 1 && !!rounds.get(h.id) && (
                                  <Tag>第 {rounds.get(h.id)} 轮</Tag>
                                )}
                              </span>
                              <time>
                                {dayjs(h.at).format("YYYY-MM-DD HH:mm")}
                              </time>
                            </div>
                            <div className="platform-history-transition">
                              <span className="platform-history-operator">
                                {state.users.find((u) => u.id === h.actor)
                                  ?.name || h.actor}
                              </span>
                              {(h.snapshot?.from || h.snapshot?.to) && (
                                <>
                                  <Tag className={pastel(h.snapshot.from)}>
                                    {platformNames[h.snapshot.from] ||
                                      h.snapshot.from}
                                  </Tag>
                                  <ArrowRightOutlined />
                                  <Tag className={pastel(h.snapshot.to)}>
                                    {platformNames[h.snapshot.to] ||
                                      h.snapshot.to}
                                  </Tag>
                                </>
                              )}
                            </div>
                            {formEvent ? (
                              <Button
                                className="platform-history-form-action"
                                size="small"
                                type="link"
                                icon={<HistoryOutlined />}
                                onClick={() => inspect(h.snapshot.from, h)}
                              >
                                查看提交表单
                              </Button>
                            ) : keys.length ? (
                              <Button
                                className="platform-history-form-action"
                                size="small"
                                type="link"
                                icon={
                                  expandedChanges.includes(h.id) ? (
                                    <UpOutlined />
                                  ) : (
                                    <DownOutlined />
                                  )
                                }
                                aria-expanded={expandedChanges.includes(h.id)}
                                onClick={() =>
                                  setExpandedChanges((v) =>
                                    v.includes(h.id)
                                      ? v.filter((x) => x !== h.id)
                                      : [...v, h.id],
                                  )
                                }
                              >
                                查看字段变更
                              </Button>
                            ) : null}
                            {keys.length > 0 &&
                              expandedChanges.includes(h.id) && (
                                <Table
                                  className="platform-history-changes"
                                  size="small"
                                  bordered
                                  pagination={false}
                                  rowKey="field"
                                  columns={[
                                    { title: "字段", dataIndex: "field" },
                                    { title: "更新前", dataIndex: "before" },
                                    { title: "更新后", dataIndex: "after" },
                                  ]}
                                  dataSource={keys.map((k) => ({
                                    field: k,
                                    before: showValue(
                                      oldValues[k] ??
                                        h.snapshot?.changes?.[k]?.before,
                                    ),
                                    after: showValue(
                                      newValues[k] ??
                                        h.snapshot?.changes?.[k]?.after ??
                                        h.snapshot?.changes?.[k],
                                    ),
                                  }))}
                                />
                              )}
                            {(!h.snapshot?.from || !formEvent) &&
                              !keys.length &&
                              h.detail && (
                                <div className="platform-history-reason">
                                  {h.detail}
                                </div>
                              )}
                          </div>
                        </div>
                      ),
                    };
                  })}
              />
            ) : (
              <div className="platform-history-empty">暂无此类操作记录</div>
            )}
          </div>
        </div>
      </Modal>
      <Drawer
        className="platform-form-drawer platform-readonly-drawer"
        zIndex={1200}
        title={
          <span className="platform-readonly-title">
            <span>
              {readonly
                ? stageNames[readonly.stage] || "已完成节点"
                : "已完成节点"}
            </span>
            <Tag icon={<LockOutlined />}>只读</Tag>
          </span>
        }
        open={!!readonly}
        width={640}
        footer={null}
        onClose={() => setReadonly(undefined)}
      >
        {readonly?.submissions?.length ? (
          <ReadonlySubmission
            stage={readonly.stage}
            value={readonly.submissions.at(-1)}
          />
        ) : (
          <Alert type="warning" showIcon message="该节点暂无提交记录" />
        )}
      </Drawer>
    </>
  );
}
export function PlatformFollowups({ business: b }: { business: Business }) {
  const { state, user, command, busy } = usePMC();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [risk, setRisk] = useState(false);
  const [form] = Form.useForm();
  const rows = state.followups.filter(
    (f) => f.businessId === b.id && !f.deleted,
  );
  const editable = platformEditable(b, user);
  const mentions = Form.useWatch("text", form) || "";
  const selectedRisk = Form.useWatch("deliveryRisk", form);
  const mentioned = mentionsIn(mentions, state.users);
  return (
    <div className="platform-followups">
      <div className="platform-followups-header">
        <Space>
          <h3>跟进记录</h3>
          <span className="muted">共 {rows.length} 条</span>
        </Space>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          disabled={!editable}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ text: "", files: [], addresses: [] });
            setRisk(false);
            setEditing(undefined);
            setOpen(true);
          }}
        >
          新增跟进
        </Button>
      </div>
      {b.kind === "opportunity" && !b.common.selfCreated && (
        <Tabs
          size="small"
          items={[
            { key: "local", label: "本系统 " + rows.length },
            {
              key: "crm",
              label: "销售易",
              children: <Empty description="暂无销售易跟进记录" />,
            },
          ]}
        />
      )}
      <Timeline
        items={rows.map((f: any) => ({
          key: f.id,
          children: (
            <article className="platform-followup-item">
              <div>
                <Tag>{platformNames[f.stage] || platformNames[b.stage]}</Tag>
                <time>{dayjs(f.createdAt).format("YYYY-MM-DD HH:mm")}</time>
                {f.actor === user.id && editable && (
                  <Button
                    size="small"
                    type="text"
                    aria-label="编辑跟进"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(f);
                      form.setFieldsValue({
                        ...f,
                        deliveryRisk: undefined,
                        riskReason: "",
                      });
                      setRisk(false);
                      setOpen(true);
                    }}
                  />
                )}
              </div>
              <div className="muted">
                提交人：{state.users.find((u) => u.id === f.actor)?.name || "-"}
                {f.taskId && <Tag color="blue">待办</Tag>}
              </div>
              <div className="platform-followup-remark">
                <label>核心进展</label>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                  {f.text}
                </Typography.Paragraph>
              </div>
              {f.riskAfter && (
                <div className="platform-followup-risk">
                  <div>
                    <span>风险调整</span>
                    <span>{f.riskBefore} →</span>
                    <Tag className={pastel(f.riskAfter)}>{f.riskAfter}</Tag>
                  </div>
                  {f.riskReason && (
                    <div>
                      <span>风险原因</span>
                      <p>{f.riskReason}</p>
                    </div>
                  )}
                </div>
              )}
              <Files value={f.files} disabled />
              {!!f.addresses?.length && (
                <Storage value={f.addresses} disabled />
              )}
            </article>
          ),
        }))}
      />
      {!rows.length && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无跟进记录"
        />
      )}
      <Modal
        centered
        className="platform-followup-modal"
        title={editing ? "编辑跟进记录" : "新增跟进记录"}
        open={open}
        width={680}
        onCancel={() => setOpen(false)}
        okText="提交"
        cancelText="取消"
        confirmLoading={busy}
        onOk={() =>
          safe(
            form
              .validateFields()
              .then((v) =>
                command(editing ? "followup.update" : "followup.create", {
                  ...v,
                  platform: true,
                  businessId: b.id,
                  id: editing?.id,
                  ...(!risk
                    ? { deliveryRisk: undefined, riskReason: undefined }
                    : {}),
                }),
              )
              .then(() => setOpen(false)),
          )
        }
      >
        <Form form={form} layout="vertical" className="platform-followup-form">
          <Form.Item name="text" label="核心进展">
            <Mentions
              rows={5}
              prefix="@"
              placeholder="填写本次跟进内容，输入 @ 提及人员"
              options={state.users.map((u) => ({
                value: u.name,
                label: u.name,
              }))}
              maxLength={2000}
            />
          </Form.Item>
          {!!mentioned.length && (
            <Form.Item
              name="due"
              label="待办截止时间"
              rules={[{ required: true }]}
            >
              <DateValue />
            </Form.Item>
          )}
          {b.kind === "project" && (
            <>
              <Space style={{ marginBottom: 20 }}>
                当前风险：{b.common.deliveryRisk || "未记录"}
                <Button type="link" onClick={() => setRisk(!risk)}>
                  {risk ? "取消调整" : "调整风险"}
                </Button>
              </Space>
              {risk && (
                <>
                  <Form.Item
                    name="deliveryRisk"
                    label="新风险等级"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={opts(["无风险", "高风险", "中风险", "低风险"])}
                      placeholder="请选择新等级"
                    />
                  </Form.Item>
                  {selectedRisk && selectedRisk !== "无风险" && (
                    <Form.Item
                      name="riskReason"
                      label="风险原因"
                      rules={[{ required: true }]}
                    >
                      <Input.TextArea rows={3} />
                    </Form.Item>
                  )}
                </>
              )}
            </>
          )}
          <Attachments />
        </Form>
      </Modal>
    </div>
  );
}
