import { NextRequest, NextResponse } from "next/server";

import { readFile } from "fs/promises";
import path from "path";

// Mirror of /install.sh for Windows / PowerShell. See that route for context.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const template = await readFile(
    path.join(process.cwd(), "public", "install.ps1.template"),
    "utf8",
  );

  const origin = request.nextUrl.origin;
  const script = template.replaceAll("{{IRIS_SERVER_URL}}", origin);

  return new NextResponse(script, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}
