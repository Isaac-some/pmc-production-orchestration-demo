import React, { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { businessBlockers } from "../../../shared/process";
import { usePMC } from "../../api";
import { Files } from "../../components/Files";
import {
  productionData,
  productionFacts,
  deliverySnapshot,
  acceptanceSnapshot,
  reconciliationSnapshot,
  unboundDeliveries,
} from "../../../shared/production";
function Ranges({
  picked,
  ranges,
  setRanges,
}: {
  picked: any[];
  ranges: any;
  setRanges: (v: any) => void;
}) {
  return (
    <>
      {picked.map((o) => (
        <Card
          size="small"
          key={o.scope}
          style={{ marginTop: 12 }}
          title={o.versionName}
        >
          <Space wrap>
            <span>生产日期</span>
            <input
              aria-label={o.versionName + "开始日期"}
              type="date"
              value={ranges[o.scope]?.start || ""}
              onChange={(e) =>
                setRanges({
                  ...ranges,
                  [o.scope]: { ...ranges[o.scope], start: e.target.value },
                })
              }
            />
            <span>至</span>
            <input
              aria-label={o.versionName + "结束日期"}
              type="date"
              value={ranges[o.scope]?.end || ""}
              onChange={(e) =>
                setRanges({
                  ...ranges,
                  [o.scope]: { ...ranges[o.scope], end: e.target.value },
                })
              }
            />
            <Button onClick={() => setRanges({ ...ranges, [o.scope]: {} })}>
              全部日期
            </Button>
          </Space>
          <Table
            size="small"
            rowKey="key"
            pagination={{ pageSize: 5 }}
            dataSource={o.days}
            columns={[
              { title: "生产日期", dataIndex: "date" },
              {
                title: "平台产量",
                dataIndex: "platform",
                render: (x) => x ?? "待回传",
              },
              {
                title: "PM 修正",
                dataIndex: "corrected",
                render: (x) => x ?? "—",
              },
              {
                title: "有效产量",
                dataIndex: "quantity",
                render: (x) => x ?? "待回传",
              },
              { title: "已交付", dataIndex: "used" },
              { title: "可交付", dataIndex: "available" },
            ]}
          />
        </Card>
      ))}
    </>
  );
}
export function DeliveryPanel({
  businessId,
  onFeedback,
}: {
  businessId: string;
  onFeedback?: () => void;
}) {
  const { state, command, user } = usePMC(),
    b = state.businesses.find((b) => b.id === businessId)!,
    p = productionData(state, businessId),
    facts = productionFacts(state, businessId);
  const [scopes, setScopes] = useState<string[]>([]),
    [ranges, setRanges] = useState<any>({}),
    [keys, setKeys] = useState<string[]>([]),
    [files, setFiles] = useState<any[]>([]),
    [tos, setTos] = useState(""),
    [note, setNote] = useState(""),
    [snapshot, setSnapshot] = useState<any>(null),
    [reconcile, setReconcile] = useState(false),
    [oldId, setOldId] = useState(""),
    [oldScopes, setOldScopes] = useState<string[]>([]),
    [oldRanges, setOldRanges] = useState<any>({}),
    [reason, setReason] = useState("");
  const readonly =
      b.completed ||
      b.stage === "LOST" ||
      !["pm", "approver"].includes(user.role) ||
      (user.role === "pm" && user.id !== b.ownerId),
    ds = deliverySnapshot(state, businessId, scopes, ranges),
    as = acceptanceSnapshot(state, businessId, keys),
    unbound = unboundDeliveries(state, businessId),
    rs = reconciliationSnapshot(state, businessId, oldId, oldScopes, oldRanges);
  const blockers = businessBlockers(state, b);
  const selectOptions = ds.options.map((o) => ({
    value: o.scope,
    label: `${o.versionName} / ${o.node.title}`,
  }));
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert
        type="info"
        message="交付使用末端有效日产出；客户验收使用末端已保存的客户反馈批次。所有来源及附件保留提交快照。"
      />
      <Space wrap>
        <Tag>
          末端有效产出 {facts.produced} {b.unit}
        </Tag>
        <Tag>已登记交付 {facts.delivered}</Tag>
        <Tag>
          客户已接受 {facts.accepted} / {b.target}
        </Tag>
      </Space>
      {!!blockers.length && (
        <Alert
          type="warning"
          message={
            "当前阶段存在 # 阻塞意见：" +
            blockers.map((x) => x.title).join("、")
          }
          description="请先处理事务性待办的阻塞意见，再提交交付或验收。"
        />
      )}
      {facts.issues.map((x) => (
        <Alert key={x} message={x} type="warning" />
      ))}
      {!!unbound.length && (
        <Alert
          type="warning"
          message={`有 ${unbound.length} 条历史交付尚未关联生产来源`}
          description="核对后关联原生产日期及客户反馈，保留原交付数量、接受量、流程状态及凭证。"
          action={
            <Button
              disabled={readonly}
              onClick={() => {
                setOldId(unbound[0].id);
                setReconcile(true);
              }}
            >
              核对历史交付来源
            </Button>
          }
        />
      )}
      {["FORMAL_DELIVERY", "SUPPLEMENT_DELIVERY"].includes(b.stage) && (
        <Card
          title={
            b.stage === "SUPPLEMENT_DELIVERY"
              ? "补交付 · 选择生产来源"
              : "正式交付 · 选择生产来源"
          }
        >
          <Select
            aria-label="正式交付生产来源"
            mode="multiple"
            value={scopes}
            onChange={setScopes}
            style={{ width: "100%" }}
            options={selectOptions}
          />
          <Ranges picked={ds.picked} ranges={ranges} setRanges={setRanges} />
          {!!scopes.length &&
            ds.issues.map((x) => <Alert key={x} type="warning" message={x} />)}
          <p>
            本次自动汇总：
            <strong>
              {ds.quantity} {b.unit}
            </strong>
            （已扣除同日历史交付）
          </p>
          <Files value={files} onChange={setFiles} disabled={readonly} />
          <Input
            aria-label="交付TOS地址"
            placeholder="或填写交付 TOS 地址"
            value={tos}
            onChange={(e) => setTos(e.target.value)}
          />
          <Input.TextArea
            placeholder="交付说明"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="primary"
            disabled={
              readonly ||
              !!blockers.length ||
              !scopes.length ||
              !!ds.issues.length ||
              !ds.quantity
            }
            onClick={async () => {
              await command("production.delivery", {
                businessId,
                scopes,
                ranges,
                files,
                tos,
                note,
                fingerprint: ds.fingerprint,
              });
              setScopes([]);
              setFiles([]);
              setTos("");
              setNote("");
            }}
          >
            提交交付并进入客户验收
          </Button>
        </Card>
      )}
      {b.stage === "CUSTOMER_ACCEPTANCE" && (
        <Card title="客户验收 · 选择末端客户反馈批次">
          {onFeedback && (
            <p>
              收到客户反馈后先登记，再从下方选择反馈确认正式验收。
              <Button type="link" onClick={onFeedback}>
                前往候选池登记反馈
              </Button>
            </p>
          )}
          <AcceptanceSelector
            businessId={businessId}
            keys={keys}
            setKeys={setKeys}
          />
          {as.picked.map((r) => (
            <p key={r.key}>
              <Tag>{r.name}</Tag>
              {r.feedback} · 本次 {r.available} {b.unit}
            </p>
          ))}
          {!!keys.length &&
            as.issues.map((x) => <Alert key={x} type="warning" message={x} />)}
          {!!keys.length && (
            <>
              <p>
                本次登记 {as.quantity} {b.unit}；登记后累计 {as.after} /{" "}
                {b.target}。
                {as.after === b.target
                  ? "达到目标，进入发起结项。"
                  : "未达目标，进入补交付。"}
              </p>
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => r.key + r.deliveryId}
                dataSource={as.rows}
                columns={[
                  { title: "客户批次", dataIndex: "name" },
                  { title: "匹配交付记录", dataIndex: "deliveryId" },
                  { title: "接受量", dataIndex: "quantity" },
                ]}
              />
            </>
          )}
          <Button
            type="primary"
            disabled={
              readonly ||
              !!blockers.length ||
              !keys.length ||
              !!as.issues.length
            }
            onClick={async () => {
              await command("production.acceptance", {
                businessId,
                keys,
                fingerprint: as.fingerprint,
              });
              setKeys([]);
            }}
          >
            登记客户验收
          </Button>
        </Card>
      )}
      <Card title="正式交付与客户验收台账">
        <Table
          rowKey="id"
          size="small"
          dataSource={p.deliveries}
          columns={[
            { title: "交付记录", dataIndex: "id" },
            {
              title: "交付日期",
              dataIndex: "at",
              render: (x) => x.slice(0, 10),
            },
            { title: "数量", dataIndex: "quantity" },
            {
              title: "已接受",
              render: (_, d) =>
                p.acceptances
                  .filter((a) => a.deliveryId === d.id && !a.rows?.length)
                  .reduce((a, r) => a + r.quantity, 0) +
                p.acceptances
                  .flatMap((a) => a.rows || [])
                  .filter((r) => r.deliveryId === d.id)
                  .reduce((a, r) => a + r.quantity, 0),
            },
            {
              title: "来源",
              render: (_, d) =>
                d.rows?.length ? (
                  <Tag color="green">已关联</Tag>
                ) : (
                  <Tag color="orange">待核对</Tag>
                ),
            },
            {
              title: "操作",
              render: (_, d) => (
                <Button type="link" onClick={() => setSnapshot(d)}>
                  查看来源快照
                </Button>
              ),
            },
          ]}
        />
        <Table
          rowKey="id"
          size="small"
          dataSource={p.acceptances}
          columns={[
            { title: "验收记录", dataIndex: "id" },
            {
              title: "登记时间",
              dataIndex: "at",
              render: (x) => x.slice(0, 10),
            },
            { title: "本次接受量", dataIndex: "quantity" },
            {
              title: "操作",
              render: (_, d) => (
                <Button type="link" onClick={() => setSnapshot(d)}>
                  查看来源快照
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={!!snapshot}
        title="已提交来源快照 · 只读"
        footer={<Button onClick={() => setSnapshot(null)}>关闭</Button>}
        onCancel={() => setSnapshot(null)}
        width={900}
      >
        <Typography.Paragraph>
          <pre style={{ maxHeight: 500, overflow: "auto" }}>
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </Typography.Paragraph>
      </Modal>
      <Modal
        open={reconcile}
        title="核对历史交付来源"
        width={900}
        onCancel={() => setReconcile(false)}
        okText="确认关联并保留原数量"
        okButtonProps={{
          disabled:
            readonly ||
            !oldScopes.length ||
            !!rs.issues.length ||
            reason.trim().length < 5,
        }}
        onOk={async () => {
          await command("production.reconcile", {
            businessId,
            deliveryId: oldId,
            scopes: oldScopes,
            ranges: oldRanges,
            reason,
            fingerprint: rs.fingerprint,
          });
          setReconcile(false);
          setOldScopes([]);
          setOldRanges({});
          setReason("");
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            aria-label="待核对历史交付"
            style={{ width: "100%" }}
            value={oldId}
            onChange={setOldId}
            options={unbound.map((d) => ({
              value: d.id,
              label: `${d.id} · 原交付 ${d.quantity} ${b.unit}`,
            }))}
          />
          <Select
            aria-label="历史交付生产来源"
            mode="multiple"
            style={{ width: "100%" }}
            value={oldScopes}
            onChange={setOldScopes}
            options={selectOptions}
          />
          <Ranges
            picked={rs.picked}
            ranges={oldRanges}
            setRanges={setOldRanges}
          />
          <p>
            原交付 {rs.delivery?.quantity || 0} / 原接受 {rs.accepted} {b.unit}
            ；按日期从早到晚占用可用产量。
          </p>
          {!!oldScopes.length &&
            rs.issues.map((x) => <Alert key={x} type="warning" message={x} />)}
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rs.rows}
            columns={[
              { title: "版本", dataIndex: "versionName" },
              { title: "生产日期", dataIndex: "date" },
              { title: "本次关联", dataIndex: "quantity" },
            ]}
          />
          <Input.TextArea
            aria-label="历史来源核对依据"
            placeholder="至少 5 字的历史来源核对依据"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Space>
      </Modal>
    </Space>
  );
}
import { acceptanceOptions } from "../../../shared/production";
function AcceptanceSelector({
  businessId,
  keys,
  setKeys,
}: {
  businessId: string;
  keys: string[];
  setKeys: (v: string[]) => void;
}) {
  const { state } = usePMC(),
    options = acceptanceOptions(state, businessId);
  return (
    <Select
      aria-label="选择客户验收批次"
      mode="multiple"
      style={{ width: "100%" }}
      value={keys}
      onChange={setKeys}
      options={options.map((r) => ({
        value: r.key,
        label: `${r.versionName} / ${r.name} · ${r.quantity} · 已登记 ${r.used}`,
      }))}
    />
  );
}
