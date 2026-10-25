import { apiClient } from "@/services/apiClient";
import { isDemoMode } from "@/services/dataSource";

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
}

interface ApiResponse<T> {
  status?: string;
  ok?: boolean;
  message?: string;
  data?: T;
  error?: string;
}

const LOCAL_STORAGE_KEY = "aris:meet_sessions";

export async function saveMeetingToDb(
  payload: SaveMeetingPayload
): Promise<SavedMeetingRecord | null> {
  try {
    const response = await apiClient.post<ApiResponse<SavedMeetingRecord>>(
      "/meetings",
      payload
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

export async function fetchMeetingsFromDb(): Promise<SavedMeetingRecord[]> {
  try {
    const response = await apiClient.get<ApiResponse<SavedMeetingRecord[]>>(
      "/meetings"
    );
    if (response.data && "data" in response.data && Array.isArray(response.data.data)) {
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
}

export async function fetchMeetingSummariesFromDb(): Promise<MeetingSummaryItem[]> {
  try {
    const response = await apiClient.get<ApiResponse<MeetingSummaryItem[]>>(
      "/meetings/summaries"
    );
    if (response.data && "data" in response.data && Array.isArray(response.data.data)) {
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

