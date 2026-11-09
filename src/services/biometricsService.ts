import { apiClient } from "@/services/apiClient";

interface EnrollPayload {
  authenticator_tag: string;
  biometrics_fingerprint: string;
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

function assertOk(body: ApiEnvelope) {
  if (body.ok === false) {
    throw new Error(body.message ?? body.error ?? "Request failed.");
  }
}

async function getUserId(): Promise<string> {
  const response = await apiClient.get("/users/me/profile");
  assertOk(response.data);
  const profile = (response.data?.data ?? response.data) as { id?: string };
  if (!profile?.id) throw new Error("Unable to load your profile.");
  return profile.id;
}

export async function enrollFingerprint(data: EnrollPayload) {
  const user_id = await getUserId();
  const response = await apiClient.post("/biometrics/enroll", {
    ...data,
    user_id,
  });
  assertOk(response.data);
  return response.data;
}

export async function punch(data: PunchPayload) {
  const user_id = await getUserId();
  const response = await apiClient.post("/biometrics/punch", {
    ...data,
    user_id,
  });
  assertOk(response.data);
  return response.data;
}

export async function clearAuthenticator(data: ClearPayload) {
  const response = await apiClient.post("/biometrics/clear", data);
  assertOk(response.data);
  return response.data;
}

export async function fetchDtrRecords() {
  const response = await apiClient.get("/biometrics/dtr");
  assertOk(response.data);
  return response.data;
}
