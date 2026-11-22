import React, { useEffect, useId, useState } from "react";
import { Alert, Button, Collapse, Input, Modal, Space, Table, Tag } from "antd";
import { ExperimentOutlined, TableOutlined } from "@ant-design/icons";
import "./ai-table-prompt.css";

export interface AITablePromptProps {
  nodeId: string;
  rule?: { prompt: string; columns: string; version: number };
  disabled?: boolean;
  onConfirm: (prompt: string, columns: string) => Promise<void>;
}

const sample = [
  {
    rowkey: "demo-001",
    tos_path: "tos://demo-motion/001.mp4",
    caption: "  一个人 正在跑步  ",
  },
  {
    rowkey: "demo-002",
    tos_path: "tos://demo-motion/002.mp4",
    caption: "  两个人  向前走  ",
  },
  {
    rowkey: "demo-003",
    tos_path: "tos://demo-motion/003.mp4",
    caption: "  一个人 跳跃  ",
  },
];

/** Preview is deliberately bounded and synthetic; confirmation saves a rule, never item data. */
export function AITablePrompt({
  nodeId,
  rule,
  disabled = false,
  onConfirm,
}: AITablePromptProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [columns, setColumns] = useState("");
  const [preview, setPreview] = useState<{
    prompt: string;
    columns: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setOpen(false);
    setPreview(null);
    setError("");
  }, [nodeId]);
  const previewCurrent =
    !!preview &&
    preview.prompt === prompt.trim() &&
    preview.columns === columns.trim();
  const show = () => {
    setPrompt(rule?.prompt || "");
    setColumns(rule?.columns || "");
    setPreview(null);
    setError("");
    setOpen(true);
  };
  async function confirm() {
    if (!previewCurrent || disabled || saving) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(preview!.prompt, preview!.columns);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "规则保存失败，请重试。",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Button
        icon={<ExperimentOutlined aria-hidden="true" />}
        disabled={disabled}
        onClick={show}
      >
        {rule ? `AI 表处理 · v${rule.version}` : "AI 表处理"}
      </Button>
      <Modal
        title="AI 表处理"
        className="ai-table-prompt-modal"
        open={open}
        width={900}
        centered
        destroyOnHidden
        keyboard={!saving}
        maskClosable={!saving}
        closable={!saving}
        onCancel={() => {
          if (!saving) setOpen(false);
        }}
        footer={
          <div className="ai-table-prompt-footer">
            <span>确认后保存处理规则，交由执行平台处理整批数据。</span>
            <Space>
              <Button disabled={saving} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="primary"
                disabled={!previewCurrent || disabled}
                loading={saving}
                onClick={confirm}
              >
                确认规则并应用
              </Button>
            </Space>
          </div>
        }
        styles={{
          body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto" },
        }}
      >
        <div className="ai-table-prompt-content">
          <p className="ai-table-prompt-intro">
            描述你希望如何处理数据表。先检查几行结果，再确认整批生产的输入规则。
          </p>
          <label className="ai-table-prompt-label" htmlFor={`${id}-prompt`}>
            处理要求
          </label>
          <Input.TextArea
            id={`${id}-prompt`}
            aria-describedby={`${id}-scope`}
            value={prompt}
            disabled={saving || disabled}
            maxLength={6000}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="例如：清理 caption 首尾空格，保留 rowkey 和 tos_path，输出适合人工验收的数据表。"
            onChange={(event) => {
              setPrompt(event.target.value);
              setPreview(null);
              setError("");
            }}
          />
          <Collapse
            ghost
            className="ai-table-prompt-options"
            items={[
              {
                key: "columns",
                label: "表头说明（可选）",
                children: (
                  <>
                    <label
                      className="ai-table-prompt-label"
                      htmlFor={`${id}-columns`}
                    >
                      补充列的含义与处理方式
                    </label>
                    <Input.TextArea
                      id={`${id}-columns`}
                      value={columns}
                      disabled={saving || disabled}
                      maxLength={4000}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      placeholder="例如：caption 是视频动作描述；rowkey 是原始唯一标识，不能改写；tos_path 是视频地址。"
                      onChange={(event) => {
                        setColumns(event.target.value);
                        setPreview(null);
                        setError("");
                      }}
                    />
                  </>
                ),
              },
            ]}
          />
          <div className="ai-table-prompt-preview-action">
            <Button
              icon={<TableOutlined aria-hidden="true" />}
              disabled={!prompt.trim() || saving || disabled}
              onClick={() => {
                setPreview({ prompt: prompt.trim(), columns: columns.trim() });
                setError("");
              }}
            >
              {previewCurrent ? "重新生成预览" : "生成 3 行预览"}
            </Button>
            <span id={`${id}-scope`}>仅预览 3 行，不拉取或展开全量数据。</span>
          </div>
          {error && (
            <Alert
              type="error"
              showIcon
              message="未保存规则"
              description={error}
            />
          )}
          {previewCurrent && (
            <section
              className="ai-table-prompt-preview"
              aria-label="数据表结果预览"
              aria-live="polite"
            >
              <header>
                <h3>结果预览</h3>
                <Tag>模拟 AI · 3 行样例</Tag>
              </header>
              <Alert
                type="info"
                showIcon
                message="模拟预览 · 尚未连接 AI 服务"
                description="下方为固定 caption 清理样例，不代表任意 Prompt 的真实执行结果。确认仅保存规则。"
              />
              <Table
                rowKey="rowkey"
                size="small"
                pagination={false}
                scroll={{ x: 680 }}
                dataSource={sample.map((row) => ({
                  ...row,
                  result: row.caption.trim().replace(/\s+/g, " "),
                }))}
                columns={[
                  { title: "rowkey（保留）", dataIndex: "rowkey", width: 125 },
                  {
                    title: "tos_path（保留）",
                    dataIndex: "tos_path",
                    width: 255,
                  },
                  {
                    title: "caption · 处理前",
                    dataIndex: "caption",
                    width: 150,
                    render: (text) => (
                      <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
                    ),
                  },
                  {
                    title: "caption · 预览结果",
                    dataIndex: "result",
                    width: 150,
                  },
                ]}
              />
            </section>
          )}
        </div>
      </Modal>
    </>
  );
}
