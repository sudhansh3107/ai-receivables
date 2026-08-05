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
    href: "/dashboard",
  },
  {
    label: "Employees",
    icon: Users,
    href: "/employees",
  },
  {
    label: "Invoices",
    icon: FileText,
    href: "/invoices",
  },
  {
    label: "Customers",
    icon: Building2,
    href: "/customers",
  },
  {
    label: "Payments",
    icon: Wallet,
    href: "/payments",
  },
  {
    label: "Approvals",
    icon: ShieldCheck,
    href: "/approvals",
  },
  {
    label: "Insights",
    icon: BarChart3,
    href: "/insights",
  },
  {
    label: "Settings",
    icon: Settings,
    href: "/settings",
  },
];