import React, { useState } from "react";
import { Alert, Button, Form, Input, Modal, Space, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import "./human-platform-prototype.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onBind: (executorId: string, batchIds: string[]) => Promise<void>;
};

/** The project dialog follows the observed PMC dialog; batch controls are local POC extensions. */
function HumanPlatformDialog({ onClose, onBind }: Omit<Props, "open">) {
  const [projectForm] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [project, setProject] = useState<{
    id: string;
    name: string;
    description: string;
  }>();
  const [batchId, setBatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submitBatch() {
    try {
      await batchForm.validateFields();
      if (!project || saving) return;
      setSaving(true);
      setError("");
      const id = batchId || `human-batch-demo-${crypto.randomUUID()}`;
      setBatchId(id);
      await onBind(project.id, [id]);
      onClose();
    } catch (e) {
      if (e instanceof Error)
        setError(e.message || "回传失败，请重试；已填信息保留。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      width={project ? 760 : 520}
      style={{ top: 100 }}
      className="human-platform-prototype"
      destroyOnHidden
      maskClosable={!saving}
      closable={!saving}
      onCancel={onClose}
      title={
        project ? (
          <Space>
            <UserOutlined />
            <span>人工标注生产批次</span>
            <Tag>本地模拟</Tag>
          </Space>
        ) : (
          "新建并绑定人工标注项目"
        )
      }
      footer={
        project ? (
          <Space>
            <Button disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void submitBatch()}
            >
              创建批次并回传编排
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={() => projectForm.submit()}>
              创建并绑定
            </Button>
          </Space>
        )
      }
    >
      {!project ? (
        <Form
          form={projectForm}
          layout="vertical"
          requiredMark
          onFinish={(values) =>
            setProject({
              id: `human-project-demo-${crypto.randomUUID()}`,
              name: values.name.trim(),
              description: values.description?.trim() || "",
            })
          }
        >
          <p className="human-prototype-context">
            本地模拟 · 不创建真实人工标注项目
          </p>
          <Form.Item
            label="项目名称"
            name="name"
            rules={[
              { required: true, whitespace: true, message: "请输入项目名称" },
            ]}
          >
            <Input aria-label="人工项目名称" maxLength={120} />
          </Form.Item>
          <Form.Item label="项目简介" name="description">
            <Input.TextArea
              aria-label="人工项目简介"
              rows={3}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      ) : (
        <div className="human-batch-panel">
          <div className="human-project-summary">
            <div>
              <strong>{project.name}</strong>
              <span>人工标注项目</span>
            </div>
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              disabled={saving}
              onClick={() => {
                setBatchId("");
                setError("");
                setProject(undefined);
              }}
            >
              修改项目
            </Button>
          </div>
          <Alert
            type="info"
            showIcon
            message="以生产批次绑定，终端队列确认结果"
            description="本面板为本地 POC，任务不会提交到人工平台。中间队列流转不计产出；终端结果确认后回到编排缓冲池。"
          />
          <Form
            form={batchForm}
            layout="vertical"
            initialValues={{
              name: `${project.name} · 首批`,
              queue: "最终质检通过",
            }}
          >
            <Form.Item
              label="生产批次名称"
              name="name"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请输入生产批次名称",
                },
              ]}
            >
              <Input aria-label="人工生产批次名称" maxLength={120} />
            </Form.Item>
            <Form.Item
              label="终端队列名称"
              name="queue"
              extra="只统计该批次最终可交付的队列，避免重复累计中间工序。"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请输入终端队列名称",
                },
              ]}
            >
              <Input aria-label="人工终端队列名称" maxLength={120} />
            </Form.Item>
          </Form>
          <div className="human-binding-preview">
            <CheckCircleOutlined />
            <div>
              <strong>回传 1 个生产批次</strong>
              <p>
                绑定到当前人工工序；后续放行、生产事件、异常处置与交付在编排中继续。
              </p>
            </div>
          </div>
          {error && (
            <Alert
              type="error"
              showIcon
              message="回传未完成"
              description={error}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
export function HumanPlatformPrototype({ open, ...props }: Props) {
  return open ? <HumanPlatformDialog {...props} /> : null;
}
