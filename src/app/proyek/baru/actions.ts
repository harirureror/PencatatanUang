"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "@/server/current-user";
import { validateProjectInput, type ProjectFieldErrors } from "@/server/project-input";
import { createProject as saveProject } from "@/server/projects";

export type ProjectFormState = { errors?: ProjectFieldErrors };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const result = validateProjectInput(Object.fromEntries(formData));
  if ("errors" in result) return { errors: result.errors };

  await saveProject(await getCurrentUserId(), result.data, {
    makeActive: formData.get("makeActive") === "on",
  });
  revalidatePath("/", "layout");
  redirect("/proyek");
}
