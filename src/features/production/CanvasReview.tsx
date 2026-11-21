import React, { useMemo, useState } from "react";
import { Alert, App } from "antd";
import { type ProductionData, type ProductionVersion } from "../../../shared/production";
import { FlowBoard, type BoardSelection } from "./FlowBoard";
import { canvasReviewScenario } from "./canvas-review-scenario";
import { experienceSignals } from "./experience-model";

export function CanvasReview({ businessId, data, template }: {businessId: string; data: ProductionData; template: ProductionVersion}) {
  const fixture = useMemo(() => canvasReviewScenario(data, template), [data, template.id]);
  const [version, setVersion] = useState(fixture.version);
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const {message} = App.useApp();
  const p = {...fixture.data, chains: fixture.data.chains.map(c => c.id === fixture.chain.id ? {...c, versions: [version]} : c)};
  return <div className="canvas-review"><Alert type="info" showIcon message="运动感知方案示例 · 仅用于检查画布设计" description="可点选、拖动、展开内部步骤和查看数据。数量为本地示例；配置仅在本次页面中变化，平台操作与项目存储保持隔离。" />
    <FlowBoard businessId={businessId} previewData={p} chain={fixture.chain} version={version} disabled={false} operational={false} dirty={false} onChange={setVersion} selection={selection} onSelect={setSelection} signals={experienceSignals(p, fixture.chain.id, version)} onIssue={() => message.info("示例中的问题可在右侧查看；实际处置请切换到当前链路。")} />
  </div>;
}
