/** Throwaway UI review: data actions opened from production canvas nodes and edges. */
import React, { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
} from "antd";
import {
  ArrowRightOutlined,
  CloudOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  HistoryOutlined,
  LeftOutlined,
  RightOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import "./data-capabilities-prototype.css";

type Row = {
  rowkey: string;
  tos_path: string;
  caption?: string;
  payload?: unknown;
  [key: string]: unknown;
};
type RecordItem = {
  id: string;
  time: string;
  title: string;
  detail: string;
  sample: string;
  requirement: string;
  prompt: string;
  before: Row[];
  after?: Row[];
  file?: string;
};
const sourceRows: Row[] = [
  {
    rowkey: "demo-101",
    tos_path: "tos://demo-source/clips/101.mp4",
    caption: "行人经过路口",
  },
  {
    rowkey: "demo-102",
    tos_path: "tos://demo-source/clips/102.mp4",
    caption: "车辆进入隧道",
  },
  {
    rowkey: "demo-103",
    tos_path: "tos://demo-source/clips/103.mp4",
    caption: "雨天道路",
  },
];
const sampleJSON = JSON.stringify(
  { data: { video: "tos://demo-source/clips/101.mp4", text: "行人经过路口" } },
  null,
  2,
);
function download(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadCSV(name: string, rows: Row[]) {
  const XLSX = await import("xlsx");
  download(
    name,
    "\ufeff" +
      XLSX.utils.sheet_to_csv(
        XLSX.utils.json_to_sheet(
          rows.map((row) => ({
            ...row,
            payload: row.payload ? JSON.stringify(row.payload) : "",
          })),
        ),
      ),
    "text/csv;charset=utf-8",
  );
}
export function DataCapabilitiesPrototype({
  initialSection = "adapt",
  sourceLabel,
  targetLabel,
}: {
  initialSection?: string;
  sourceLabel: string;
  targetLabel: string;
}) {
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const [sample, setSample] = useState(sampleJSON);
  const [requirement, setRequirement] = useState(
    "把每行视频地址和描述整理成目标样例中的 data.video、data.text。",
  );
  const [purpose, setPurpose] = useState("标注格式适配");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [scope, setScope] = useState("directory");
  const [sources, setSources] = useState<string[]>([
    "tos://demo-source/clips/",
  ]);
  const [sourceDialog, setSourceDialog] = useState(false);
  const [openedRecord, setOpenedRecord] = useState<RecordItem | null>(null);
  const [viewRows, setViewRows] = useState<{
    title: string;
    rows: Row[];
  } | null>(null);
  const { message } = App.useApp();
  const active = records.find((item) => item.id === activeId);
  const sourceName = `${sourceLabel} · 3条演示数据`;
  const targetName = targetLabel;
  const prompt = `请处理我附带的 source.csv。\n来源：${sourceName}\n目标：${targetName}\n处理目的：${purpose}\n目标JSON样例：\n${sample}\n本次要求：${requirement}\n每条结果保留原始 rowkey、tos_path 的原值。新素材地址写入新字段。请先展示少量转换样例供我确认，缺失的映射向我询问。\n完成后交回含来源字段的结果CSV，以及处理说明。JSON如何承载以目标平台实际导入要求为准，请先与我确认。`;
  const createProcessingRecord = () => {
    try {
      JSON.parse(sample);
    } catch {
      message.error("请提供有效的目标JSON样例");
      return;
    }
    if (!requirement.trim()) {
      message.error("请补充本次处理要求");
      return;
    }
    const id = `DEMO-${records.length + 1}`;
    setRecords((items) => [
      {
        id,
        time: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        title: purpose,
        detail: "已准备材料，等待离线处理结果",
        sample,
        requirement,
        prompt,
        before: sourceRows.map((row) => ({ ...row })),
      },
      ...items,
    ]);
    setActiveId(id);
    setPreview(null);
    setFileName("");
    setError("");
    downloadCSV("source.csv", sourceRows);
    download("target-example.json", sample, "application/json");
    download("codex-prompt.txt", prompt);
    message.success("处理材料已下载，本次记录已创建");
  };
  const validateRows = (rows: Row[], filename: string) => {
    setPreview(null);
    setFileName(filename);
    const missing = rows.findIndex((row) => !row.rowkey || !row.tos_path);
    if (!rows.length) {
      setError("文件中没有记录，空文件的处理规则待确认");
      return;
    }
    if (missing >= 0) {
      setError(
        `第${missing + 1}条缺少原始 rowkey 或 tos_path，请修正后重新上传`,
      );
      return;
    }
    if (new Set(rows.map((row) => row.rowkey)).size !== rows.length) {
      setError("检测到重复来源，需核对回传范围后继续");
      return;
    }
    if (
      rows.some(
        (row) =>
          !active?.before.some(
            (original) =>
              original.rowkey === row.rowkey &&
              original.tos_path === row.tos_path,
          ),
      )
    ) {
      setError("回传来源与本次导出范围不匹配，请核对原始来源字段");
      return;
    }
    setError("");
    setPreview(rows);
  };
  const readReturn = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      validateRows(
        XLSX.utils.sheet_to_json<Row>(book.Sheets[book.SheetNames[0]], {
          defval: "",
        }),
        file.name,
      );
    } catch {
      setError("文件无法读取，请使用CSV文件");
    }
  };
  const rowColumns = [
    { title: "原始rowkey", dataIndex: "rowkey", width: 140 },
    { title: "原始tos_path", dataIndex: "tos_path", ellipsis: true },
    {
      title: "内容",
      render: (_: unknown, row: Row) => (
        <code>{JSON.stringify(row.payload || row.caption || row)}</code>
      ),
    },
  ];
  const nav = (
    <Tabs
      activeKey={section}
      onChange={setSection}
      items={[
        { key: "sources", label: "数据来源" },
        { key: "adapt", label: "标注适配" },
        {
          key: "records",
          label: (
            <>
              处理记录{" "}
              {records.length > 0 && (
                <span className="dc-count">{records.length}</span>
              )}
            </>
          ),
        },
      ]}
    />
  );
  const sourceView = (
    <>
      <div className="dc-title-row">
        <div>
          <h3>持续接入TOS数据</h3>
          <p>已有文件与后续新增文件汇入当前蓄水池</p>
        </div>
        <Button type="primary" onClick={() => setSourceDialog(true)}>
          添加TOS来源
        </Button>
      </div>
      {sources.map((item, index) => (
        <div className="dc-source" key={item}>
          <CloudOutlined />
          <div>
            <strong>{item}</strong>
            <p>目标 CID-DEMO-POOL · 当前项目内去重</p>
          </div>
          <Tag color={index === 0 ? "green" : "blue"}>
            {index === 0 ? "持续接入 · 示例" : "配置已保存 · 演示"}
          </Tag>
        </div>
      ))}
      <div className="dc-metrics">
        <div>
          <span>本轮发现</span>
          <b>128</b>
        </div>
        <div>
          <span>入库并追加CID</span>
          <b>120</b>
        </div>
        <div>
          <span>重复跳过</span>
          <b>6</b>
        </div>
        <div>
          <span>失败待处理</span>
          <b className="dc-warning">2</b>
        </div>
      </div>
      <Alert
        type="warning"
        showIcon
        message="2个文件待处理 · 示例"
        description="1个文件不可读取，1个文件入库成功但CID追加失败。"
        action={
          <Button
            onClick={() =>
              setViewRows({
                title: "来源异常 · 示例",
                rows: [
                  {
                    rowkey: "demo-bad-1",
                    tos_path: "tos://demo-source/clips/bad.mp4",
                    caption: "文件不可读取",
                  },
                  {
                    rowkey: "demo-bad-2",
                    tos_path: "tos://demo-source/clips/pending.mp4",
                    caption: "CID追加失败",
                  },
                ],
              })
            }
          >
            查看明细
          </Button>
        }
      />
    </>
  );
  const adaptView = (
    <>
      <div className="dc-title-row">
        <div>
          <h3>为人工标注准备数据</h3>
          <p>
            {sourceName} → {targetName}
          </p>
        </div>
        <Space>
          <Tag>{active ? active.id : "待创建处理记录"}</Tag>
          {active && (
            <Button
              size="small"
              onClick={() => {
                setActiveId("");
                setPreview(null);
                setError("");
              }}
            >
              新建处理
            </Button>
          )}
        </Space>
      </div>
      <label className="dc-label">处理目的</label>
      <Select
        disabled={!!active}
        value={active?.title || purpose}
        onChange={setPurpose}
        options={["标注格式适配", "本地素材修复后回传"].map((value) => ({
          value,
          label: value,
        }))}
        style={{ width: "100%" }}
      />
      <div className="dc-title-row dc-field-heading">
        <label className="dc-label">目标JSON样例</label>
        <Upload
          disabled={!!active}
          showUploadList={false}
          accept=".json"
          beforeUpload={(file) => {
            file.text().then(setSample);
            return false;
          }}
        >
          <Button size="small">上传样例</Button>
        </Upload>
      </div>
      <Input.TextArea
        aria-label="目标JSON样例"
        className="dc-code-input"
        readOnly={!!active}
        value={active?.sample || sample}
        onChange={(e) => setSample(e.target.value)}
        rows={7}
      />
      <label className="dc-label">本次处理要求</label>
      <Input.TextArea
        aria-label="本次处理要求"
        readOnly={!!active}
        value={active?.requirement || requirement}
        onChange={(e) => setRequirement(e.target.value)}
        rows={2}
        placeholder="说明字段如何对应，或粘贴本地素材修复要求"
      />
      <div className="dc-actions">
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          disabled={!!active}
          onClick={createProcessingRecord}
        >
          下载处理材料
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(active?.prompt || prompt);
              message.success("提示词已复制");
            } catch {
              download("codex-prompt.txt", active?.prompt || prompt);
            }
          }}
        >
          复制提示词
        </Button>
        <Button
          type="text"
          onClick={() =>
            Modal.info({
              title: "交给Codex的提示词",
              width: 720,
              content: (
                <pre className="dc-prompt">{active?.prompt || prompt}</pre>
              ),
            })
          }
        >
          查看提示词
        </Button>
      </div>
      <p className="dc-note">
        下载包含来源CSV、JSON样例和提示词。处理完成后，回到同一条记录回传。
      </p>
      {active && !active.after && (
        <div className="dc-return">
          <div className="dc-title-row">
            <h3>回传至 {active.id}</h3>
            <Tag color="orange">等待回传</Tag>
          </div>
          <Space wrap>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={(file) => {
                void readReturn(file);
                return false;
              }}
            >
              <Button>上传处理后的CSV</Button>
            </Upload>
            <Button
              type="text"
              onClick={() =>
                validateRows(
                  active.before.map((row) => ({
                    ...row,
                    payload: {
                      data: { video: row.tos_path, text: row.caption },
                    },
                  })),
                  "result-demo.csv",
                )
              }
            >
              载入演示结果
            </Button>
          </Space>
          {fileName && <p>{fileName}</p>}
          {error && <Alert type="error" showIcon message={error} />}
          {preview && (
            <>
              <Alert
                type="info"
                message={`来源字段检查通过 · ${active.before.length}条导出 → ${preview.length}条回传`}
                description="目标JSON与标注界面是否兼容，需结合实际导入要求核对。"
              />
              <div className="dc-preview">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="rowkey"
                  dataSource={preview}
                  columns={rowColumns}
                  scroll={{ x: 650 }}
                />
              </div>
              <Button
                type="primary"
                onClick={() => {
                  setRecords((items) =>
                    items.map((item) =>
                      item.id === active.id
                        ? {
                            ...item,
                            after: preview,
                            file: fileName,
                            detail: `回传已确认 · 结果 CID-DEMO-RESULT-${item.id}`,
                          }
                        : item,
                    ),
                  );
                  setPreview(null);
                  setSection("records");
                  message.success("演示结果已确认，可查看本次数据变化记录");
                }}
              >
                确认回传结果
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
  const historyView = (
    <>
      <div className="dc-title-row">
        <div>
          <h3>数据变化过程</h3>
          <p>从来源、处理要求和文件找到本次结果</p>
        </div>
        <Button
          onClick={() => {
            setActiveId("");
            setPreview(null);
            setError("");
            setSection("adapt");
          }}
        >
          发起处理
        </Button>
      </div>
      {records.length === 0 ? (
        <div className="dc-empty">
          <HistoryOutlined />
          <h3>处理记录将出现在这里</h3>
          <p>下载处理材料后，保留本次来源、要求和文件关系</p>
          <Button onClick={() => setSection("adapt")}>准备处理材料</Button>
        </div>
      ) : (
        records.map((item) => (
          <button
            className="dc-record"
            key={item.id}
            onClick={() => setOpenedRecord(item)}
          >
            <div>
              <strong>{item.title}</strong>
              <Tag color={item.after ? "green" : "orange"}>
                {item.after ? "已回传" : "待回传"}
              </Tag>
            </div>
            <p>
              {item.id} · {item.time} · 当前演示用户
            </p>
            <div className="dc-record-flow">
              <span>
                上游CID
                <br />
                <b>{item.before.length}条</b>
              </span>
              <ArrowRightOutlined />
              <span>
                source.csv
                <br />
                <b>离线处理</b>
              </span>
              <ArrowRightOutlined />
              <span>
                {item.after ? `CID-DEMO-RESULT-${item.id}` : "等待结果"}
                <br />
                <b>{item.after ? `${item.after.length}条` : "待回传"}</b>
              </span>
            </div>
          </button>
        ))
      )}
    </>
  );
  const panel = (
    <section className="dc-panel">
      {nav}
      {section === "sources"
        ? sourceView
        : section === "records"
          ? historyView
          : adaptView}
    </section>
  );
  return (
    <div className="dc-prototype dc-in-canvas">
      <Alert type="info" showIcon message="处理交互示例" description="以下使用3条样例演示下载、提示词与回传记录，不是当前节点的原始CSV。实际文件需从上游取得；尚未接入TOS扫描或AI执行。" />
      {panel}
      <Modal
        open={sourceDialog}
        title="添加TOS来源"
        onCancel={() => setSourceDialog(false)}
        okText="保存来源配置"
        onOk={() => {
          if (!bucket.trim() || (scope === "directory" && !prefix.trim())) {
            message.error("请填写桶名和目录，或明确选择整桶");
            return;
          }
          const path = `tos://${bucket
            .trim()
            .replace(/^tos:\/\//, "")
            .replace(
              /\/$/,
              "",
            )}/${scope === "bucket" ? "" : prefix.replace(/^\//, "")}`;
          if (sources.includes(path)) {
            message.warning("该来源已经存在");
            return;
          }
          setSources((items) => [...items, path]);
          setSourceDialog(false);
          message.success("来源配置已保存至演示会话");
        }}
      >
        <label className="dc-label">TOS桶</label>
        <Input
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          placeholder="填写桶名称"
        />
        <label className="dc-label">扫描范围</label>
        <Select
          value={scope}
          onChange={setScope}
          style={{ width: "100%" }}
          options={[
            { value: "directory", label: "指定目录" },
            { value: "bucket", label: "整个桶" },
          ]}
        />
        {scope === "directory" && (
          <>
            <label className="dc-label">目录前缀</label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="例如 incoming/video/"
            />
          </>
        )}
        <p>入库目标 CID-DEMO-POOL · 去重范围为当前项目</p>
        <Alert
          type="info"
          message="此原型演示来源配置与状态展示"
          description="真实桶授权、入库和CID追加由后端服务接入。"
        />
      </Modal>
      <Modal
        open={!!openedRecord}
        onCancel={() => setOpenedRecord(null)}
        title={openedRecord ? `${openedRecord.id} · ${openedRecord.title}` : ""}
        width={780}
        footer={null}
      >
        {openedRecord && (
          <>
            <p>{openedRecord.time} · 当前演示用户</p>
            <p>
              {sourceName} → {targetName}
            </p>
            <div className="dc-actions">
              <Button
                onClick={() =>
                  setViewRows({
                    title: "处理前数据",
                    rows: openedRecord.before,
                  })
                }
              >
                打开处理前数据
              </Button>
              <Button
                disabled={!openedRecord.after}
                onClick={() =>
                  setViewRows({ title: "回传数据", rows: openedRecord.after! })
                }
              >
                打开回传数据
              </Button>
              <Button
                onClick={() => downloadCSV("source.csv", openedRecord.before)}
              >
                下载原CSV
              </Button>
              {openedRecord.after && (
                <Button
                  onClick={() =>
                    downloadCSV(
                      openedRecord.file || "result.csv",
                      openedRecord.after!,
                    )
                  }
                >
                  下载回传CSV
                </Button>
              )}
              {!openedRecord.after && (
                <Button
                  type="primary"
                  onClick={() => {
                    setActiveId(openedRecord.id);
                    setPreview(null);
                    setError("");
                    setFileName("");
                    setSection("adapt");
                    setOpenedRecord(null);
                  }}
                >
                  继续回传
                </Button>
              )}
            </div>
            <h4>处理要求</h4>
            <p>{openedRecord.requirement}</p>
            <h4>目标JSON样例</h4>
            <pre className="dc-prompt">{openedRecord.sample}</pre>
            <details>
              <summary>查看本次提示词</summary>
              <pre className="dc-prompt">{openedRecord.prompt}</pre>
            </details>
            <p>{openedRecord.detail}</p>
            {openedRecord.after && (
              <p>
                结果 CID-DEMO-RESULT-{openedRecord.id} · 面向人工标注 ·
                目标平台接收状态待核验
              </p>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={!!viewRows}
        title={viewRows?.title}
        onCancel={() => setViewRows(null)}
        width={980}
        footer={null}
      >
        <Table
          size="small"
          rowKey="rowkey"
          pagination={false}
          dataSource={viewRows?.rows}
          columns={rowColumns}
          scroll={{ x: 700 }}
        />
      </Modal>
      <div className="dc-footnote">演示会话中的操作和处理记录在刷新后重置</div>
    </div>
  );
}
