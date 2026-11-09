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

// Admin gets all records, everyone else gets their own.
// Rows carry missed_time_in / missed_time_out flags.
export async function fetchDtrRecords() {
  const response = await apiClient.get("/biometrics/dtr");
  assertOk(response.data);
  return response.data;
}
