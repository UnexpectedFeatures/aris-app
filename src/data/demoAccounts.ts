export type UserRole = "administrator" | "professor" | "staff";
export type StaffStage = "Checker" | "Secretary" | "HR" | "Accounting";

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  staffStage?: StaffStage;
}

export interface DemoAccount extends UserAccount {
  password: string;
}

export const demoAccounts: DemoAccount[] = [
  {
    id: "professor-demo-001",
    email: "professor@ucc.edu.ph",
    password: "Professor123",
    name: "Amelia Torres",
    role: "professor",
  },
  {
    id: "staff-demo-001",
    email: "staff@ucc.edu.ph",
    password: "Staff12345",
    name: "Jordan Reyes",
    role: "staff",
    staffStage: "Secretary",
  },
];