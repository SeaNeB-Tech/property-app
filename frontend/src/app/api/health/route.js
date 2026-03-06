import { NextResponse } from "next/server";
import { API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL } from "@/lib/core/apiBaseUrl";

export async function GET() {
  const baseCandidates = Array.from(
    new Set([API_REMOTE_BASE_URL, API_REMOTE_FALLBACK_BASE_URL].filter(Boolean))
  );

  const results = [];

  for (const base of baseCandidates) {
    try {
      const response = await fetch(`${base}/health`, {
        method: "GET",
        cache: "no-store",
        timeout: 5000,
      });
      results.push({
        url: `${base}/health`,
        status: response.status,
        ok: response.ok,
      });
    } catch (error) {
      results.push({
        url: `${base}/health`,
        error: error.message,
        status: "unreachable",
      });
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    apiBases: baseCandidates,
    healthChecks: results,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_ENV: process.env.NEXT_ENV,
      API_REMOTE_BASE_URL,
      API_REMOTE_FALLBACK_BASE_URL,
    },
  });
}