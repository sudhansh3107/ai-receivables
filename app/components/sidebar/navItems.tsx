import {
  Sparkles,
  Users,
  FileText,
  Building2,
  Wallet,
  ShieldCheck,
  BarChart3,
  Settings,
} from "lucide-react";

export const navItems = [
  {
    label: "Mission Control",
    icon: Sparkles,
    href: "/",
  },
  {
    label: "Employees",
    icon: Users,
    href: "/employees",
    disabled: true,
  },
  {
    label: "Invoices",
    icon: FileText,
    href: "/invoices",
    disabled: true,
  },
  {
    label: "Customers",
    icon: Building2,
    href: "/customers",
    disabled: true,
  },
  {
    label: "Payments",
    icon: Wallet,
    href: "/payments",
    disabled: true,
  },
  {
    label: "Approvals",
    icon: ShieldCheck,
    href: "/approvals",
    disabled: true,
  },
  {
    label: "Insights",
    icon: BarChart3,
    href: "/insights",
    disabled: true,
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
    disabled: true,
  },
];