import type { JSX } from "react";

export const BRAND = "#3a7d4e";
export const BRAND_DARK = "#0d1a10";

export const icon = (path: JSX.Element) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4.5 h-4.5"
  >
    {path}
  </svg>
);

export type NavItem = {
  path: string;
  label: string;
  icon: JSX.Element;
  children?: { path: string; label: string }[];
};

export const settingsNav: NavItem[] = [
  {
    path: "/admin/settings/system",
    label: "System Settings",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>,
    ),
  },
  {
    path: "/admin/settings/user",
    label: "User Settings",
    icon: icon(
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>,
    ),
  },
];

// Professor-side variant (/prof)
export const profMainNav: NavItem[] = [
  {
    path: "/prof",
    label: "Overview",
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    path: "/prof/notifications",
    label: "Notifications",
    icon: icon(
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
    ),
  },
  {
    path: "/prof/submit",
    label: "Submit",
    children: [
      { path: "/prof/submit", label: "Accomplishment Report" },
      { path: "/submit/dtr", label: "DTR" },
    ],
    icon: icon(
      <>
        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        <path d="M12 3v13M7 8l5-5 5 5" />
      </>,
    ),
  },
  {
    path: "/prof/history",
    label: "History",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>,
    ),
  },
];

export const profAuthenticatorNav: NavItem[] = [
  {
    path: "/prof/biometrics",
    label: "Authenticator",
    icon: icon(
      <>
        <path d="M12 11a2 2 0 00-2 2c0 1.5-.2 3-.6 4.5" />
        <path d="M14 13c0 2.5-.4 4.9-1.2 7" />
        <path d="M8.5 14.5c-.1 1.5-.4 3-1 4.4" />
        <path d="M16 14c0 2-.2 4-.7 5.8" />
        <path d="M12 7a6 6 0 00-6 6" />
        <path d="M18 13a6 6 0 00-12 0" />
        <path d="M12 3a10 10 0 00-10 10" />
        <path d="M22 13a10 10 0 00-2-6" />
      </>,
    ),
  },
  // {
  //   path: "/prof/dtr",
  //   label: "DTR",
  //   icon: icon(
  //     <>
  //       <circle cx="12" cy="12" r="9" />
  //       <path d="M12 7v5l3 2" />
  //       <path d="M5 4 3 6" />
  //       <path d="M19 4l2 2" />
  //     </>,
  //   ),
  // },
  {
    path: "/prof/transactions",
    label: "Transactions",
    icon: icon(
      <>
        <path d="M4 2v20l2-1.5L8 22l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2Z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </>,
    ),
  },
];

export const profMeetNav: NavItem[] = [
  {
    path: "/prof/meet",
    label: "Google Meet",
    icon: icon(
      <>
        <rect x="3" y="6" width="12" height="12" rx="2" />
        <path d="m15 10 6-3v10l-6-3" />
      </>,
    ),
  },
  {
    path: "/prof/summaries",
    label: "Summaries",
    icon: icon(
      <>
        <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
        <path d="M19 11a7 7 0 01-14 0M4 20h16" />
      </>,
    ),
  },
];
export const profHelpNav: NavItem[] = [
  {
    path: "/prof/tickets",
    label: "Tickets",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>,
    ),
  },
];
export const staffHelpNav: NavItem[] = profHelpNav.map((item) => ({
  ...item,
  path: item.path.replace("/prof/", "/staff/"),
}));
export const profSettingsNav: NavItem[] = [
  {
    path: "/prof/settings/preferences",
    label: "User Settings",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>,
    ),
  },
];

export const staffMainNav: NavItem[] = [
  {
    path: "/staff",
    label: "Overview",
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    path: "/staff/approvals",
    label: "Approvals",
    icon: icon(
      <>
        <path d="M9 11l2 2 4-4" />
        <path d="M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </>,
    ),
  },
  {
    path: "/staff/notifications",
    label: "Notifications",
    icon: icon(
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
    ),
  },
];

export const staffSettingsNav: NavItem[] = [
  {
    path: "/staff/settings",
    label: "User Settings",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>,
    ),
  },
];
