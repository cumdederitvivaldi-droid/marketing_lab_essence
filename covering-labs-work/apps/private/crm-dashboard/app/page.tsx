"use client";

import { useEffect, useState } from "react";

const APP_NAME = "crm-dashboard";

function dashboardPath() {
  if (typeof window === "undefined") return "/dashboard/index.html";

  const segments = window.location.pathname.split("/").filter(Boolean);
  const basePath = segments[0] === APP_NAME ? `/${APP_NAME}` : "";

  return `${basePath}/dashboard/index.html`;
}

export default function Page() {
  const [src, setSrc] = useState("");

  useEffect(() => {
    setSrc(dashboardPath());
  }, []);

  return (
    <main className="h-screen overflow-auto bg-[#0b0f17]">
      {!src ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
          CRM 대시보드를 여는 중
        </div>
      ) : (
        <iframe
          className="block h-screen w-full min-w-[1180px] border-0 xl:min-w-0"
          src={src}
          title="CRM 시나리오 대시보드"
        />
      )}
    </main>
  );
}
