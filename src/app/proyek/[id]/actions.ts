"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/server/current-user";
import { ProjectArchivedError, ProjectNotFoundError, setActiveProject } from "@/server/projects";

export type SetActiveState = { error?: string };

export async function makeProjectActive(
  _prev: SetActiveState,
  formData: FormData,
): Promise<SetActiveState> {
  try {
    await setActiveProject(await getCurrentUserId(), String(formData.get("projectId") ?? ""));
  } catch (error) {
    if (error instanceof ProjectNotFoundError || error instanceof ProjectArchivedError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return {};
}
