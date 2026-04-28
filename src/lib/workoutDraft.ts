// Helpers pour gérer le brouillon de séance en cours.
// Sauvegarde locale + Supabase (workouts.status = 'draft').

const LS_KEY = "wf:draft-v1";

export type DraftItem = {
  exercise_id: string;
  name: string;
  sets: { id: string; reps: number; weight: number; done: boolean; targetReps?: number }[];
};

export type DraftPayload = {
  workoutId: string; // id Supabase du draft (workouts.status = 'draft')
  userId: string;
  name: string;
  startedAt: string; // ISO
  routineId: string | null;
  items: DraftItem[];
  updatedAt: string;
};

export function saveDraftLocal(d: DraftPayload) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export function readDraftLocal(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

export function clearDraftLocal() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
