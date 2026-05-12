import { NextRequest, NextResponse } from "next/server";

import { readFile } from "fs/promises";
import path from "path";

// Bake the request origin into the installer so a curl-piped install
// (`curl -fsSL <deployment>/install.sh | sh`) captures the right server URL
// regardless of which custom domain or preview alias served it.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const template = await readFile(
    path.join(process.cwd(), "public", "install.sh.template"),
    "utf8",
  );

  // request.nextUrl.origin reflects the URL the user actually hit (custom
  // domain on prod, .vercel.app on preview), which is what should land in
  // ~/.iris/config.json.
  const origin = request.nextUrl.origin;
  const script = template.replaceAll("{{IRIS_SERVER_URL}}", origin);

  return new NextResponse(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}
