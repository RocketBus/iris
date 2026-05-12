import { NextRequest, NextResponse } from "next/server";

import { verifyEmailToken } from "@/lib/auth";
import { logger } from "@/lib/debug";
import { passwordAuthGuard } from "@/lib/features/guards";

export async function POST(request: NextRequest) {
  const guard = passwordAuthGuard();
  if (guard) return guard;

  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { message: "Verification token is required" },
        { status: 400 },
      );
    }

    const result = await verifyEmailToken(token);

    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Email verified successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("Email verification error:", {
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
