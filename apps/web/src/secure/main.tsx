import React from "react";
import ReactDOM from "react-dom/client";
import D25AccountGate from "../D25AccountGate";
import ProtectedWorkbench from "./ProtectedWorkbench";
import "./secure.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode>
  <D25AccountGate><ProtectedWorkbench/></D25AccountGate>
 </React.StrictMode>
);
