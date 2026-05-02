"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getServerSession } from "next-auth/next";

import { actionClient } from "./safe-action";

import { logAuditEvent } from "@/lib/audit-logger";
import { authOptions } from "@/lib/auth";
import { debugDatabase, logError } from "@/lib/debug";
import { deleteRepositorySchema } from "@/lib/form-schema";
import { supabaseAdmin } from "@/lib/supabase";

export const deleteRepositoryAction = actionClient
  .inputSchema(deleteRepositorySchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error("Unauthorized");
      }

      const { repositoryId, organizationId, confirmText } = parsedInput;

      const { data: membership, error: membershipError } = await supabaseAdmin
        .from("organization_members")
        .select("role, status")
        .eq("user_id", session.user.id)
        .eq("organization_id", organizationId)
        .single();

      if (membershipError || !membership) {
        debugDatabase("Membership not found", {
          userId: session.user.id,
          organizationId,
          error: membershipError,
        });
        throw new Error("User not found in organization");
      }

      const role = membership.role as "owner" | "admin" | "member";
      if (role !== "owner" && role !== "admin") {
        throw new Error("Only organization owners and admins can delete repositories");
      }

      const { data: repo, error: repoError } = await supabaseAdmin
        .from("repositories")
        .select("id, name, organization_id")
        .eq("id", repositoryId)
        .single();

      if (repoError || !repo) {
        debugDatabase("Repository not found", { repositoryId, error: repoError });
        throw new Error("Repository not found");
      }

      if (repo.organization_id !== organizationId) {
        throw new Error("Repository does not belong to this organization");
      }

      if (confirmText !== repo.name) {
        throw new Error("Confirmation text must match the repository name");
      }

      const { error: deleteError } = await supabaseAdmin
        .from("repositories")
        .delete()
        .eq("id", repositoryId)
        .eq("organization_id", organizationId);

      if (deleteError) {
        debugDatabase("Failed to delete repository", { error: deleteError });
        throw new Error("Failed to delete repository");
      }

      debugDatabase("Repository deleted successfully", {
        repositoryId,
        repositoryName: repo.name,
      });

      const requestHeaders = await headers();
      await logAuditEvent({
        organizationId,
        actorId: session.user.id,
        action: "repository.delete",
        targetType: "repository",
        targetId: repositoryId,
        metadata: {
          repositoryName: repo.name,
        },
        headers: requestHeaders,
      });

      revalidatePath("/[tenant]/repos", "page");
      revalidatePath("/[tenant]/dashboard", "page");

      return {
        success: true,
        message: "Repository deleted successfully",
      };
    } catch (error) {
      logError(error, "deleteRepositoryAction");
      throw error;
    }
  });
