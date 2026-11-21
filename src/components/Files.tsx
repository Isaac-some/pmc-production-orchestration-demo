import React from "react";
import { Upload, Button, List, Typography, App } from "antd";
import { UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import type { FileRef } from "../../shared/types";
import { usePMC } from "../api";
export function Files({
  value = [],
  onChange,
  limit = 10,
  maxMB = 50,
  disabled = false,
}: {
  value?: FileRef[];
  onChange?: (v: FileRef[]) => void;
  limit?: number;
  maxMB?: number;
  disabled?: boolean;
}) {
  const { message } = App.useApp();
  const { user, refresh } = usePMC();
  return (
    <div>
      <List
        size="small"
        dataSource={value}
        renderItem={(f) => (
          <List.Item
            actions={
              disabled
                ? []
                : [
                    <Button
                      type="text"
                      aria-label={"移除" + f.name}
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        onChange?.(value.filter((x) => x.id !== f.id))
                      }
                    />,
                  ]
            }
          >
            <Typography.Link href={"/api/files/" + f.id} target="_blank">
              {f.name}
            </Typography.Link>
            <span>{(f.size / 1024).toFixed(1)} KB</span>
          </List.Item>
        )}
      />
      {!disabled && (
        <Upload
          showUploadList={false}
          beforeUpload={async (file) => {
            try {
              if (value.filter((x) => x.name !== file.name).length >= limit)
                throw Error("最多" + limit + "个附件");
              if (!file.size || file.size > maxMB * 1024 * 1024)
                throw Error("文件须非空且不超过" + maxMB + "MB");
              const form = new FormData();
              form.append("file", file);
              const r = await fetch("/api/files", {
                method: "POST",
                headers: { "X-Actor": user.id },
                body: form,
              });
              const f = await r.json();
              if (!r.ok) throw Error(f.error);
              await refresh();
              onChange?.([...value.filter((x) => x.name !== f.name), f]);
            } catch (e) {
              message.error((e as Error).message);
            }
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>添加附件</Button>
          <span className="muted">
            {" "}
            最多 {limit} 个，每个 ≤{maxMB} MB · 本地保存
          </span>
        </Upload>
      )}
    </div>
  );
}
