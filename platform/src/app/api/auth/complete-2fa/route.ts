import { NextRequest, NextResponse } from "next/server";

import { v4 as uuidv4 } from "uuid";

import { logError } from "@/lib/debug";
import { passwordAuthGuard } from "@/lib/features/guards";
import { supabaseAdmin } from "@/lib/supabase";
import {
  verifyTOTPCode,
  verify2FACode,
  verifyBackupCode,
} from "@/lib/two-factor";

export async function POST(request: NextRequest) {
  const guard = passwordAuthGuard();
  if (guard) return guard;

  try {
    const { userId, code, method } = await request.json();

    if (!userId || !code || !method) {
      return NextResponse.json(
        {
          message:
            "Missing required fields: userId, code, and method are required",
        },
        { status: 400 },
      );
    }

    if (method !== "totp" && method !== "email") {
      return NextResponse.json(
        { message: 'Invalid method. Must be "totp" or "email"' },
        { status: 400 },
      );
    }

    if (typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { message: "Invalid code format. Must be 6 digits" },
        { status: 400 },
      );
    }

    // Get user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select(
        "id, locked_until, mfa_secret, failed_login_attempts, email, name, avatar_url",
      )
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return NextResponse.json(
        { message: "Account is locked. Please try again later." },
        { status: 403 },
      );
    }

    let isValid = false;

    // Verify code based on method
    if (method === "totp") {
      // Verify TOTP code
      if (!user.mfa_secret) {
        return NextResponse.json(
          { message: "TOTP not configured for this user" },
          { status: 400 },
        );
      }

      // Try TOTP code first
      isValid = verifyTOTPCode(user.mfa_secret, code);

      // If TOTP fails, try backup code
      if (!isValid) {
        isValid = await verifyBackupCode(userId, code);
      }
    } else if (method === "email") {
      // Verify email OTP code
      isValid = await verify2FACode(userId, code);
    }

    if (!isValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil =
        failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await supabaseAdmin
        .from("users")
        .update({
          failed_login_attempts: failedAttempts,
          locked_until: lockUntil,
        })
        .eq("id", userId);

      return NextResponse.json(
        { message: "Invalid or expired verification code" },
        { status: 400 },
      );
    }

    // Update last login time
    await supabaseAdmin
      .from("users")
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq("id", userId);

    // Create a temporary login token that expires in 5 minutes
    const loginToken = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store login token in two_factor_codes table (reusing existing table)
    await supabaseAdmin.from("two_factor_codes").insert({
      user_id: userId,
      code: loginToken, // Store the token as the code
      expires_at: expiresAt.toISOString(),
      used: false,
    });

    // Return login token for frontend to use
    return NextResponse.json(
      {
        success: true,
        loginToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logError(error, "complete-2fa");
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
