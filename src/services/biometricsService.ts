import { apiClient } from "@/services/apiClient";

interface EnrollPayload {
  authenticator_tag: string; // device deviceId, e.g. auth-00001
  biometrics_fingerprint: string; // fingerprintId/slot from the enroll response
}

interface PunchPayload {
  authenticator_tag: string;
}

type ClearPayload = Pick<EnrollPayload, "authenticator_tag">;

interface ApiEnvelope {
  ok?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

export interface PageParams {
  page?: number;
  limit?: number;
}

export interface DtrParams extends PageParams {
  missed?: boolean;
}

export interface TransactionParams extends PageParams {
  emp_code?: string;
  start_date?: string;
  end_date?: string;
}

function assertOk(body: ApiEnvelope) {
  if (body.ok === false) {
    throw new Error(body.message ?? body.error ?? "Request failed.");
  }
}

// Same endpoint UserSettings uses. Handles both a bare profile and a { data } envelope.
export async function getUserId(): Promise<string> {
  const response = await apiClient.get("/users/me/profile");
  assertOk(response.data);
  const profile = (response.data?.data ?? response.data) as { id?: string };
  if (!profile?.id) throw new Error("Unable to load your profile.");
  return profile.id;
}

// Enrolls the fingerprint slot and registers the authenticator
export async function enrollFingerprint(data: EnrollPayload) {
  const user_id = await getUserId();
  const response = await apiClient.post("/biometrics/enroll", {
    ...data,
    user_id,
  });
  assertOk(response.data);
  return response.data;
}

// Server decides time in / time out
export async function punch(data: PunchPayload) {
  const user_id = await getUserId();
  const response = await apiClient.post("/biometrics/punch", {
    ...data,
    user_id,
  });
  assertOk(response.data);
  return response.data;
}

// Admin only. The server returns 403 for non-admins.
// Also send `clear_templates` to the device, or it can't enroll again.
export async function clearAuthenticator(data: ClearPayload) {
  const response = await apiClient.post("/biometrics/clear", data);
  assertOk(response.data);
  return response.data;
}

export async function fetchDtrRecords(params: DtrParams = {}) {
  const response = await apiClient.get("/biometrics/dtr", { params });
  assertOk(response.data);
  return response.data;
}

export async function fetchBiometricsTransactions(
  params: TransactionParams = {},
) {
  const response = await apiClient.get("/biometrics/transactions", { params });
  assertOk(response.data);
  return response.data;
}
