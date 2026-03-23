export const BRANCH_PAYMENT_STATUS_PENDING = "PENDING";
export const BRANCH_PAYMENT_STATUS_ACTIVE = "ACTIVE";
export const BRANCH_PAYMENT_STATUS_FAILED = "FAILED";

export const BRANCH_PAYMENT_STATUS_COOKIE = "branch_activation_status";
export const BRANCH_PAYMENT_BRANCH_ID_COOKIE = "branch_activation_branch_id";
export const BRANCH_PAYMENT_ORDER_ID_COOKIE = "payment_order_id";
export const BRANCH_PAYMENT_SESSION_ID_COOKIE = "payment_session_id";
export const BRANCH_PAYMENT_ERROR_COOKIE = "payment_last_error";

const STATUS_ALIASES = new Map([
  ["PENDING", BRANCH_PAYMENT_STATUS_PENDING],
  ["PROCESSING", BRANCH_PAYMENT_STATUS_PENDING],
  ["INITIATED", BRANCH_PAYMENT_STATUS_PENDING],
  ["CREATED", BRANCH_PAYMENT_STATUS_PENDING],
  ["NOT_ATTEMPTED", BRANCH_PAYMENT_STATUS_PENDING],
  ["ACTIVE", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["SUCCESS", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["SUCCEEDED", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["PAID", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["CAPTURED", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["COMPLETED", BRANCH_PAYMENT_STATUS_ACTIVE],
  ["FAILED", BRANCH_PAYMENT_STATUS_FAILED],
  ["FAILURE", BRANCH_PAYMENT_STATUS_FAILED],
  ["ERROR", BRANCH_PAYMENT_STATUS_FAILED],
  ["CANCELLED", BRANCH_PAYMENT_STATUS_FAILED],
  ["CANCELED", BRANCH_PAYMENT_STATUS_FAILED],
  ["DECLINED", BRANCH_PAYMENT_STATUS_FAILED],
  ["EXPIRED", BRANCH_PAYMENT_STATUS_FAILED],
  ["TERMINATED", BRANCH_PAYMENT_STATUS_FAILED],
]);

export const normalizeBranchPaymentStatus = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  return STATUS_ALIASES.get(normalized) || normalized;
};

export const isActiveBranchPaymentStatus = (value) =>
  normalizeBranchPaymentStatus(value) === BRANCH_PAYMENT_STATUS_ACTIVE;

export const shouldBlockBranchAccess = (value) => {
  const normalized = normalizeBranchPaymentStatus(value);
  return Boolean(normalized) && normalized !== BRANCH_PAYMENT_STATUS_ACTIVE;
};

export const sanitizePaymentCookieValue = (value, maxLength = 180) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
