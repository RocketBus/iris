import { NextRequest, NextResponse } from "next/server";

import { v4 as uuidv4 } from "uuid";

import { logger } from "@/lib/debug";
import { sendVerificationEmail } from "@/lib/email";
import { passwordAuthGuard } from "@/lib/features/guards";
import { supabaseAdmin } from "@/lib/supabase";

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

    // Check if user exists and is not already verified
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, email_verified, name")
      .eq("email", email)
      .single();

    if (error || !user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (user.email_verified) {
      return NextResponse.json(
        { message: "Email is already verified" },
        { status: 400 },
      );
    }

    // Generate new verification token
    const verificationToken = uuidv4();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new token
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        email_verification_token: verificationToken,
        email_verification_expires: verificationExpires.toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    // Send verification email
    await sendVerificationEmail(email, verificationToken, user.name);

    return NextResponse.json(
      { message: "Verification email sent successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("Resend verification error:", {
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
