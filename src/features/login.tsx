/** F01 — test-platform login layout backed only by local demo identities. */
import React from "react";
import { Button, Card, Checkbox, Form, Input } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { usePMC } from "../api";
export function Login({ onLogin }: { onLogin: () => void }) {
  const { state, setUser } = usePMC();
  return (
    <main className="platform-login">
      <section className="login-story">
        <div className="login-brand">
          <img src="/assets/pmc-logo.png" alt="" />
          <div>
            <strong>项目中枢</strong>
            <small>项目全生命周期管理</small>
          </div>
        </div>
        <div className="login-copy">
          <h1>
            贯通项目全程，
            <br />
            掌握每次交付。
          </h1>
          <p>
            统一管理商机、立项、生产与验收，集中掌握项目进度、责任分工和风险状态。
          </p>
        </div>
        <div className="login-journey" aria-hidden="true">
          <svg viewBox="0 0 620 210" aria-label="商机 Demo 立项 交付 验收">
            <path
              className="login-lifecycle-track"
              d="M52 142 C145 42 218 42 304 112 S461 190 568 66"
            />
            <path
              className="login-lifecycle-flow"
              d="M52 142 C145 42 218 42 304 112 S461 190 568 66"
            />
            {[
              ["商机", 52, 142],
              ["Demo", 184, 59],
              ["立项", 304, 112],
              ["交付", 438, 166],
              ["验收", 568, 66],
            ].map(([label, x, y], index) => (
              <g
                key={label}
                className="login-lifecycle-node"
                style={{ "--node-index": index } as React.CSSProperties}
              >
                <circle className="login-lifecycle-halo" cx={x} cy={y} r="18" />
                <circle
                  cx={x}
                  cy={y}
                  r="18"
                  fill="#174c8f"
                  stroke="#a9d0ff"
                  strokeWidth="2"
                />
                <circle cx={x} cy={y} r="5" fill="#fff" />
                <text
                  x={x}
                  y={Number(y) + 42}
                  textAnchor="middle"
                  fill="#d7e8ff"
                  fontSize="13"
                >
                  {label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>
      <section className="login-form-side">
        <Card bordered={false} className="platform-login-card">
          <h2>欢迎回来</h2>
          <p>使用AI基建统一账号登录</p>
          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={(v) => {
              const person = state.users.find((u) => u.account === v.account);
              if (person) setUser(person.id);
              if (v.remember) localStorage.setItem("pmc-remember", v.account);
              else localStorage.removeItem("pmc-remember");
              onLogin();
            }}
            initialValues={{
              account: localStorage.getItem("pmc-remember") || "",
              remember: !!localStorage.getItem("pmc-remember"),
            }}
          >
            <Form.Item
              label="账号"
              name="account"
              rules={[{ required: true, message: "请输入统一账号" }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined />}
                placeholder="请输入统一账号"
              />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                placeholder="请输入密码"
              />
            </Form.Item>
            <Form.Item noStyle name="remember" valuePropName="checked">
              <Checkbox>记住账号</Checkbox>
            </Form.Item>
            <Button size="large" block type="primary" htmlType="submit">
              登录
            </Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}
