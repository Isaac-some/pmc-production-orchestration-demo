/** Test-platform legacy production workspace; all records and actions are local simulation. */
import React, { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
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
  AimOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  CrownOutlined,
  CheckOutlined,
  ExportOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { usePMC } from "../api";
import {
  productionData,
  type PlatformTask,
  type PlatformMeta,
} from "../../shared/production";
import "./platform-production.css";
const config = [
  {
    key: "RESOURCE",
    label: "资源入库",
    icon: <DatabaseOutlined />,
    noun: "任务",
    action: "去入库",
  },
  {
    key: "INTERNAL_SELECTION",
    label: "内部圈选",
    icon: <AimOutlined />,
    noun: "文件夹",
    action: "去圈选",
  },
  {
    key: "MACHINE_LABELING",
    label: "机器标注",
    icon: <RobotOutlined />,
    noun: "项目",
    action: "去标注",
  },
  {
    key: "MANUAL_LABELING",
    label: "人工标注",
    icon: <ExperimentOutlined />,
    noun: "项目",
    action: "去标注",
  },
  {
    key: "CROWDSOURCING",
    label: "众包采集",
    icon: <ApartmentOutlined />,
    noun: "项目",
    action: "去采集",
  },
];
export function PlatformProductionPanel({
  businessId,
}: {
  businessId: string;
}) {
  const { state, user, command, refresh, busy } = usePMC(),
    { message } = App.useApp(),
    b = state.businesses.find((b) => b.id === businessId)!,
    p = productionData(state, businessId);
  const [platform, setPlatform] = useState("RESOURCE"),
    [layout, setLayout] = useState("card"),
    [dialog, setDialog] = useState(""),
    [step, setStep] = useState(0),
    [form] = Form.useForm(),
    [detail, setDetail] = useState<PlatformTask | null>(null),
    [operation, setOperation] = useState("详情");
  const meta: Record<string, Partial<PlatformMeta>> = Object.fromEntries(
    p.tasks.map((t) => [t.id, t.meta || {}]),
  );
  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    setDialog("");
    setDetail(null);
    setStep(0);
    setDraft({});
  }, [businessId]);
  const c = config.find((c) => c.key === platform)!,
    tasks = p.tasks.filter((t) => t.platform === platform),
    canEdit =
      !b.completed &&
      b.stage !== "LOST" &&
      (user.role === "approver" ||
        (user.role === "pm" && user.id === b.ownerId)),
    bindable = !["RESOURCE", "INTERNAL_SELECTION"].includes(platform);
  const date = (s: string) => s.slice(0, 16).replace("T", " "),
    title =
      dialog === "bind"
        ? `绑定已有${c.label}项目`
        : platform === "RESOURCE"
          ? "新建资源入库任务"
          : platform === "INTERNAL_SELECTION"
            ? "新建内部圈选文件夹"
            : `新建并绑定${c.label}项目`;
  const open = (kind: string) => {
    setDialog(kind);
    setStep(0);
    setDraft({});
    form.resetFields();
    form.setFieldsValue({
      name:
        platform === "RESOURCE"
          ? b.name + new Date().toISOString().replace(/\D/g, "").slice(0, 14)
          : b.name,
      notificationLevel: "message",
      description: "",
    });
  };
  async function submit(values: any) {
    if (dialog === "bind" && step === 0) {
      const externalId = String(values.externalId).trim();
      setDraft({ externalId, name: `模拟${c.label}项目 ${externalId}` });
      setStep(1);
      return;
    }
    const valuesAll = dialog === "bind" ? draft : values;
    await command("production.createTask", {
      businessId,
      platform,
      name: valuesAll.name,
      unit: b.unit,
      count: 3,
      platformMeta: {
        externalId: valuesAll.externalId,
        description: valuesAll.description || "",
        notificationLevel: valuesAll.notificationLevel,
        developers: valuesAll.developers,
        admins: valuesAll.admins,
        bound: dialog === "bind",
      },
    });
    setDialog("");
    message.success(
      dialog === "bind" ? "已绑定本地模拟项目" : "本地模拟创建成功",
    );
  }
  const actions = (t: PlatformTask, card = false) => (
    <Space>
      <Button
        size="small"
        type={card ? "default" : "link"}
        icon={card ? <EyeOutlined /> : undefined}
        onClick={() => {
          setOperation("详情");
          setDetail(t);
        }}
      >
        查看详情
      </Button>
      <Button
        size="small"
        type={card ? "primary" : "link"}
        icon={card ? <ArrowRightOutlined /> : <ExportOutlined />}
        onClick={() => {
          setOperation(c.action);
          setDetail(t);
        }}
      >
        {c.action}
      </Button>
    </Space>
  );
  const createLabel =
    platform === "RESOURCE"
      ? "新建任务"
      : platform === "INTERNAL_SELECTION"
        ? "新建文件夹"
        : "新建并绑定";
  return (
    <section
      className="platform-production"
      data-feature="F09-platform-production"
    >
      <Tabs
        activeKey={platform}
        onChange={setPlatform}
        items={config.map((c) => ({
          key: c.key,
          label: (
            <span className="platform-tab-label">
              {c.icon}
              {c.label}
            </span>
          ),
        }))}
        tabBarExtraContent={
          <Space size={8}>
            <Button
              icon={<SwapOutlined />}
              onClick={() =>
                refresh().then(() => message.success("已刷新本地平台数据"))
              }
            >
              刷新
            </Button>
            <Segmented
              aria-label="生产任务展示方式"
              value={layout}
              onChange={(v) => setLayout(String(v))}
              options={[
                {
                  value: "card",
                  label: (
                    <>
                      <AppstoreOutlined /> 卡片
                    </>
                  ),
                },
                {
                  value: "table",
                  label: (
                    <>
                      <TableOutlined /> 表格
                    </>
                  ),
                },
              ]}
            />
            {bindable && (
              <Button
                icon={<LinkOutlined />}
                disabled={!canEdit}
                onClick={() => open("bind")}
              >
                绑定已有项目
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canEdit}
              onClick={() => open("create")}
            >
              {createLabel}
            </Button>
          </Space>
        }
      />
      {!tasks.length ? (
        <div className="platform-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              platform === "INTERNAL_SELECTION"
                ? "暂无下游文件夹"
                : platform === "RESOURCE"
                  ? "暂无下游任务"
                  : "暂无下游项目"
            }
          />
          <Space>
            {bindable && (
              <Button
                icon={<LinkOutlined />}
                disabled={!canEdit}
                onClick={() => open("bind")}
              >
                绑定已有项目
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canEdit}
              onClick={() => open("create")}
            >
              {createLabel}
            </Button>
          </Space>
        </div>
      ) : layout === "card" ? (
        <div className="platform-cards">
          {tasks.map((t) => (
            <Card
              size="small"
              className="platform-task-card"
              key={t.id}
              title={
                <Tooltip title={t.name}>
                  <span className="platform-task-title">{t.name}</span>
                </Tooltip>
              }
              extra={
                platform === "RESOURCE" ? (
                  <Tag color="gold">等待执行</Tag>
                ) : (
                  <span className="platform-card-type">{c.noun}</span>
                )
              }
            >
              <div className="platform-task-body">
                <dl>
                  <dt>{c.noun} ID</dt>
                  <dd>{meta[t.id]?.externalId || t.id}</dd>
                  <dt>创建时间</dt>
                  <dd>{date(t.createdAt)}</dd>
                </dl>
                {platform === "RESOURCE" && (
                  <p>{meta[t.id]?.description || "-"}</p>
                )}
                <footer>{actions(t, true)}</footer>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Table<PlatformTask>
          rowKey="id"
          pagination={false}
          dataSource={tasks}
          columns={[
            {
              title: c.noun + " ID",
              render: (_, t) => meta[t.id]?.externalId || t.id,
              width: 140,
            },
            {
              title: c.noun + "名称",
              dataIndex: "name",
              ellipsis: true,
              width: platform === "RESOURCE" ? 260 : undefined,
            },
            ...(platform === "RESOURCE"
              ? [
                  {
                    title: "任务状态",
                    width: 170,
                    render: () => <Tag color="gold">等待执行</Tag>,
                  },
                  {
                    title: "任务描述",
                    width: 240,
                    render: (_, t) => meta[t.id]?.description || "-",
                  },
                ]
              : []),
            {
              title: "创建时间",
              dataIndex: "createdAt",
              render: date,
              width: 145,
            },
            { title: "操作", render: (_, t) => actions(t), width: 190 },
          ]}
        />
      )}
      <Modal
        title={title}
        open={!!dialog}
        width={dialog === "bind" || platform === "MACHINE_LABELING" ? 760 : 520}
        className={
          platform === "MACHINE_LABELING"
            ? "platform-machine-modal"
            : "platform-create-modal"
        }
        onCancel={() => setDialog("")}
        okText={
          dialog === "bind"
            ? step
              ? "确认绑定"
              : "下一步"
            : platform === "RESOURCE"
              ? "创建任务"
              : platform === "INTERNAL_SELECTION"
                ? "新建文件夹"
                : "创建并绑定"
        }
        confirmLoading={busy}
        onOk={() => (step && dialog === "bind" ? submit({}) : form.submit())}
      >
        {dialog === "bind" && step ? (
          <>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: "id", label: "下游项目 ID", children: draft.externalId },
                { key: "name", label: "项目名称", children: draft.name },
                {
                  key: "source",
                  label: "数据来源",
                  children: <Tag>本地模拟</Tag>,
                },
              ]}
            />
            <p className="platform-simulation">
              已查询到本地模拟项目信息，确认后关联到当前项目。
            </p>
          </>
        ) : (
          <Form
            className={
              platform === "MACHINE_LABELING" && dialog !== "bind"
                ? "platform-machine-form"
                : undefined
            }
            layout="vertical"
            form={form}
            onFinish={submit}
          >
            {dialog === "bind" ? (
              <Form.Item
                name="externalId"
                label="下游项目 ID"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "请输入已有下游项目 ID",
                  },
                ]}
              >
                <Input placeholder="请输入已有下游项目 ID" maxLength={100} />
              </Form.Item>
            ) : (
              <>
                <div
                  className={
                    platform === "MACHINE_LABELING" ? "platform-form-pair" : ""
                  }
                >
                  <Form.Item
                    name="name"
                    label={
                      platform === "RESOURCE"
                        ? "任务名称"
                        : platform === "INTERNAL_SELECTION"
                          ? "文件夹名称"
                          : "项目名称"
                    }
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  {platform === "MACHINE_LABELING" && (
                    <Form.Item
                      name="notificationLevel"
                      label="飞书通知"
                      rules={[{ required: true }]}
                    >
                      <Select
                        options={[{ value: "message", label: "飞书消息" }]}
                      />
                    </Form.Item>
                  )}
                </div>
                {platform === "MACHINE_LABELING" ? (
                  <>
                    <MachineRole label="项目研发" role="developer">
                      <Form.Item name="developers">
                        <Select
                          mode="multiple"
                          placeholder="请选择项目交付研发负责人"
                          options={state.users.map((u) => ({
                            value: u.id,
                            label: u.name,
                          }))}
                        />
                      </Form.Item>
                    </MachineRole>
                    <MachineRole label="负责人" role="owner">
                      <Form.Item>
                        <Select
                          disabled
                          value={user.id}
                          options={[
                            {
                              value: user.id,
                              label: user.name + " (" + user.account + ")",
                            },
                          ]}
                        />
                      </Form.Item>
                    </MachineRole>
                    <MachineRole label="项目管理员" role="admin">
                      <Form.Item name="admins">
                        <Select
                          mode="multiple"
                          showSearch
                          optionFilterProp="label"
                          placeholder="搜索并选择项目管理员"
                          options={state.users.map((u) => ({
                            value: u.id,
                            label: u.name,
                          }))}
                        />
                      </Form.Item>
                    </MachineRole>
                  </>
                ) : (
                  platform !== "INTERNAL_SELECTION" && (
                    <Form.Item
                      name="description"
                      label={platform === "RESOURCE" ? "任务描述" : "项目简介"}
                    >
                      <Input.TextArea
                        showCount
                        maxLength={500}
                        rows={3}
                        placeholder={
                          platform === "RESOURCE" ? "请输入任务描述" : "选填"
                        }
                      />
                    </Form.Item>
                  )
                )}
              </>
            )}
          </Form>
        )}
      </Modal>
      <Modal
        title={`${c.label} · ${operation}`}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
        width={850}
      >
        {detail && (
          <>
            <Tag>本地模拟平台</Tag>
            <Descriptions
              style={{ marginTop: 12 }}
              bordered
              column={2}
              items={[
                {
                  key: "id",
                  label: c.noun + " ID",
                  children: meta[detail.id]?.externalId || detail.id,
                },
                { key: "name", label: c.noun + "名称", children: detail.name },
                {
                  key: "at",
                  label: "创建时间",
                  children: date(detail.createdAt),
                },
                {
                  key: "status",
                  label: "状态",
                  children: platform === "RESOURCE" ? "等待执行" : "已关联",
                },
                {
                  key: "desc",
                  label: "描述",
                  span: 2,
                  children: meta[detail.id]?.description || "-",
                },
              ]}
            />
            <Table
              style={{ marginTop: 16 }}
              rowKey="id"
              dataSource={detail.details}
              columns={[
                { title: "明细 ID", dataIndex: "id" },
                { title: "名称", dataIndex: "name" },
                {
                  title: "产量",
                  dataIndex: "output",
                  render: (x) => x ?? "待回传",
                },
              ]}
            />
            {operation !== "详情" && (
              <p>
                当前为本地模拟作业。生产事实可在扩展入口“生产流程编排”中回放与管理。
              </p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}

const rolePermissions = {
  developer: {
    hint: "拥有对当前项目高级配置调整及代码控制能力",
    permissions: [
      "创建业务流程及参数配置",
      "导出生产环节产生的最终业务数据",
      "详细查询、实时进度监控及看板",
    ],
  },
  owner: {
    hint: "拥有完整控权、资产删除及所有权移交权限",
    permissions: [
      "核心配置修改及资产所有权转移",
      "创建业务流程及参数配置",
      "邀请新成员及定义成员角色权限",
      "导出生产环节产生的最终业务数据",
      "详细查询、实时进度监控及看板",
    ],
  },
  admin: {
    hint: "可管理成员、分配权限、创建/下载工作流批次",
    permissions: [
      "邀请新成员及定义成员角色权限",
      "导出生产环节产生的最终业务数据",
      "创建业务流程及参数配置",
      "详细查询、实时进度监控及看板",
    ],
  },
};
function MachineRole({
  label,
  role,
  children,
}: {
  label: string;
  role: keyof typeof rolePermissions;
  children: React.ReactNode;
}) {
  const data = rolePermissions[role];
  return (
    <div className="platform-role-block">
      <div className="platform-role-header">
        {role === "admin" ? <SafetyCertificateOutlined /> : <CrownOutlined />}
        <strong>{label}</strong>
        <Popover
          trigger="click"
          content={
            <div className="platform-permission">
              <p>{data.hint}</p>
              <strong>权限说明</strong>
              <div>
                {data.permissions.map((p) => (
                  <span key={p}>
                    <CheckOutlined />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          }
        >
          <button
            type="button"
            className="platform-role-help"
            aria-label={`查看${label}提示及权限`}
          >
            <QuestionCircleOutlined />
          </button>
        </Popover>
      </div>
      {children}
    </div>
  );
}
