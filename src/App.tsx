import React, { useEffect, useState } from "react";
import {
  Layout,
  Menu,
  Button,
  Select,
  Tag,
  Space,
  Typography,
  Dropdown,
  Badge,
  Drawer,
  List,
  Modal,
  Upload,
  App as AntApp,
  Tabs,
  Progress,
  Descriptions,
  Alert,
  Avatar,
  Popover,
  Empty,
} from "antd";
import {
  AppstoreOutlined,
  ProjectOutlined,
  ApartmentOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  MenuFoldOutlined,
  BellOutlined,
  SettingOutlined,
  NodeIndexOutlined,
  ExportOutlined,
  ImportOutlined,
  ReloadOutlined,
  UserOutlined,
  BarChartOutlined,
  FileTextOutlined,
  AimOutlined,
  CloudUploadOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  CloseOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { usePMC } from "./api";
import {
  BusinessList,
  BusinessDetail,
  TasksPage,
  ImportPage,
} from "./features/process";
import { PlatformResults } from "./features/production/PlatformResults";
import { ProductionPanel } from "./features/production";
import {
  RiskPanel,
  RiskLedger,
  ManagementPage,
  RiskManagementPage,
} from "./features/risk";
import { productionFacts, money } from "../shared/production";
import { riskSummary } from "../shared/risk";
import { roleNames, stageNames, day, addDays } from "../shared/types";
import { Dashboard } from "./features/dashboard";
import { Login } from "./features/login";
import { ReportsPage } from "./features/reports";
import { MemberDashboard } from "./features/workspace-parity";
const features = [
  ["F01", "应用框架与身份", "导航、演示身份、数据保存", "src/App.tsx"],
  [
    "F02",
    "数据看板",
    "八张图表、统计口径及业务下钻",
    "src/features/dashboard.tsx",
  ],
  [
    "F03–F05",
    "商机、项目与流程",
    "公共承诺、阶段流转、草稿与审计",
    "src/features/process.tsx",
  ],
  [
    "F06–F07",
    "任务、待办与跟进",
    "@关联任务、#卡点及通知",
    "src/features/process.tsx",
  ],
  [
    "F08–F10",
    "生产编排与日报",
    "画布、链路修订、范围、基线和修正",
    "src/features/production.tsx",
  ],
  [
    "F11–F12",
    "预算、成本与交付验收",
    "范围成本、交付余额、验收分配",
    "server/domains/production.ts",
  ],
  ["F13", "风险与预测", "统计、解释、台账及全局规则", "src/features/risk.tsx"],
  ["F14", "管理驾驶舱", "经营、风险、决策及下钻", "src/features/risk.tsx"],
  ["F15", "数据与本地模拟", "导入、附件、备份及模拟服务", "server/index.ts"],
  [
    "F16",
    "报表与归档",
    "周期、筛选、导出及双类型不可变快照",
    "src/features/reports.tsx",
  ],
];
function Maps() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="feature-id">ENGINEERING MAP</span>
          <h1>代码地图与迭代路径</h1>
          <p>从功能定位源码，再沿依赖路径核对联动和回归用例</p>
        </div>
      </div>
      <Space style={{ marginBottom: 20 }}>
        <Button
          href="/maps/code-map.html"
          target="_blank"
          icon={<NodeIndexOutlined />}
        >
          打开代码地图
        </Button>
        <Button href="/maps/impact-map.html" target="_blank">
          打开业务依赖图
        </Button>
      </Space>
      <div className="map-grid">
        {features.map(([id, name, desc, path]) => (
          <div className="map-card" key={id}>
            <Tag>{id}</Tag>
            <h3>{name}</h3>
            <p>{desc}</p>
            <code>{path}</code>
          </div>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 20 }}>
        <h2>修改前优先核对的路径</h2>
        <p>日产量修正 → 有效生产 → 可交付余额 → 验收分配 → 风险预测 → 驾驶舱</p>
        <p>
          客户承诺 → 生产基线 → 日计划 → 交付预测；跟进 @ → 任务 →
          我的待办；评论 # → 卡点 → 流程提交
        </p>
        <p className="muted">
          图中的连线表示源码依赖或事实流向。是否改变行为，应结合需求、业务约束和对应测试判断。
        </p>
      </section>
    </>
  );
}
export default function App() {
  const { state, user, setUser, command, refresh } = usePMC();
  const navigate = useNavigate(),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  const [collapsed, setCollapsed] = useState(false),
    [notices, setNotices] = useState(false),
    [audit, setAudit] = useState(false);
  const { message, modal } = AntApp.useApp();
  const detailId = params.get("detail");
  const [loggedOut, setLoggedOut] = useState(
    sessionStorage.getItem("pmc-logout") === "1",
  );
  const unread = state.notifications.filter(
    (n) => n.userId === user.id && !n.read,
  );
  const items = [
    {
      key: "workspace",
      icon: <AppstoreOutlined />,
      label: "工作台",
      children: [
        {
          key: "member-dashboard",
          icon: <UserOutlined />,
          label: "我的工作台",
        },
        { key: "dashboard", icon: <BarChartOutlined />, label: "数据看板" },
        {
          key: "management-dashboard",
          icon: <DashboardOutlined />,
          label: "管理驾驶舱",
        },
        { key: "reports", icon: <FileTextOutlined />, label: "报表" },
      ],
    },
    {
      key: "business",
      icon: <ApartmentOutlined />,
      label: "商机 & 项目",
      children: [
        { key: "opportunities", icon: <AimOutlined />, label: "商机列表" },
        { key: "projects", icon: <ProjectOutlined />, label: "项目列表" },
        {
          key: "data-import",
          icon: <CloudUploadOutlined />,
          label: "历史数据导入",
        },
      ],
    },
  ];
  const guardLeave = (action: () => void) => {
    if (document.querySelector('[data-production-dirty="true"]')) {
      modal.confirm({
        title: "生产编排有未保存修改",
        content: "返回生产页保存草稿后再离开，或放弃本次未保存的修改。",
        okText: "放弃并继续",
        cancelText: "返回生产保存",
        onOk: action,
      });
    } else action();
  };
  const closeDetail = () =>
    guardLeave(() => {
      for (const key of [
        "detail",
        "detailIds",
        "tab",
        "task",
        "comment",
        "subtask",
        "pid",
        "chainId",
        "versionId",
        "nodeId",
        "scopeKey",
        "riskId",
        "riskView",
        "submit",
      ])
        params.delete(key);
      setParams(params);
    });
  if (loggedOut || location.pathname === "/login")
    return (
      <Login
        onLogin={() => {
          setLoggedOut(false);
          sessionStorage.removeItem("pmc-logout");
          navigate("/dashboard");
        }}
      />
    );
  if (location.pathname === "/reports/history") return <ReportsPage history />;
  return (
    <Layout className="app-shell">
      <Layout.Sider
        width={226}
        collapsedWidth={64}
        collapsible={false}
        collapsed={collapsed}
        className="app-sider"
      >
        <div className="brand">
          <img className="brand-logo" src={import.meta.env.BASE_URL + "assets/pmc-logo.png"} alt="" />
          {!collapsed && "项目中枢"}
        </div>
        <Menu
          mode="inline"
          defaultOpenKeys={["workspace", "business"]}
          selectedKeys={[
            location.pathname.startsWith("/reports")
              ? "reports"
              : location.pathname.slice(1),
          ]}
          items={items as any}
          onClick={({ key }) => guardLeave(() => navigate("/" + key))}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="topbar">
          <div className="topbar-left">
            <Button
              type="text"
              aria-label={collapsed ? "展开导航" : "收起导航"}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Tag
              className="environment-tag"
              title="本地模拟环境，所有人物和业务数据均为虚构"
            >
              测试环境
            </Tag>
            {location.pathname === "/dashboard" && (
              <Button
                type="text"
                aria-label="刷新看板数据"
                icon={<ReloadOutlined />}
                onClick={refresh}
              />
            )}
          </div>
          <div className="topbar-right">
            <Popover
              placement="bottomRight"
              trigger="click"
              open={notices}
              onOpenChange={setNotices}
              overlayClassName="platform-message-popover"
              content={
                <div className="platform-message-box">
                  <Tabs
                    size="large"
                    items={[
                      {
                        key: "messages",
                        label: "消息",
                        children: (
                          <List
                            size="small"
                            dataSource={state.notifications
                              .filter((n) => n.userId === user.id)
                              .slice()
                              .reverse()}
                            locale={{
                              emptyText: (
                                <Empty
                                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                                  description="暂无消息"
                                />
                              ),
                            }}
                            renderItem={(n) => (
                              <List.Item
                                onClick={async () => {
                                  await command("notification.read", {
                                    id: n.id,
                                  });
                                  if (n.businessId)
                                    guardLeave(() => {
                                      navigate(
                                        (state.businesses.find(
                                          (b) => b.id === n.businessId,
                                        )?.kind === "opportunity"
                                          ? "/opportunities"
                                          : "/projects") +
                                          "?detail=" +
                                          n.businessId +
                                          (n.taskId
                                            ? "&tab=tasks&task=" +
                                              n.taskId +
                                              (n.commentId
                                                ? "&comment=" + n.commentId
                                                : "") +
                                              (n.subtaskId
                                                ? "&subtask=" + n.subtaskId
                                                : "")
                                            : n.riskId
                                              ? "&tab=risk"
                                              : ""),
                                      );
                                      setNotices(false);
                                    });
                                }}
                                style={{ cursor: "pointer" }}
                              >
                                <List.Item.Meta
                                  title={<Badge dot={!n.read}>{n.title}</Badge>}
                                  description={n.detail}
                                />
                              </List.Item>
                            )}
                          />
                        ),
                      },
                      {
                        key: "todos",
                        label: "待办",
                        children: (
                          <>
                            <List
                              size="small"
                              dataSource={state.tasks.filter(
                                (t) =>
                                  t.owners.includes(user.id) &&
                                  t.status !== "已完成",
                              )}
                              locale={{
                                emptyText: (
                                  <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="暂无待处理的跟进待办"
                                  />
                                ),
                              }}
                              renderItem={(t) => (
                                <List.Item
                                  onClick={() => {
                                    navigate(
                                      (state.businesses.find(
                                        (b) => b.id === t.businessId,
                                      )?.kind === "opportunity"
                                        ? "/opportunities"
                                        : "/projects") +
                                        "?detail=" +
                                        t.businessId +
                                        "&tab=tasks&task=" +
                                        t.id,
                                    );
                                    setNotices(false);
                                  }}
                                  style={{ cursor: "pointer" }}
                                >
                                  {t.title}
                                </List.Item>
                              )}
                            />
                            <div className="message-all">
                              <Button
                                type="link"
                                onClick={() => {
                                  navigate("/tasks");
                                  setNotices(false);
                                }}
                              >
                                查看全部待办 <ArrowRightOutlined />
                              </Button>
                            </div>
                          </>
                        ),
                      },
                    ]}
                    tabBarExtraContent={
                      <Button
                        size="small"
                        type="text"
                        aria-label="关闭消息盒子"
                        icon={<CloseOutlined />}
                        onClick={() => setNotices(false)}
                      />
                    }
                  />
                </div>
              }
            >
              <Badge dot={unread.length > 0}>
                <Button
                  type="text"
                  aria-label="消息盒子"
                  icon={<BellOutlined />}
                />
              </Badge>
            </Popover>
            <Dropdown
              menu={{
                items:
                  location.pathname === "/code-map"
                    ? [
                        {
                          key: "identity",
                          label: "切换演示身份",
                          children: state.users.map((u) => ({
                            key: "user:" + u.id,
                            label: u.name + " · " + roleNames[u.role],
                          })),
                        },
                        {
                          key: "code-map",
                          label: "代码地图与迭代路径",
                          icon: <NodeIndexOutlined />,
                        },
                        {
                          key: "extensions",
                          label: "原型扩展",
                          children: [
                            { key: "risk-extension", label: "系统风险台账" },
                            {
                              key: "management-extension",
                              label: "经营与风险决策",
                            },
                          ],
                        },
                        { type: "divider" },
                        {
                          key: "backup",
                          label: "导出业务备份",
                          icon: <ExportOutlined />,
                        },
                        { key: "restore", label: "恢复业务备份" },
                        { key: "audit", label: "查看操作审计" },
                        { key: "reset", label: "恢复演示数据" },
                        {
                          key: "logout",
                          label: "退出登录",
                          icon: <LogoutOutlined />,
                        },
                      ]
                    : [
                        {
                          key: "logout",
                          label: "退出登录",
                          icon: <LogoutOutlined />,
                        },
                      ],
                onClick: ({ key }) => {
                  if (key.startsWith("user:")) setUser(key.slice(5));
                  if (key === "code-map") navigate("/code-map");
                  if (key === "risk-extension") navigate("/risks");
                  if (key === "management-extension")
                    navigate("/risk-management");
                  if (key === "backup") window.open("/api/backup");
                  if (key === "audit") setAudit(true);
                  if (key === "logout") {
                    setLoggedOut(true);
                    sessionStorage.setItem("pmc-logout", "1");
                  }
                  if (key === "reset")
                    modal.confirm({
                      title: "恢复初始演示数据？",
                      content:
                        "当前业务数据将被替换，服务端会保留恢复前检查点。建议先导出备份。",
                      onOk: () => command("system.reset"),
                    });
                  if (key === "restore") {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".json";
                    input.onchange = async () => {
                      try {
                        const text = await input.files?.[0]?.text();
                        if (!text) return;
                        const backup = JSON.parse(text);
                        modal.confirm({
                          title: "从备份恢复业务数据？",
                          content:
                            "附件文件保存在本机 data/files，跨机器恢复需一并复制该目录。",
                          onOk: () =>
                            command("system.restore", { state: backup }),
                        });
                      } catch (e) {
                        message.error("备份文件格式不正确");
                      }
                    };
                    input.click();
                  }
                },
              }}
            >
              <button className="platform-user" aria-label="用户菜单">
                <Avatar size={24} icon={<UserOutlined />} />
                <span>{user.name}</span>
              </button>
            </Dropdown>
          </div>
        </Layout.Header>
        <Layout.Content className="workspace">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/opportunities"
              element={<BusinessList kind="opportunity" />}
            />
            <Route path="/projects" element={<BusinessList kind="project" />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/member-dashboard" element={<MemberDashboard />} />
            <Route path="/risks" element={<RiskLedger />} />
            <Route path="/risk-management" element={<RiskManagementPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/history" element={<ReportsPage history />} />
            <Route path="/management-dashboard" element={<ManagementPage />} />
            <Route path="/data-import" element={<ImportPage />} />
            <Route path="/code-map" element={<Maps />} />
            <Route path="/platform-results" element={<PlatformResults />} />
            <Route
              path="/quarterly-risk"
              element={
                <>
                  <Alert message="兼容入口：季度风险已并入管理驾驶舱，不再单列导航" />
                  <ManagementPage />
                </>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
      <Drawer
        title="操作审计"
        width={720}
        open={audit}
        onClose={() => setAudit(false)}
      >
        <List
          className="audit-list"
          dataSource={state.audit}
          renderItem={(r) => (
            <List.Item>
              <List.Item.Meta
                title={r.action + " · " + r.actor}
                description={
                  <>
                    {r.detail}
                    <br />
                    {new Date(r.at).toLocaleString("zh-CN")}
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
      {detailId && (
        <BusinessDetail
          id={detailId}
          onClose={closeDetail}
          tab={params.get("tab") || undefined}
          taskId={params.get("task") || undefined}
          commentId={params.get("comment") || undefined}
          subtaskId={params.get("subtask") || undefined}
        />
      )}
    </Layout>
  );
}
