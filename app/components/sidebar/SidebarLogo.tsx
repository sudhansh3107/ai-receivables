"use client";

import Image from "next/image";

export default function SidebarLogo() {
  return (
    <div className="flex h-10 items-center">
      {/* Temporary Generic Logo */}
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#8A6846] text-sm font-bold text-white">
  H
</div>

      <div className="ml-3 flex flex-col">
        <span
          className="text-[18px] font-semibold leading-none tracking-[-0.02em]"
          style={{
            color: "#F5EFE7",
          }}
        >
          Headquarters
        </span>
      </div>
    </div>
  );
}