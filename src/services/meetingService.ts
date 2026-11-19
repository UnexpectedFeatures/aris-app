import { apiClient } from "@/services/apiClient";
// import { isDemoMode } from "@/services/dataSource";

export interface SavedMeetingRecord {
  id: string;
  professor_id?: string;
  name: string;
  course?: string;
  meeting_code: string;
  meeting_url: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes: number;
  duration_seconds: number;
  status: string;
  info?: string;
  created_at?: string;
  auth_in?: boolean;
  auth_out?: boolean;
  campus?: string;
}

export interface SaveMeetingPayload {
  name?: string;
  title?: string;
  course?: string;
  meeting_code: string;
  meeting_url?: string;
  started_at: number | string | Date;
  ended_at?: number | string | Date;
  duration_seconds?: number;
  duration_minutes?: number;
  meeting_date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  info?: string;
  user_email?: string;
  professor_id?: string;
  transcript?: { t: string; who: string; text: string }[];
  transcript_source?: string;
  participants?: string[];
  word_count?: number;
  auth_in?: boolean;
  auth_out?: boolean;
}

interface ApiResponse<T> {
  status?: string;
  ok?: boolean;
  message?: string;
  data?: T;
  error?: string;
}

// const LOCAL_STORAGE_KEY = "aris:meet_sessions";

export async function saveMeetingToDb(
  payload: SaveMeetingPayload,
): Promise<SavedMeetingRecord | null> {
  try {
    const response = await apiClient.post<ApiResponse<SavedMeetingRecord>>(
      "/meetings",
      payload,
    );

    if (response.data && "data" in response.data && response.data.data) {
      return response.data.data;
    }
    return (response.data as unknown as SavedMeetingRecord) ?? null;
  } catch (err) {
    console.warn("Could not save meeting to backend DB directly:", err);
    return null;
  }
}

/** Marks auth_out = true (fingerprint-verified time out). Throws on failure so callers can react. */
export async function updateMeetingAuthOut(
  id: string,
): Promise<SavedMeetingRecord> {
  const response = await apiClient.patch<ApiResponse<SavedMeetingRecord>>(
    `/meetings/${id}/auth-out`,
  );
  const record = response.data?.data;
  if (!record) {
    throw new Error(
      response.data?.message ||
        response.data?.error ||
        "Could not save time out",
    );
  }
  return record;
}

export async function fetchMeetingsFromDb(
  email?: string,
): Promise<SavedMeetingRecord[]> {
  try {
    const url = email
      ? `/meetings?email=${encodeURIComponent(email)}`
      : "/meetings";
    const response =
      await apiClient.get<ApiResponse<SavedMeetingRecord[]>>(url);
    if (
      response.data &&
      "data" in response.data &&
      Array.isArray(response.data.data)
    ) {
      return response.data.data;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (err) {
    console.warn("Could not fetch meetings from backend DB:", err);
    return [];
  }
}

export async function deleteMeetingFromDb(id: string): Promise<boolean> {
  try {
    await apiClient.delete(`/meetings/${id}`);
    return true;
  } catch (err) {
    console.warn("Could not delete meeting from DB:", err);
    return false;
  }
}

export interface MeetingSummaryItem {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  duration: string;
  participants: string[];
  words: string;
  status: "Summarized";
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actions: { owner: string; task: string; due: string }[];
  transcript: { t: string; who: string; text: string }[];
  meeting_code?: string;
  meeting_url?: string;
  auth_in?: boolean;
  auth_out?: boolean;
}

const LLM_BASE = "https://aris-llm.up.railway.app";

export interface AiSummaryResult {
  question: string;
  response: string;
  model?: string;
}

/**
 * Posts a meeting transcript as a question to the aris-llm relay server and
 * waits (via SSE) for the host client to process and return the AI summary.
 * Resolves with the LLM response string, or rejects after `timeoutMs`.
 */
export async function summarizeMeetingWithAI(
  meeting: MeetingSummaryItem,
  timeoutMs = 90_000,
): Promise<AiSummaryResult> {
  const transcriptText = meeting.transcript
    .map((l) => `[${l.t}] ${l.who}: ${l.text}`)
    .join("\n");

  const question =
    `You are an academic assistant. Summarize the following meeting transcript ` +
    `from course "${meeting.course}" held on ${meeting.date}.\n\n` +
    `Provide:\n` +
    `1. A concise overview (2-3 sentences)\n` +
    `2. Key discussion points (bullet list)\n` +
    `3. Decisions made\n` +
    `4. Action items with owners and due dates if mentioned\n\n` +
    `Transcript:\n${transcriptText}`;

  // 1. Queue the question
  const postRes = await fetch(`${LLM_BASE}/api/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to queue question");
  }
  const { id: questionId } = (await postRes.json()) as { id: string };

  // 2. Listen on SSE stream for a matching response
  return new Promise<AiSummaryResult>((resolve, reject) => {
    const es = new EventSource(`${LLM_BASE}/api/responses/stream`);
    const timer = setTimeout(() => {
      es.close();
      reject(new Error("AI summarization timed out. Please try again."));
    }, timeoutMs);

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          questionId?: string;
          question: string;
          response: string;
          model?: string;
        };
        // Accept responses that match our questionId OR any new response
        // (server may not echo questionId through the host client)
        if (!data.questionId || data.questionId === questionId) {
          clearTimeout(timer);
          es.close();
          resolve({
            question: data.question,
            response: data.response,
            model: data.model,
          });
        }
      } catch {
        // malformed SSE data – keep waiting
      }
    };

    es.onerror = () => {
      clearTimeout(timer);
      es.close();
      reject(new Error("Lost connection to AI server. Please try again."));
    };
  });
}

export async function fetchMeetingSummariesFromDb(): Promise<
  MeetingSummaryItem[]
> {
  try {
    const response = await apiClient.get<ApiResponse<MeetingSummaryItem[]>>(
      "/meetings/summaries",
    );
    if (
      response.data &&
      "data" in response.data &&
      Array.isArray(response.data.data)
    ) {
      return response.data.data;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (err) {
    console.warn("Could not fetch meeting summaries from backend DB:", err);
    return [];
  }
}
