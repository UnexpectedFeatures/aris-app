import { demoAccounts, type UserAccount, type UserRole } from "@/data/demoAccounts";
import { apiClient } from "@/services/apiClient";
import { isDemoMode } from "@/services/dataSource";

export interface AuthSession {
	user: UserAccount;
	token?: string;
}

type ServerUserRole = UserRole | "admin";

interface ServerUser extends Omit<UserAccount, "role"> {
	role: ServerUserRole;
}

interface SignInPayload {
	user: ServerUser;
	token?: string;
}

interface SignInEnvelope {
	ok?: boolean;
	data?: SignInPayload;
	message?: string;
	error?: string;
}

export function authenticateDemo(email: string, password: string): AuthSession {
	const account = demoAccounts.find(
		(candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
	);
	if (!account || account.password !== password) {
		throw new Error("Email or password is incorrect.");
	}
	const user: UserAccount = {
		id: account.id,
		email: account.email,
		name: account.name,
		role: account.role,
		...(account.staffStage ? { staffStage: account.staffStage } : {}),
	};
	return { user, token: "demo-access-token" };
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
	if (isDemoMode) return authenticateDemo(email, password);

	const response = await apiClient.post<SignInPayload | SignInEnvelope>("/auth/signin", {
		email: email.trim(),
		password,
	});
	if ("ok" in response.data && response.data.ok === false) {
		throw new Error(response.data.message ?? response.data.error ?? "Sign-in failed.");
	}
	const payload = "data" in response.data
		? (response.data as SignInEnvelope).data
		: response.data as SignInPayload;
	if (!payload?.user?.id || !payload.user.email || !isUserRole(payload.user.role)) {
		throw new Error("The server returned an invalid user session.");
	}
	return {
		...payload,
		user: {
			...payload.user,
			role: payload.user.role === "admin" ? "administrator" : payload.user.role,
		},
	};
}

function isUserRole(value: unknown): value is ServerUserRole {
	return value === "administrator" || value === "admin" || value === "professor" || value === "staff";
}
