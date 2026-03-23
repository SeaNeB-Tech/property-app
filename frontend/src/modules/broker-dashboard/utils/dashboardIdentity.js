import { getCookie } from "@/lib/core/cookies";

const asRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
};

const readText = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const collectCandidates = (source) => {
  const results = [];
  const seen = new Set();

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = asRecord(value);
    if (!record || seen.has(record)) return;

    seen.add(record);
    results.push(record);

    visit(record.data);
    visit(record.result);
    visit(record.payload);
    visit(record.response);
    visit(record.profile);
    visit(record.user);
    visit(record.business);
    visit(record.current_business);
    visit(record.currentBusiness);
    visit(record.business_details);
    visit(record.businessDetails);
    visit(record.branch);
    visit(record.current_branch);
    visit(record.currentBranch);
    visit(record.active_branch);
    visit(record.activeBranch);
    visit(record.primary_branch);
    visit(record.primaryBranch);
    visit(record.branch_details);
    visit(record.branchDetails);
    visit(record.branches);
    visit(record.default_branch);
    visit(record.defaultBranch);
    visit(record.default_business);
    visit(record.defaultBusiness);
  };

  visit(source);
  return results;
};

const pickCandidateText = (candidates, keys) => {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = readText(candidate[key]);
      if (value) return value;
    }
  }
  return "";
};

const readCookieText = (name) => readText(getCookie(name));
const readCookieTextAny = (...names) => readText(...names.map((name) => getCookie(name)));

const buildInitials = (value) => {
  const initials = String(value || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "BW";
};

export const buildDashboardBusinessIdentity = ({
  profile = null,
  detailsPayload = null,
} = {}) => {
  const candidates = [
    ...collectCandidates(detailsPayload),
    ...collectCandidates(profile),
  ];

  const businessId =
    pickCandidateText(candidates, [
      "business_id",
      "businessId",
      "current_business_id",
      "currentBusinessId",
      "default_business_id",
      "defaultBusinessId",
    ]) || readCookieText("business_id");

  const businessName =
    pickCandidateText(candidates, [
      "business_name",
      "businessName",
      "display_name",
      "displayName",
      "legal_name",
      "legalName",
      "trade_name",
      "tradeName",
      "company_name",
      "companyName",
      "name",
    ]) ||
    readCookieTextAny("business_name", "display_name");

  const email =
    pickCandidateText(candidates, [
      "business_email",
      "businessEmail",
      "email",
      "user_email",
      "userEmail",
    ]) ||
    readCookieTextAny("business_email", "verified_business_email", "user_email");

  const branchLabel =
    pickCandidateText(candidates, [
      "about_branch",
      "aboutBranch",
      "branch_name",
      "branchName",
      "branch_label",
      "branchLabel",
      "default_branch_name",
      "defaultBranchName",
    ]) ||
    readCookieTextAny("about_branch", "branch_name", "branch_label", "default_branch_name");

  const location =
    pickCandidateText(candidates, [
      "address",
      "formatted_address",
      "formattedAddress",
      "business_location",
      "businessLocation",
      "location",
      "location_name",
      "locationName",
      "city",
      "city_name",
      "cityName",
    ]) ||
    readCookieTextAny("business_location", "address", "location");

  const resolvedBusinessName = businessName || branchLabel || "Business Dashboard";

  return {
    businessId,
    businessName: resolvedBusinessName,
    email,
    branchLabel,
    location,
    avatarFallback: buildInitials(resolvedBusinessName),
  };
};
