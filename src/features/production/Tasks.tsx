import React, { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
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
  platforms,
  grainNames,
  productionData,
  money,
} from "../../../shared/production";
export function PlatformTasks({ businessId }: { businessId: string }) {
  const { state, command, user } = usePMC(),
    p = productionData(state, businessId),
    [platform, setPlatform] = useState("RESOURCE"),
    [open, setOpen] = useState(false),
    [view, setView] = useState<any>(null),
    [form] = Form.useForm();
  const b = state.businesses.find((b) => b.id === businessId)!,
    disabled =
      b.completed ||
      b.stage === "LOST" ||
      !["pm", "approver"].includes(user.role) ||
      (user.role === "pm" && user.id !== b.ownerId);
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert
        message="本地模拟生产平台：创建任务与执行明细供编排绑定，不连接真实业务平台，不执行真实数据搬运。"
        type="info"
      />
      <Space wrap>
        <Select
          aria-label="生产平台"
          value={platform}
          onChange={setPlatform}
          options={Object.entries(platforms)
            .filter(([k]) => k !== "COLLECTION")
            .map(([value, label]) => ({ value, label }))}
        />
        <Button
          type="primary"
          disabled={disabled}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ count: 3, unit: b.unit });
            setOpen(true);
          }}
        >
          创建模拟平台任务
        </Button>
      </Space>
      <Table
        rowKey="id"
        dataSource={p.tasks.filter((t) => t.platform === platform)}
        columns={[
          { title: "任务ID", dataIndex: "id" },
          { title: "任务名称", dataIndex: "name" },
          {
            title: "创建时间",
            dataIndex: "createdAt",
            render: (x) => x.slice(0, 16).replace("T", " "),
          },
          { title: "计量单位", dataIndex: "unit" },
          { title: "明细数", render: (_, r) => r.details.length },
          {
            title: "操作",
            render: (_, r) => (
              <Button type="link" onClick={() => setView(r)}>
                查看任务 / 明细
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={"创建" + platforms[platform] + "任务（模拟）"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          layout="vertical"
          form={form}
          onFinish={async (v) => {
            await command("production.createTask", {
              businessId,
              platform,
              ...v,
            });
            setOpen(false);
          }}
        >
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="unit" label="计量单位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="count"
            label="初始模拟明细数"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={100} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="平台任务详情（模拟）"
        open={!!view}
        footer={<Button onClick={() => setView(null)}>关闭</Button>}
        onCancel={() => setView(null)}
        width={800}
      >
        {view && (
          <>
            <p>
              {view.name} <Tag>{view.id}</Tag> · 最小颗粒度：
              {grainNames[view.platform]}
            </p>
            <Table
              rowKey="id"
              dataSource={view.details}
              columns={[
                { title: "ID", dataIndex: "id" },
                { title: "名称", dataIndex: "name" },
                {
                  title: "已输出",
                  dataIndex: "output",
                  render: (x) => x ?? "待回传",
                },
                { title: "成本", dataIndex: "cost", render: money },
              ]}
            />
          </>
        )}
      </Modal>
    </Space>
  );
}
