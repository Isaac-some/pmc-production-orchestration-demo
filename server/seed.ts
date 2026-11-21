const randomUUID=()=>globalThis.crypto.randomUUID();
import { addDays, type State, type Business } from "../shared/types";
import { seedProduction } from "./domains/production";
import { seedRisk, evaluateRisks } from "./domains/risk";
export function createSeed(): State {
  const now = new Date().toISOString();
  const s: State = {
    schemaVersion: 1,
    revision: 1,
    createdAt: now,
    users: [
      { id: "u1", name: "林知远", account: "demo.owner", role: "approver" },
      { id: "u2", name: "周清禾", account: "demo.pm", role: "pm" },
      { id: "u3", name: "陈书宁", account: "demo.finance", role: "finance" },
      { id: "u4", name: "许星河", account: "demo.viewer", role: "viewer" },
      { id: "u5", name: "沈予安", account: "demo.sales", role: "pm" },
      { id: "u6", name: "顾北辰", account: "demo.engineer", role: "approver" },
    ],
    businesses: [],
    tasks: [],
    followups: [],
    notifications: [],
    files: [],
    drafts: {},
    production: {},
    risks: [],
    riskConfig: {},
    decisions: [],
    imports: [],
    audit: [],
    settings: { simulated: true },
  };
  const specs: any[] = [
    ["星河语音 · 立项与投产", "ESTABLISHED", 12000, 14, 6000000],
    ["远山文本 · 多链路交付", "FORMAL_DELIVERY", 20000, 10, 8000000],
    ["海川图像 · 分批验收", "CUSTOMER_ACCEPTANCE", 10000, 8, 5000000],
    ["青禾视频 · 验收后补交付", "SUPPLEMENT_DELIVERY", 10000, 9, 7000000],
    ["晨光语料 · 延期处置", "FORMAL_DELIVERY", 15000, -1, 9000000],
    ["云帆标注 · 成本超支", "FORMAL_DELIVERY", 10000, 8, 3000000],
    ["北辰多模态 · 产量修正", "FORMAL_DELIVERY", 16000, 10, 8000000],
    ["知行文档 · 待发起结项", "INITIATE_CLOSE", 8000, 6, 4000000],
    ["清泉语音 · 结项确认", "CLOSE", 12000, 6, 6000000],
    ["磐石图像 · 历史快照", "CLOSED", 10000, 5, 5000000],
  ];
  for (const [i, [name, stage, target, days, budget]] of specs.entries()) {
    const b: Business = {
      id: "p" + (2001 + i),
      pid: 2001 + i,
      kind: "project",
      name,
      customer:
        ["星澜科技", "远山实验室", "海川研究院", "青禾数据"][i % 4] +
        "（虚构）",
      crmId: "SJ-DEMO-" + (2001 + i),
      stage,
      completed: stage === "CLOSED",
      ownerId: i % 2 ? "u2" : "u1",
      salesId: "u5",
      presalesId: "u6",
      developerId: "u6",
      dataTypes: [["音频", "文本", "图片", "视频"][i % 4]],
      grade: i % 3 ? "B" : "A",
      description: "本地虚构数据项目，用于验证生产、交付与风险联动。",
      clarification: "按确认标准完成数据加工与客户验收。",
      requirementUrl: "https://example.invalid/requirements/" + i,
      target,
      unit: "条",
      deadline: addDays(days),
      budget,
      startDate: addDays(-16),
      createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
      updatedAt: now,
      version: 1,
      common: {
        projectNumber: "PMC-DEMO-" + (2001 + i),
        productionPlan: "虚构生产方案：资源整理、加工与质检后分批交付。",
        projectManagementDoc: "虚构项目管理文档：按计划追踪生产与验收。",
        deliveryMethod: "线上交付",
        formalDeliveryStorage: "tos://tc-demo/outputs/" + i,
      },
      history: [],
    };
    // Fictional manual workflow declarations, independent of production ledgers.
    if (b.id === "p2003") {
      const submittedAt = new Date(Date.now() - 3 * 86400000).toISOString();
      const established = {
        ownerId: b.ownerId,
        presalesId: b.presalesId,
        developerId: b.developerId,
        resourceId: "u5",
        suppliers: ["云岫数据（虚构）"],
        notifyUsers: [],
        submittedAt,
        submittedBy: "u1",
        from: "ESTABLISHED",
        to: "FORMAL_DELIVERY",
      };
      const delivery = {
        ownerId: b.ownerId,
        presalesId: b.presalesId,
        developerId: b.developerId,
        suppliers: ["云岫数据（虚构）"],
        notifyUsers: [],
        addresses: [
          {
            url: "https://example.invalid/delivery/p2003",
            note: "虚构交付声明",
          },
        ],
        files: [],
        submittedAt,
        submittedBy: "u1",
        from: "FORMAL_DELIVERY",
        to: "CUSTOMER_ACCEPTANCE",
      };
      b.common.platformFlowForms = {
        ESTABLISHED: [established],
        FORMAL_DELIVERY: [delivery],
      };
      b.history = [
        {
          id: "seed-p2003-delivery",
          at: submittedAt,
          actor: "u1",
          action: "提交正式交付",
          detail: "虚构人工交付声明",
          snapshot: {
            from: delivery.from,
            to: delivery.to,
            values: delivery,
            source: "platform",
          },
        },
        {
          id: "seed-p2003-established",
          at: submittedAt,
          actor: "u1",
          action: "进入正式交付",
          detail: "虚构阶段流转",
          snapshot: {
            from: established.from,
            to: established.to,
            values: established,
            source: "platform",
          },
        },
      ];
    }
    s.businesses.push(b);
  }
  for (let i = 0; i < 4; i++)
    s.businesses.push({
      ...structuredClone(s.businesses[i]),
      id: "o" + (1001 + i),
      pid: 1001 + i,
      kind: "opportunity",
      name: [
        "天穹图像 · Demo交付",
        "云栖语音 · Demo反馈",
        "溪谷文本 · 发起项目",
        "林间视频 · 需求验证",
      ][i],
      crmId: "SJ-DEMO-" + (1001 + i),
      stage: [
        "DEMO_DELIVERY",
        "DEMO_FEEDBACK",
        "INITIATE_PROJECT",
        "DEMO_DELIVERY",
      ][i],
      completed: false,
      target: 5000,
      budget: 2000000,
      version: 1,
      history: [],
      common: {
        demoScale: 100,
        demoDeadline: addDays(3),
        crmStage: ["L1潜在商机", "L2活跃商机", "L4方案验证", "L3需求验证"][i],
      },
    });
  s.tasks.push({
    id: "task-demo-1",
    businessId: "p2002",
    title: "核对本周交付范围",
    description: "与交付人员确认版本、产出日期和客户验收批次。",
    owners: ["u2"],
    followers: ["u1"],
    stage: "FORMAL_DELIVERY",
    due: addDays(2),
    status: "进行中",
    createdAt: now,
    updatedAt: now,
    files: [],
    subtasks: [],
    comments: [],
    history: [],
  });
  seedProduction(s);
  seedRisk(s);
  evaluateRisks(s, { actor: s.users[0], now, id: randomUUID });
  return s;
}
