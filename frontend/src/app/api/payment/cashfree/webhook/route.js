import { NextResponse } from "next/server";
import { normalizeBranchPaymentStatus } from "@/lib/payment/branchPaymentState";
import { appendPaymentFlowLog } from "@/lib/server/paymentFlowLogger";

const readText = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const readWebhookBody = async (request) => {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  const raw = await request.text();
  try {
    return JSON.parse(raw);
  } catch {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
};

const extractWebhookTrace = (payload = {}) => {
  const data = payload?.data || payload?.payload || payload;

  const branchId = readText(
    data?.branch_id,
    data?.branchId,
    data?.order?.branch_id,
    data?.order?.branchId,
    data?.payment?.branch_id,
    data?.payment?.branchId
  );

  const businessId = readText(
    data?.business_id,
    data?.businessId,
    data?.order?.business_id,
    data?.order?.businessId
  );

  const orderId = readText(
    data?.order_id,
    data?.orderId,
    data?.cf_order_id,
    data?.cfOrderId,
    data?.order?.order_id,
    data?.order?.orderId,
    data?.payment?.order_id,
    data?.payment?.orderId
  );

  const sessionId = readText(
    data?.payment_session_id,
    data?.paymentSessionId,
    data?.session_id,
    data?.sessionId,
    data?.payment?.payment_session_id,
    data?.payment?.paymentSessionId
  );

  const paymentStatus = normalizeBranchPaymentStatus(
    readText(
      data?.payment_status,
      data?.paymentStatus,
      data?.order_status,
      data?.orderStatus,
      data?.payment?.payment_status,
      data?.payment?.paymentStatus,
      data?.payment?.status,
      data?.order?.status,
      data?.status
    )
  );

  const error = readText(
    data?.error?.message,
    data?.message,
    data?.payment_message,
    data?.paymentMessage
  );

  return {
    branchId,
    businessId,
    orderId,
    sessionId,
    paymentStatus,
    error,
  };
};

export async function POST(request) {
  const payload = await readWebhookBody(request);
  const trace = extractWebhookTrace(payload);

  await appendPaymentFlowLog({
    event: "payment_webhook_received",
    branchId: trace.branchId,
    businessId: trace.businessId,
    orderId: trace.orderId,
    sessionId: trace.sessionId,
    status: trace.paymentStatus,
    source: "cashfree-webhook",
    error: trace.error,
    details: payload && typeof payload === "object" ? payload : null,
  });

  return NextResponse.json({
    ok: true,
    status: trace.paymentStatus || "",
  });
}
