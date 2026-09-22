import type { DispatchState } from "./types";
import { createSeedState } from "./seed";

// 存储版本独立于任务版本；结构变更时可直接回退到种子数据。
const STORAGE_KEY = "dfwlfront-3-rescue-dispatch-v1";

export function loadState(): DispatchState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createSeedState();
  try {
    const parsed = JSON.parse(raw) as Partial<DispatchState>;
    // 简单的结构兜底，避免历史脏数据导致页面崩溃
    return {
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      rescues: Array.isArray(parsed.rescues) ? parsed.rescues : [],
      rejections: Array.isArray(parsed.rejections) ? parsed.rejections : []
    };
  } catch {
    return createSeedState();
  }
}

export function saveState(state: DispatchState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
