import React from "react";
import "@ant-design/v5-patch-for-react-19";
import { createRoot } from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { HashRouter } from "react-router-dom";
import { Provider } from "./api";
import App from "./App";
import { installPublicDemoRuntime } from "./static-runtime";
if (import.meta.env.VITE_PUBLIC_DEMO === "true") installPublicDemoRuntime();
import "antd/dist/reset.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#477eaf",
          colorInfo: "#477eaf",
          colorSuccess: "#4f8064",
          colorWarning: "#a87932",
          colorError: "#b55255",
          colorText: "#263442",
          colorTextSecondary: "#687681",
          colorBorder: "#e4e9ed",
          colorBgLayout: "#f6f8fa",
          borderRadius: 6,
          fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
        },
        components: {
          Button: { controlHeight: 32 },
          Table: { cellPaddingBlock: 9, cellPaddingInline: 12 },
        },
      }}
    >
      <AntApp>
        <HashRouter>
          <Provider>
            <App />
          </Provider>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
