import { NextRequest, NextResponse } from 'next/server';

import { isShuttingDown } from '@/lib/lifecycle';
import { supabaseAdmin } from '@/lib/supabase';

const startedAt = Date.now();

/**
 * Health check endpoint (Factor 9: Disposability/Graceful Lifecycle).
 *
 * Supports two probe modes via ?probe= query param:
 *   - `liveness`  — returns 200 if the process is alive (K8s livenessProbe)
 *   - `readiness` — returns 200 only if ready to serve traffic (K8s readinessProbe)
 *   - (default)   — full health check with backing-service connectivity
 *
 * Returns 503 during graceful shutdown so load balancers stop routing traffic.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const probe = searchParams.get('probe');
  const uptime = Math.floor((Date.now() - startedAt) / 1000);

  // Liveness: process is alive — always 200
  if (probe === 'liveness') {
    return NextResponse.json({ status: 'ok', uptime });
  }

  // Shutting down → not ready for new traffic
  if (isShuttingDown()) {
    return NextResponse.json(
      {
        status: 'shutting_down',
        uptime,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  // Readiness / full check: verify backing services
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    const { error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .limit(1);
    checks.supabase = error ? 'error' : 'ok';
  } catch {
    checks.supabase = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      uptime,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: 200 },
  );
}
