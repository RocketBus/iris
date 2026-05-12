import { NextRequest, NextResponse } from "next/server";

import { createPasswordResetToken } from "@/lib/auth";
import { logger } from "@/lib/debug";
import { sendPasswordResetEmail } from "@/lib/email";
import { passwordAuthGuard } from "@/lib/features/guards";

export async function POST(request: NextRequest) {
  const guard = passwordAuthGuard();
  if (guard) return guard;

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: "Invalid email format" },
        { status: 400 },
      );
    }

    const result = await createPasswordResetToken(email);

    if (result.success && result.token && result.user) {
      try {
        await sendPasswordResetEmail(email, result.token, result.user.name);
      } catch {
        logger.error("Failed to send password reset email", { email });
      }
    }

    // Always return success for security (don't reveal if email exists)
    return NextResponse.json(
      {
        message:
          "If an account with that email exists, we have sent a password reset link.",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("Forgot password error:", {
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
