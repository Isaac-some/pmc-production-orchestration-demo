/** F10/F12: trial/report replay drawer and customer feedback dialogs. */
import React from "react";
import { Button, Drawer, Modal, Space } from "antd";
/** Original prototype uses a side drawer for report replay and a modal for feedback. */
export function NodeDialog({
  report,
  title,
  open,
  onCancel,
  onOk,
  okDisabled,
  okText,
  children,
}: {
  report: boolean;
  title: string;
  open: boolean;
  onCancel: () => void;
  onOk: () => void;
  okDisabled: boolean;
  okText?: string;
  children: React.ReactNode;
}) {
  return report ? (
    <Drawer
      rootClassName="production-report-drawer"
      width={620}
      title={title}
      open={open}
      onClose={onCancel}
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" disabled={okDisabled} onClick={onOk}>
            保存回放数据
          </Button>
        </Space>
      }
    >
      {children}
    </Drawer>
  ) : (
    <Modal
      rootClassName="production-feedback-modal"
      width={title.includes("验收批次") ? 600 : 520}
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText={okText}
      okButtonProps={{ disabled: okDisabled }}
    >
      {children}
    </Modal>
  );
}
