import type { Business } from "./types";
/** Public fictional fixture. No real customer, account, meeting, bucket or document references. */
export function createMotionBusiness(): Business {
  const now = new Date().toISOString();
  return {
    id: "motion-poc",
    pid: 3001,
    kind: "project",
    name: "运动感知",
    customer: "示例实验室（虚构）",
    crmId: "",
    stage: "ESTABLISHED",
    completed: false,
    ownerId: "u1",
    salesId: "u5",
    presalesId: "u6",
    dataTypes: ["视频"],
    grade: "UNRATED",
    description:
      "本地演示：大视频压缩、补充产线、Agent 失败转人工。平台对象与数量均为虚构示例。",
    clarification: "单工序单平台，PM 放行；异常数据创建新线路，不成环。",
    requirementUrl: "https://example.com/demo-requirements",
    target: 24,
    unit: "条",
    deadline: "",
    budget: 0,
    startDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    version: 1,
    common: {
      selfCreated: true,
      formalScale: 24,
      formalDeadline: "",
      deliveryMethod: "CSV",
      poc: true,
    },
    history: [],
  };
}
