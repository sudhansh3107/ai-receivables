"use client";

import SidebarLogo from "./SidebarLogo";
import SidebarItem from "./SidebarItem";
import SidebarProfile from "./SidebarProfile";
import { navItems } from "./navItems";

export default function Sidebar() {
  return (
    <aside
      className="flex h-screen w-[220px] shrink-0 flex-col border-r"
      style={{
        background: "#0D0D0D",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Logo */}
      <div className="px-6 pt-8">
        <SidebarLogo />
      </div>

      {/* Navigation */}
      <nav className="mt-10 flex flex-col gap-1 px-4">
        {navItems.map((item, index) => (
          <SidebarItem
            key={item.label}
            {...item}
            active={index === 0}
          />
        ))}
      </nav>

      {/* Push profile to bottom */}
      <div className="flex-1" />

      {/* Profile */}
      <div className="px-4 pb-6">
        <SidebarProfile />
      </div>
    </aside>
  );
}