import { NextResponse } from "next/server";

import { isFeatureEnabled } from "./index";

/**
 * Returns a 404 response when password authentication is disabled, otherwise
 * null. Call from API routes whose only purpose is email+password flows
 * (signup, password reset, email verification, email-based 2FA).
 */
export function passwordAuthGuard(): NextResponse | null {
  if (isFeatureEnabled("passwordAuth")) {
    return null;
  }
  return NextResponse.json(
    { error: "Password authentication is disabled on this deployment" },
    { status: 404 },
  );
}
