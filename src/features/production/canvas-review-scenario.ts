/** Local design review fixture. Never persisted or submitted to production commands. */
import type { Chain, ProductionData, ProductionNode, ProductionVersion } from "../../../shared/production";
import type { FlowResult, PullReceipt } from "../../../shared/pull-flow";
import { addDays, day } from "../../../shared/types";

export function canvasReviewScenario(base: ProductionData, template: ProductionVersion) {
  const chainId = "canvas-review-motion";
  const versionId = "canvas-review-motion-r1";
  const now = `${day()}T08:30:00+08:00`;
  const result = (id: string, count: number, platform: string, fields: Record<string, string | number | boolean> = {}, cost: number | null = null): FlowResult => ({
    id: `review-result-${id}`, externalId: `CID-示例-${id}`, quantity: count, platform, platformRef: "运动感知 · 方案示例", fields: {合格: true, ...fields}, unit: "条", date: day(), cost, sourceIds: [], at: now,
  });
  const node = (id: string, title: string, platform: string, x: number, y: number, count: number, plan: number | null, reference: string, note: string, cost: number | null = null): ProductionNode => ({
    id, title, platform, kind: platform === "FLOW" ? "router" : "platform", routingMode: "demand", platformRef: reference, flowUnit: "条", inputUnit: "条", requiredFields: [], resultFields: [{ key: "合格", type: "boolean" }, {key: "描述", type: "text"}], flowResults: count > 0 ? [result(id, count, platform, {描述: note}, cost)] : [], note, taskId: "", selected: [], dailyPlan: plan, position: {x,y}, reports: [], reportHistory: [], corrections: {}, batches: [], finalConfirmed: false, scopeVersion: 0,
  });
  const nodes = [
    node("review-source", "运动视频资源", "RESOURCE", 0, 260, 18000, 3000, "资源项目 / 已登记来源", "TOS 持续入库 · 原始视频", 2200),
    node("review-pool", "原始视频蓄水池", "FLOW", 400, 260, 18000, null, "", "跨来源汇入 · 按需取数"),
    node("review-yolo", "人物跟踪与画框", "MACHINE_LABELING", 800, 90, 9600, 4000, "机标项目 / 执行器 YOLO-01", "输出视频 + 人物轨迹", 1480),
    node("review-human", "运动文本标注", "MANUAL_LABELING", 1200, 90, 7600, 1000, "人工项目 / 队列 Q-运动描述", "目标界面：视频 + 人物框 + 文本", 4400),
    node("review-agent", "Agent 运动理解", "AGENT_LABELING", 1000, 470, 2800, 700, "Agent / 任务组 motion-v2", "与机器 + 人工路线并行", 760),
    node("review-quality", "产物汇总与质检", "FLOW", 1630, 260, 9200, null, "", "统一产物标准 · 审核后放行"),
    node("review-final", "交付候选池", "FLOW", 2050, 260, 9200, null, "", "视频 + 人物轨迹 + 文本 · 已准入"),
    node("review-purchase", "外采成品补量", "COLLECTION", 1630, 650, 600, null, "外采登记 / 供应商批次", "来源登记后按同一标准准入", 900),
    {...node("review-retired", "早期 AI 文本方案", "MACHINE_LABELING", 1000, 850, 1200, null, "机器项目 / 试产批次", "准确率不足，旧数据保留", 260), retiredAt: now, retirementReason: "试产质量不足，转向人工与 Agent 并行方案"},
  ];
  const edges: ProductionVersion["edges"] = [
    {from: "review-source", to: "review-pool", initiallyOpen: true},
    {from: "review-pool", to: "review-yolo", initiallyOpen: true},
    {from: "review-yolo", to: "review-human", initiallyOpen: true, planningAdmissionRate: 1},
    {from: "review-pool", to: "review-agent", initiallyOpen: true},
    {from: "review-human", to: "review-quality", initiallyOpen: true, rules: [{field: "合格", operator: "eq", value: true}], planningAdmissionRate: 0.95},
    {from: "review-agent", to: "review-quality", initiallyOpen: true, rules: [{field: "合格", operator: "eq", value: true}], planningAdmissionRate: 0.9},
    {from: "review-quality", to: "review-final", initiallyOpen: true, planningAdmissionRate: 1},
    {from: "review-purchase", to: "review-final", initiallyOpen: true, planningAdmissionRate: 0.9},
    {from: "review-pool", to: "review-retired", initiallyOpen: false},
  ];
  const flows: [string, string, number][] = [["review-source", "review-pool", 18000], ["review-pool", "review-yolo", 10000], ["review-yolo", "review-human", 8000], ["review-pool", "review-agent", 4000], ["review-human", "review-quality", 6800], ["review-agent", "review-quality", 2400], ["review-quality", "review-final", 9200]];
  const receipts: PullReceipt[] = flows.map(([from, to, count], i) => {
    const row = nodes.find(n => n.id === from)!.flowResults![0];
    const receipt: PullReceipt = {id: `review-receipt-${i}`, requestId: `review-request-${i}`, signature: "review", chainId, versionId, from, to, resultIds: [row.id], quantities: {[row.id]: count}, results: [row], rules: edges.find(e => e.from === from && e.to === to)?.rules || [], requiredFields: [], at: now, actor: "本地方案示例"};
    const target = nodes.find(n => n.id === to)!;
    if (target.kind !== "router" && target.flowResults?.length) {target.flowResults[0].receiptId = receipt.id;target.flowResults[0].sourceIds = [row.id];}
    return receipt;
  });
  // Pools retain actual upstream references; they do not invent newly produced rows.
  nodes.find(n => n.id === "review-pool")!.flowResults = [...nodes.find(n => n.id === "review-source")!.flowResults!];
  for (const r of receipts.filter(r => r.from === "review-pool")) { const row = nodes.find(n => n.id === "review-source")!.flowResults![0]; r.resultIds = [row.id];r.quantities = {[row.id]: r.to === "review-yolo" ? 10000 : 4000};r.results = [row]; }
  nodes.find(n => n.id === "review-quality")!.flowResults = [
    {...nodes.find(n => n.id === "review-human")!.flowResults![0], quantity: 6800},
    {...nodes.find(n => n.id === "review-agent")!.flowResults![0], quantity: 2400},
  ];
  nodes.find(n => n.id === "review-final")!.flowResults = [...nodes.find(n => n.id === "review-quality")!.flowResults!];
  const finalReceipt = receipts.find(r => r.from === "review-quality")!;
  finalReceipt.results = [...nodes.find(n => n.id === "review-quality")!.flowResults!];
  finalReceipt.resultIds = finalReceipt.results.map(r => r.id);finalReceipt.quantities = Object.fromEntries(finalReceipt.results.map(r => [r.id,r.quantity!]));
  const version: ProductionVersion = {...template, id: versionId, revision: 1, name: "运动感知方案 · 本地示例", target: 20000, start: day(), deadline: addDays(7), confirmedAt: now, status: "RUNNING", startedAt: now, nodes, edges, inputs: ["review-source","review-purchase"], output: "review-final", budgetSnapshot: 18000, annotationGroups: [], processUnits: [{id: "review-serial", name: "视频跟踪与文本标注", nodeIds: ["review-yolo","review-human"], outputUnit: "条", bufferPercent: 0, steps: [{nodeId: "review-yolo", dailyCapacity: 4000, outputPerInput: 1}, {nodeId: "review-human", dailyCapacity: 1000, outputPerInput: 1}]}], riskPolicy: {qualityField: "合格", qualityTarget: 0.95, staleAfterDays: 2}};
  const chain: Chain = {id: chainId, name: version.name, versions: [version], draft: null, voided: false, voidReason: "", budget: 18000, budgetHistory: []};
  const data: ProductionData = {...base, chains: [...base.chains, chain], pullReceipts: receipts, flowAssignments: [], pipeGates: {[`${chainId}:review-pool:review-retired`]: false}, flowReviews: [], flowDispositions: [], flowDeposits: []};
  return {data, chain, version};
}
