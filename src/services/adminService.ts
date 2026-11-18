import { apiClient } from "@/services/apiClient";

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

export async function fetchUsers() {
  const response = await apiClient.get("/admin");
  assertOk(response.data);
  return response.data;
}
