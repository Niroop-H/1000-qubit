import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import {ThemeProvider} from "./Theme";
import "./themes.css";
import WorkspaceAccess from "./WorkspaceAccess";
import {AccessProvider} from "./access/AccessProvider";
const Landing = lazy(() => import("./Landing"));
const DesktopHome = lazy(() => import("./DesktopHome"));
const Studio = lazy(() => import("./App").then((m) => ({ default: m.App })));
const LargeQuantum = lazy(() => import("./LargeQuantum"));
const Playground = lazy(() => import("./lab/Playground"));
const Lab = lazy(() => import("./lab/LabTwin"));
const Sensing = lazy(() => import("./lab/Sensing"));
const Communication = lazy(() => import("./lab/Communication"));
const desktop = "__TAURI_INTERNALS__" in window;
const path = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
if(desktop) document.title = "D25 Quantum Workspace | MAH Quantum";
const Content = path === '/studio' ? Studio : path === '/1000-plus' ? LargeQuantum : path === '/lab/operations' ? Lab : path === '/lab' ? Playground : path === '/sensing' ? Sensing : path === '/communication' ? Communication : (desktop ? DesktopHome : Landing);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider><AccessProvider><Suspense
      fallback={
        <div
          style={{
            padding: 40,
            background: "#f7f9f4",
            color: "#172124",
            minHeight: "100vh",
          }}
        >
          Loading Quantum Workspace…
        </div>
      }
    >
      {Content === Landing || Content === DesktopHome ? <Content /> : <WorkspaceAccess><Content /></WorkspaceAccess>}
    </Suspense></AccessProvider></ThemeProvider>
  </React.StrictMode>,
);
