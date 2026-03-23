import { promises as fs } from "fs";
import path from "path";
import {
  BRANCH_PAYMENT_STATUS_PENDING,
  normalizeBranchPaymentStatus,
} from "@/lib/payment/branchPaymentState";

const PAYMENT_LOG_PATH = path.join(process.cwd(), "payment.log");
const PAYMENT_STATE_PATH = path.join(process.cwd(), "payment-state.json");

const toText = (value) => String(value || "").trim();

const readStateFile = async () => {
  try {
    const raw = await fs.readFile(PAYMENT_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      branches: parsed?.branches && typeof parsed.branches === "object" ? parsed.branches : {},
      orders: parsed?.orders && typeof parsed.orders === "object" ? parsed.orders : {},
      sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return {
      branches: {},
      orders: {},
      sessions: {},
    };
  }
};

const writeStateFile = async (state) => {
  const nextState = {
    branches: state?.branches && typeof state.branches === "object" ? state.branches : {},
    orders: state?.orders && typeof state.orders === "object" ? state.orders : {},
    sessions: state?.sessions && typeof state.sessions === "object" ? state.sessions : {},
  };

  await fs.writeFile(PAYMENT_STATE_PATH, JSON.stringify(nextState, null, 2));
};

const formatLogLine = ({
  timestamp,
  event,
  branchId,
  businessId,
  orderId,
  sessionId,
  status,
  source,
  error,
}) =>
  [
    timestamp,
    `event=${event || "-"}`,
    `branch_id=${branchId || "-"}`,
    `business_id=${businessId || "-"}`,
    `order_id=${orderId || "-"}`,
    `session_id=${sessionId || "-"}`,
    `status=${status || "-"}`,
    `source=${source || "-"}`,
    `error=${error || "-"}`,
  ].join(" | ");

export const appendPaymentFlowLog = async ({
  event = "",
  branchId = "",
  businessId = "",
  orderId = "",
  sessionId = "",
  status = "",
  source = "",
  error = "",
  details = null,
} = {}) => {
  const timestamp = new Date().toISOString();
  const normalizedStatus =
    normalizeBranchPaymentStatus(status) ||
    (toText(branchId) ? BRANCH_PAYMENT_STATUS_PENDING : "");

  const state = await readStateFile();
  const orderState = orderId ? state.orders[toText(orderId)] : null;
  const sessionState = sessionId ? state.sessions[toText(sessionId)] : null;

  const resolvedBranchId =
    toText(branchId) ||
    toText(orderState?.branchId) ||
    toText(sessionState?.branchId);
  const resolvedOrderId =
    toText(orderId) ||
    toText(sessionState?.orderId);
  const resolvedSessionId =
    toText(sessionId) ||
    toText(orderState?.sessionId);
  const resolvedBusinessId =
    toText(businessId) ||
    toText(state.branches[resolvedBranchId]?.businessId);

  const line = formatLogLine({
    timestamp,
    event: toText(event),
    branchId: resolvedBranchId,
    businessId: resolvedBusinessId,
    orderId: resolvedOrderId,
    sessionId: resolvedSessionId,
    status: normalizedStatus,
    source: toText(source),
    error: toText(error),
  });

  await fs.appendFile(PAYMENT_LOG_PATH, `${line}\n`, "utf8");

  if (resolvedBranchId) {
    state.branches[resolvedBranchId] = {
      branchId: resolvedBranchId,
      businessId: resolvedBusinessId,
      orderId: resolvedOrderId,
      sessionId: resolvedSessionId,
      status: normalizedStatus,
      lastEvent: toText(event),
      error: toText(error),
      source: toText(source),
      updatedAt: timestamp,
      details: details && typeof details === "object" ? details : null,
    };
  }

  if (resolvedOrderId) {
    state.orders[resolvedOrderId] = {
      orderId: resolvedOrderId,
      branchId: resolvedBranchId,
      sessionId: resolvedSessionId,
      businessId: resolvedBusinessId,
      status: normalizedStatus,
      lastEvent: toText(event),
      error: toText(error),
      updatedAt: timestamp,
    };
  }

  if (resolvedSessionId) {
    state.sessions[resolvedSessionId] = {
      sessionId: resolvedSessionId,
      branchId: resolvedBranchId,
      orderId: resolvedOrderId,
      businessId: resolvedBusinessId,
      status: normalizedStatus,
      lastEvent: toText(event),
      error: toText(error),
      updatedAt: timestamp,
    };
  }

  await writeStateFile(state);

  return {
    timestamp,
    branchId: resolvedBranchId,
    businessId: resolvedBusinessId,
    orderId: resolvedOrderId,
    sessionId: resolvedSessionId,
    status: normalizedStatus,
  };
};

export const getTrackedBranchPaymentState = async ({
  branchId = "",
  orderId = "",
  sessionId = "",
} = {}) => {
  const state = await readStateFile();
  const directBranchId = toText(branchId);
  const directOrderId = toText(orderId);
  const directSessionId = toText(sessionId);

  if (directBranchId && state.branches[directBranchId]) {
    return state.branches[directBranchId];
  }

  if (directOrderId && state.orders[directOrderId]) {
    const orderState = state.orders[directOrderId];
    return orderState?.branchId
      ? state.branches[orderState.branchId] || orderState
      : orderState;
  }

  if (directSessionId && state.sessions[directSessionId]) {
    const sessionState = state.sessions[directSessionId];
    return sessionState?.branchId
      ? state.branches[sessionState.branchId] || sessionState
      : sessionState;
  }

  return null;
};

export { PAYMENT_LOG_PATH };
