import React from "react";
import ReactDOM from "react-dom/client";
import DesktopApp from "./DesktopApp";
import "@/index.css";
import { UpdateProvider } from "@/providers/UpdateProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UpdateProvider>
      <DesktopApp />
    </UpdateProvider>
  </React.StrictMode>,
);
