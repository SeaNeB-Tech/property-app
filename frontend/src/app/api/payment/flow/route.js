import { NextResponse } from "next/server";
import {
  BRANCH_PAYMENT_BRANCH_ID_COOKIE,
  BRANCH_PAYMENT_ERROR_COOKIE,
  BRANCH_PAYMENT_ORDER_ID_COOKIE,
  BRANCH_PAYMENT_SESSION_ID_COOKIE,
  BRANCH_PAYMENT_STATUS_ACTIVE,
  BRANCH_PAYMENT_STATUS_COOKIE,
  normalizeBranchPaymentStatus,
  sanitizePaymentCookieValue,
} from "@/lib/payment/branchPaymentState";
import { appendPaymentFlowLog, getTrackedBranchPaymentState } from "@/lib/server/paymentFlowLogger";

const PAYMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const readRequestBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const expireCookie = (response, name) => {
  response.cookies.set({
    name,
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
};

const readCookieText = (request, name, maxLength) =>
  sanitizePaymentCookieValue(request.cookies.get(name)?.value, maxLength);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const branchId = sanitizePaymentCookieValue(
    searchParams.get("branchId") || readCookieText(request, BRANCH_PAYMENT_BRANCH_ID_COOKIE, 120),
    120
  );
  const orderId = sanitizePaymentCookieValue(
    searchParams.get("orderId") || readCookieText(request, BRANCH_PAYMENT_ORDER_ID_COOKIE, 120),
    120
  );
  const sessionId = sanitizePaymentCookieValue(
    searchParams.get("sessionId") || readCookieText(request, BRANCH_PAYMENT_SESSION_ID_COOKIE, 180),
    180
  );

  const tracked = await getTrackedBranchPaymentState({
    branchId,
    orderId,
    sessionId,
  });

  const normalizedStatus = normalizeBranchPaymentStatus(tracked?.status);

  return NextResponse.json({
    ok: true,
    branchId,
    orderId,
    sessionId,
    status: normalizedStatus,
    tracked: tracked
      ? {
          ...tracked,
          status: normalizedStatus,
        }
      : null,
  });
}

export async function POST(request) {
  const body = await readRequestBody(request);
  const event = sanitizePaymentCookieValue(body?.event, 120);
  const source = sanitizePaymentCookieValue(body?.source, 120);
  const error = sanitizePaymentCookieValue(body?.error, 240);

  const logged = await appendPaymentFlowLog({
    event,
    branchId: sanitizePaymentCookieValue(body?.branchId, 120),
    businessId: sanitizePaymentCookieValue(body?.businessId, 120),
    orderId: sanitizePaymentCookieValue(body?.orderId, 120),
    sessionId: sanitizePaymentCookieValue(body?.sessionId, 180),
    status: sanitizePaymentCookieValue(body?.status, 40),
    source,
    error,
    details: body?.details && typeof body.details === "object" ? body.details : null,
  });

  const response = NextResponse.json({
    ok: true,
    logged,
  });

  if (logged.branchId) {
    response.cookies.set({
      name: BRANCH_PAYMENT_BRANCH_ID_COOKIE,
      value: logged.branchId,
      path: "/",
      maxAge: PAYMENT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  if (logged.orderId) {
    response.cookies.set({
      name: BRANCH_PAYMENT_ORDER_ID_COOKIE,
      value: logged.orderId,
      path: "/",
      maxAge: PAYMENT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  if (logged.sessionId) {
    response.cookies.set({
      name: BRANCH_PAYMENT_SESSION_ID_COOKIE,
      value: logged.sessionId,
      path: "/",
      maxAge: PAYMENT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  if (logged.status) {
    response.cookies.set({
      name: BRANCH_PAYMENT_STATUS_COOKIE,
      value: logged.status,
      path: "/",
      maxAge: PAYMENT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  if (error) {
    response.cookies.set({
      name: BRANCH_PAYMENT_ERROR_COOKIE,
      value: error,
      path: "/",
      maxAge: PAYMENT_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  } else if (logged.status === BRANCH_PAYMENT_STATUS_ACTIVE) {
    expireCookie(response, BRANCH_PAYMENT_ERROR_COOKIE);
  }

  return response;
}
