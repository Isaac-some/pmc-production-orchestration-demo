import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { usePMC } from "../../api";
import {
  latest,
  platforms,
  type ProductionNode,
} from "../../../shared/production";
import { pipeRows, type PullReceipt } from "../../../shared/pull-flow";
import "./pull-flow.css";
export function PlatformResults() {
  const { state, user, command, busy } = usePMC(),
    [params] = useSearchParams(),
    { message } = App.useApp();
  const businessId = params.get("businessId") || "",
    chainId = params.get("chainId") || "",
    nodeId = params.get("nodeId") || "";
  const p = state.production[businessId],
    ch = p?.chains.find((ch) => ch.id === chainId),
    v = ch && latest(ch),
    n = v?.nodes.find((n) => n.id === nodeId),
    b = state.businesses.find((b) => b.id === businessId);
  const [receiptId, setReceiptId] = useState<string>(),
    [quantity, setQuantity] = useState(1),
    [prefix, setPrefix] = useState("结果"),
    [cost, setCost] = useState<number | null>(null),
    [values, setValues] = useState<Record<string, any>>({
      合格: true,
      分数: 90,
      描述: "已完成标注",
    }),
    [omitted, setOmitted] = useState<string[]>([]),
    [pullCount, setPullCount] = useState(1),
    [source, setSource] = useState<string>();
  const [schemaOpen, setSchemaOpen] = useState(false),
    [schema, setSchema] = useState<NonNullable<ProductionNode["resultFields"]>>(
      [],
    );
  if (!p || !ch || !v || !n || !b || v.mode !== "pull" || n.kind !== "platform")
    return <Alert message="平台关联不存在，请从当前编排打开平台入口。" />;
  const disabled =
    busy ||
    ch.voided ||
    b.completed ||
    b.stage === "LOST" ||
    !["pm", "approver"].includes(user.role) ||
    (user.role === "pm" && user.id !== b.ownerId) ||
    !!ch.draft ||
    v.status !== "RUNNING";
  const incoming = v.edges.filter((e) => e.to === n.id),
    receipts = (p.pullReceipts || []).filter(
      (r) => r.chainId === ch.id && r.to === n.id,
    );
  const call = (action: string, extra: object) =>
    command(`production.flow.${action}`, {
      businessId,
      chainId,
      versionId: v.id,
      nodeId,
      ...extra,
    });
  return (
    <main className="pull-platform">
      <header>
        <div>
          <Tag color="blue">本地下游平台 · 虚构数据</Tag>
          <h2>
            {platforms[n.platform]} / {n.platformRef}
          </h2>
          <span>
            {b.name} · {n.title}
          </span>
        </div>
        <Button
          href={`/#/projects?detail=${businessId}&tab=orchestration&chainId=${chainId}`}
        >
          返回项目编排
        </Button>
      </header>
      <Alert
        type="info"
        showIcon
        message="此页模拟下游取数、独立批次和平台已产出的结果。素材加工、切片和质检均发生在平台侧，中枢只读取结果引用。"
      />
      {disabled && (
        <Alert
          type="warning"
          message="当前仅可查看：请确认项目权限，发布编排并开始生产后再登记。"
        />
      )}
      <Card title="向上游请求数据">
        <Space wrap>
          <Select
            placeholder="选择上游"
            style={{ width: 240 }}
            value={source}
            onChange={setSource}
            options={incoming.map((e) => ({
              value: e.from,
              label: v.nodes.find((n) => n.id === e.from)?.title,
            }))}
          />
          <InputNumber
            aria-label="下游请求数量"
            min={1}
            value={pullCount}
            onChange={(x) => setPullCount(x || 1)}
          />
          <Button
            disabled={disabled || !source}
            onClick={async () => {
              const r = await call("pull", {
                from: source,
                to: n.id,
                count: pullCount,
                requestId: crypto.randomUUID(),
              });
              setReceiptId(r.id);
              message.success("已领取，独立批次已留存");
            }}
          >
            请求取数
          </Button>
        </Space>
        {source && (
          <p>
            {pipeRows(p, ch.id, v, source, n.id).open ? "管道开放" : "管道关闭"}{" "}
            · 当前可取 {pipeRows(p, ch.id, v, source, n.id).available.length} 条
          </p>
        )}
        {!incoming.length && (
          <p>此环节为平台来源，可直接登记已有结果；无需先连接下游。</p>
        )}
        <Table<PullReceipt>
          size="small"
          rowKey="id"
          dataSource={receipts}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: "独立领取批次", dataIndex: "id" },
            { title: "数量", render: (_, r) => r.resultIds.length },
            {
              title: "已登记输出",
              render: (_, r) =>
                (n.flowResults || []).filter((a) => a.receiptId === r.id)
                  .length,
            },
            { title: "状态", render: () => "已领取；执行由本平台负责" },
            {
              title: "操作",
              render: (_, r) => (
                <Button onClick={() => setReceiptId(r.id)}>
                  使用此输入登记结果
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card
        title="登记平台已有结果"
        extra={
          <Button
            disabled={disabled || !!n.flowResults?.length}
            onClick={() => {
              setSchema(n.resultFields || []);
              setSchemaOpen(true);
            }}
          >
            模拟平台字段结构
          </Button>
        }
      >
        <div className="pull-form">
          <label>
            平台结果标识前缀
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </label>
          <label>
            平台已产出条数
            <InputNumber
              min={1}
              max={500}
              value={quantity}
              onChange={(x) => setQuantity(x || 1)}
            />
          </label>
          <label>
            关联输入批次
            <Select
              allowClear
              placeholder="来源平台可留空"
              value={receiptId}
              onChange={setReceiptId}
              options={receipts.map((r) => ({
                value: r.id,
                label: `${r.id} · ${r.resultIds.length} 条输入`,
              }))}
            />
          </label>
          <label>
            每条实际成本（分，空为未知）
            <InputNumber
              min={0}
              precision={0}
              value={cost}
              onChange={(x) => setCost(x == null ? null : Number(x))}
            />
          </label>
          {(n.resultFields || []).map((field) => (
            <label key={field.key}>
              {field.key}（{field.type}）
              <Space>
                {field.type === "boolean" ? (
                  <Select
                    value={values[field.key] ?? true}
                    options={
                      [
                        { value: true, label: "是" },
                        { value: false, label: "否" },
                      ] as any
                    }
                    onChange={(value) =>
                      setValues({ ...values, [field.key]: value })
                    }
                  />
                ) : field.type === "number" ? (
                  <InputNumber
                    value={values[field.key] ?? 0}
                    onChange={(value) =>
                      setValues({ ...values, [field.key]: value })
                    }
                  />
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [field.key]: e.target.value })
                    }
                  />
                )}
                <Checkbox
                  checked={omitted.includes(field.key)}
                  onChange={(e) =>
                    setOmitted(
                      e.target.checked
                        ? [...omitted, field.key]
                        : omitted.filter((k) => k !== field.key),
                    )
                  }
                >
                  未提供
                </Checkbox>
              </Space>
            </label>
          ))}
        </div>
        <Button
          type="primary"
          disabled={
            disabled || !prefix.trim() || (!!incoming.length && !receiptId)
          }
          onClick={async () => {
            const stamp = crypto.randomUUID().slice(0, 8);
            const fields = Object.fromEntries(
              (n.resultFields || [])
                .filter((f) => !omitted.includes(f.key))
                .map((f) => [
                  f.key,
                  values[f.key] ??
                    (f.type === "number"
                      ? 0
                      : f.type === "boolean"
                        ? true
                        : ""),
                ]),
            );
            await call("register", {
              receiptId,
              rows: Array.from({ length: quantity }, (_, i) => ({
                externalId: `${prefix}-${stamp}-${i + 1}`,
                fields,
                cost,
              })),
            });
            message.success("平台结果已登记；不会自动触发下游执行");
          }}
        >
          登记 {quantity} {n.flowUnit} 已有结果
        </Button>
      </Card>
      <Card title="已登记结果与来源">
        <Table
          rowKey="id"
          dataSource={n.flowResults || []}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "结果标识", dataIndex: "externalId" },
            { title: "平台赋值", render: (_, r) => JSON.stringify(r.fields) },
            { title: "单位", dataIndex: "unit" },
            {
              title: "成本",
              render: (_, r) => (r.cost == null ? "待回传" : `${r.cost} 分`),
            },
            { title: "输入来源", render: (_, r) => r.receiptId || "平台来源" },
            { title: "来源数据数", render: (_, r) => r.sourceIds.length },
          ]}
        />
      </Card>
      <Modal
        title="模拟平台字段结构"
        open={schemaOpen}
        onCancel={() => setSchemaOpen(false)}
        onOk={async () => {
          await call("schema", { fields: schema });
          setSchemaOpen(false);
        }}
      >
        <p>
          此结构来自下游平台。登记首条结果后固定，画布可按这些已有字段筛选。
        </p>
        {schema.map((f, i) => (
          <Space key={i} style={{ marginBottom: 10 }}>
            <Input
              aria-label="平台字段名称"
              value={f.key}
              onChange={(e) =>
                setSchema(
                  schema.map((a, j) =>
                    j === i ? { ...a, key: e.target.value } : a,
                  ),
                )
              }
            />
            <Select
              value={f.type}
              options={[
                { value: "number", label: "数值" },
                { value: "text", label: "文本" },
                { value: "boolean", label: "是/否" },
              ]}
              onChange={(type) =>
                setSchema(schema.map((a, j) => (j === i ? { ...a, type } : a)))
              }
            />
            <Button onClick={() => setSchema(schema.filter((_, j) => j !== i))}>
              删除
            </Button>
          </Space>
        ))}
        <Button
          onClick={() =>
            setSchema([...schema, { key: "新字段", type: "text" }])
          }
        >
          添加字段
        </Button>
      </Modal>
    </main>
  );
}
