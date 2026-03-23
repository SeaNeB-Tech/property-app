"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Home,
  LayoutGrid,
  MessageSquareText,
} from "lucide-react";
import { DashboardSkeleton } from "@/modules/broker-dashboard/components/DashboardSkeleton";
import { DashboardTopHeader } from "@/modules/broker-dashboard/components/DashboardTopHeader";
import { SidebarNav } from "@/modules/broker-dashboard/components/SidebarNav";
import { buildDashboardBusinessIdentity } from "@/modules/broker-dashboard/utils/dashboardIdentity";
import { getListingAppUrl } from "@/lib/core/appUrls";
import { getCookie } from "@/lib/core/cookies";
import { useAuth } from "@/lib/auth/AuthContext";
import { getBusinessDetails } from "@/app/auth/auth-service/business.service";
import { normalizeBranchPaymentStatus } from "@/lib/payment/branchPaymentState";

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

const joinNameParts = (...values) => {
  const parts = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.join(" ").trim();
};

const readNumber = (...values) => {
  for (const value of values) {
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
    visit(record.default_branch);
    visit(record.defaultBranch);
    visit(record.subscription);
    visit(record.plan);
    visit(record.stats);
    visit(record.summary);
    visit(record.counts);
    visit(record.metrics);
    visit(record.meta);
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

const pickCandidateNumber = (candidates, keys) => {
  for (const candidate of candidates) {
    const value = readNumber(...keys.map((key) => candidate[key]));
    if (value !== null) return value;
  }
  return null;
};

const pickCandidateArray = (candidates, keys) => {
  for (const candidate of candidates) {
    for (const key of keys) {
      if (Array.isArray(candidate[key])) {
        return candidate[key];
      }
    }
  }
  return null;
};

const normalizeStatus = (value) => String(value || "").trim().toUpperCase();

const buildInitials = (value, fallback = "BD") => {
  const initials = String(value || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

  return initials || fallback;
};

const resolveProfileDisplayName = (profile = null) => {
  const candidates = collectCandidates(profile);

  const combinedName = joinNameParts(
    pickCandidateText(candidates, ["first_name", "firstName"]),
    pickCandidateText(candidates, ["last_name", "lastName"])
  );

  const directName = pickCandidateText(candidates, [
    "full_name",
    "fullName",
    "name",
    "user_name",
    "userName",
    "username",
  ]);

  const email = pickCandidateText(candidates, ["email", "user_email", "userEmail"]);
  const emailLocalPart = email.includes("@") ? email.split("@")[0].trim() : "";

  return readText(combinedName, directName, emailLocalPart);
};

const countAttentionRecords = (records = []) => {
  if (!Array.isArray(records) || records.length === 0) return 0;

  let attentionCount = 0;
  let explicitSignals = 0;

  for (const entry of records) {
    const record = asRecord(entry);
    if (!record) continue;

    const unreadFlag = record.unread ?? record.is_unread ?? record.isUnread;
    if (typeof unreadFlag === "boolean") {
      explicitSignals += 1;
      if (unreadFlag) attentionCount += 1;
      continue;
    }

    const readFlag = record.read ?? record.is_read ?? record.isRead;
    if (typeof readFlag === "boolean") {
      explicitSignals += 1;
      if (!readFlag) attentionCount += 1;
      continue;
    }

    const status = normalizeStatus(
      record.status ||
        record.enquiry_status ||
        record.enquiryStatus ||
        record.lead_status ||
        record.leadStatus ||
        record.alert_status ||
        record.alertStatus
    );

    if (!status) continue;

    explicitSignals += 1;
    if (
      status.includes("UNREAD") ||
      status.includes("NEW") ||
      status.includes("PENDING") ||
      status.includes("OPEN")
    ) {
      attentionCount += 1;
    }
  }

  if (explicitSignals === 0) {
    return records.length;
  }

  return attentionCount;
};

const normalizeListingRows = (records = []) =>
  records
    .map((entry, index) => {
      const record = asRecord(entry);
      if (!record) return null;

      const title = readText(
        record.title,
        record.property_title,
        record.propertyTitle,
        record.property_name,
        record.propertyName,
        record.listing_title,
        record.listingTitle,
        record.name
      );

      if (!title) return null;

      const subtitleParts = [
        readText(
          record.locality,
          record.location,
          record.location_name,
          record.locationName,
          record.address
        ),
        readText(record.city, record.city_name, record.cityName),
      ].filter(Boolean);

      return {
        id: readText(record.id, record.property_id, record.propertyId, record.listing_id, record.listingId) || `listing-${index}`,
        title,
        subtitle: subtitleParts.join(", "),
        status: readText(record.status, record.property_status, record.propertyStatus, record.listing_status, record.listingStatus),
      };
    })
    .filter(Boolean)
    .slice(0, 5);

const normalizeEnquiryRows = (records = []) =>
  records
    .map((entry, index) => {
      const record = asRecord(entry);
      if (!record) return null;

      const title = readText(
        record.customer_name,
        record.customerName,
        record.buyer_name,
        record.buyerName,
        record.lead_name,
        record.leadName,
        record.name,
        record.subject
      );

      const message = readText(
        record.message,
        record.enquiry_message,
        record.enquiryMessage,
        record.note
      );

      if (!title && !message) return null;

      return {
        id: readText(record.id, record.enquiry_id, record.enquiryId, record.lead_id, record.leadId) || `enquiry-${index}`,
        title: title || message,
        subtitle: title && message ? message : readText(record.status, record.enquiry_status, record.enquiryStatus),
        status: readText(record.status, record.enquiry_status, record.enquiryStatus, record.lead_status, record.leadStatus),
      };
    })
    .filter(Boolean)
    .slice(0, 5);

const buildLiveDashboardState = ({ profile = null, detailsPayload = null } = {}) => {
  const candidates = [
    ...collectCandidates(detailsPayload),
    ...collectCandidates(profile),
  ];

  const listingRecords = pickCandidateArray(candidates, [
      "properties",
      "listings",
      "active_properties",
      "activeProperties",
      "property_list",
      "propertyList",
    ]);

  const enquiryRecords = pickCandidateArray(candidates, [
      "enquiries",
      "leads",
      "lead_list",
      "leadList",
      "messages",
      "inbox",
    ]);

  const alertRecords = pickCandidateArray(candidates, [
      "alerts",
      "notifications",
      "activity",
    ]);

  const listingCount =
    pickCandidateNumber(candidates, [
      "active_listing_count",
      "activeListings",
      "listing_count",
      "listingCount",
      "live_listing_count",
      "liveListingCount",
      "properties_count",
      "propertiesCount",
      "property_count",
      "propertyCount",
    ]) ?? (Array.isArray(listingRecords) ? listingRecords.length : null);

  const listingLimit = pickCandidateNumber(candidates, [
    "listing_limit",
    "listingLimit",
    "properties_limit",
    "propertiesLimit",
    "property_limit",
    "propertyLimit",
    "plan_limit",
    "planLimit",
    "max_properties",
    "maxProperties",
  ]);

  const unreadEnquiriesCount =
    pickCandidateNumber(candidates, [
      "unread_enquiries",
      "unreadEnquiries",
      "unread_leads",
      "unreadLeads",
      "enquiry_unread_count",
      "enquiryUnreadCount",
      "lead_unread_count",
      "leadUnreadCount",
    ]) ?? (Array.isArray(enquiryRecords) ? countAttentionRecords(enquiryRecords) : null);

  const unreadAlertsCount =
    pickCandidateNumber(candidates, [
      "unread_notifications",
      "unreadNotifications",
      "unread_alerts",
      "unreadAlerts",
      "alert_count",
      "alertCount",
      "notification_count",
      "notificationCount",
    ]) ?? (Array.isArray(alertRecords) ? countAttentionRecords(alertRecords) : null);

  const planName = pickCandidateText(candidates, [
    "plan_name",
    "planName",
    "subscription_name",
    "subscriptionName",
    "subscription_plan",
    "subscriptionPlan",
    "current_plan",
    "currentPlan",
  ]);

  const branchStatus = normalizeBranchPaymentStatus(
    pickCandidateText(candidates, [
      "branch_status",
      "branchStatus",
      "current_branch_status",
      "currentBranchStatus",
      "default_branch_status",
      "defaultBranchStatus",
      "status",
    ])
  );

  const subscriptionIsActive =
    readText(getCookie("business_subscription_active")).toLowerCase() === "true";

  return {
    listingCount,
    listingLimit,
    unreadEnquiriesCount,
    unreadAlertsCount,
    planLabel: planName || (subscriptionIsActive ? "Active" : ""),
    branchStatus,
    listingRows: normalizeListingRows(listingRecords || []),
    enquiryRows: normalizeEnquiryRows(enquiryRecords || []),
  };
};

const badgeToneClassName = {
  success: "border-[#cfe9d5] bg-[#edf8ef] text-[#1f7a3d]",
  danger: "border-[#f1c8cf] bg-[#fff1f3] text-[#b42318]",
  neutral: "border-black/10 bg-[#f3f4f6] text-[#5f6670]",
};

const dotToneClassName = {
  success: "bg-[#1f7a3d]",
  danger: "bg-[#b42318]",
  neutral: "bg-[#8a9099]",
};

function PanelBadge({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-[8px] border-[0.5px] px-2.5 py-1 text-[11px] font-medium ${badgeToneClassName[tone] || badgeToneClassName.neutral}`}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8a9099]">
      {children}
    </p>
  );
}

function GhostButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-[8px] border-[0.5px] border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-[#1f2328] transition hover:bg-[#f4f5f6]"
    >
      {children}
    </button>
  );
}

function EmptyPanelState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  onCta,
}) {
  return (
    <div className="flex min-h-[216px] items-center justify-center px-6 py-8">
      <div className="flex max-w-[220px] flex-col items-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border-[0.5px] border-black/10 bg-white text-[#5f6670]">
          <Icon className="h-4 w-4" />
        </div>
        <p className="mt-4 text-[13px] font-medium text-[#1f2328]">{title}</p>
        <p className="mt-2 text-[12px] leading-5 text-[#6d747d]">{description}</p>
        <div className="mt-4">
          <GhostButton onClick={onCta}>{ctaLabel}</GhostButton>
        </div>
      </div>
    </div>
  );
}

function PanelList({ rows }) {
  return (
    <div className="px-5 pb-5 pt-1">
      <div className="overflow-hidden rounded-[8px] border-[0.5px] border-black/10 bg-white">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${index !== rows.length - 1 ? "border-b-[0.5px] border-black/10" : ""}`}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[#1f2328]">{row.title}</p>
              {row.subtitle ? (
                <p className="mt-1 text-[12px] leading-5 text-[#6d747d]">{row.subtitle}</p>
              ) : null}
            </div>
            {row.status ? (
              <span className="shrink-0 text-[11px] font-normal text-[#8a9099]">
                {row.status}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TipStrip({
  tone = "neutral",
  text,
  linkLabel,
  onLink,
}) {
  if (!text) return null;

  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t-[0.5px] border-black/10 bg-white px-5 py-3">
      <div className="flex items-start gap-2 text-[11px] leading-5 text-[#5f6670]">
        <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${dotToneClassName[tone] || dotToneClassName.neutral}`} />
        <span>{text}</span>
      </div>
      {linkLabel ? (
        <button
          type="button"
          onClick={onLink}
          className="shrink-0 text-[11px] font-medium text-[#1f2328] underline underline-offset-4"
        >
          {linkLabel}
        </button>
      ) : null}
    </div>
  );
}

function DashboardPanel({
  sectionLabel,
  title,
  badgeLabel,
  badgeTone,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  onEmptyCta,
  rows,
  tipTone,
  tipText,
  tipLinkLabel,
  onTipLink,
}) {
  return (
    <section className="space-y-2">
      <SectionLabel>{sectionLabel}</SectionLabel>
      <div className="flex min-h-[332px] flex-col overflow-hidden rounded-[12px] border-[0.5px] border-black/10 bg-[#fafafb]">
        <div className="flex items-center justify-between gap-4 border-b-[0.5px] border-black/10 px-5 py-4">
          <p className="text-[13px] font-medium text-[#1f2328]">{title}</p>
          <PanelBadge tone={badgeTone}>{badgeLabel}</PanelBadge>
        </div>

        {rows.length ? (
          <PanelList rows={rows} />
        ) : (
          <EmptyPanelState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            ctaLabel={emptyCtaLabel}
            onCta={onEmptyCta}
          />
        )}

        <TipStrip
          tone={tipTone}
          text={tipText}
          linkLabel={tipLinkLabel}
          onLink={onTipLink}
        />
      </div>
    </section>
  );
}

export function BrokerDashboardWorkspace() {
  const auth = useAuth();
  const authUser = auth?.user ?? null;
  const authStatus = auth?.status ?? "";
  const authReady = auth?.isReady ?? false;

  const [activeSection, setActiveSection] = useState("overview");
  const [detailsPayload, setDetailsPayload] = useState(null);
  const [businessIdentity, setBusinessIdentity] = useState(() =>
    buildDashboardBusinessIdentity()
  );
  const [identityVersion, setIdentityVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  const overviewRef = useRef(null);
  const listingsRef = useRef(null);
  const enquiriesRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const refreshIdentity = () => {
      setIdentityVersion((current) => current + 1);
    };

    window.addEventListener("property:cookie-change", refreshIdentity);
    window.addEventListener("focus", refreshIdentity);

    return () => {
      window.removeEventListener("property:cookie-change", refreshIdentity);
      window.removeEventListener("focus", refreshIdentity);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallbackIdentity = buildDashboardBusinessIdentity({ profile: authUser });

    setBusinessIdentity(fallbackIdentity);

    if (!authReady) {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!fallbackIdentity.businessId) {
      setDetailsPayload(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    void (async () => {
      try {
        const response = await getBusinessDetails(fallbackIdentity.businessId);
        if (cancelled) return;

        const nextDetails = response?.data || null;
        setDetailsPayload(nextDetails);
        setBusinessIdentity(
          buildDashboardBusinessIdentity({
            profile: authUser,
            detailsPayload: nextDetails,
          })
        );
      } catch {
        if (!cancelled) {
          setDetailsPayload(null);
          setBusinessIdentity(fallbackIdentity);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, authStatus, authUser, identityVersion]);

  const liveDashboard = useMemo(
    () =>
      buildLiveDashboardState({
        profile: authUser,
        detailsPayload,
      }),
    [authUser, detailsPayload]
  );

  const resolvedBusinessName =
    readText(businessIdentity.businessName, businessIdentity.branchLabel) || "Business dashboard";
  const resolvedProfileName =
    resolveProfileDisplayName(authUser) || resolvedBusinessName;
  const resolvedUserFallback =
    buildInitials(resolvedProfileName, readText(businessIdentity.avatarFallback, "BD"));
  const resolvedUserMeta =
    readText(liveDashboard.branchStatus, businessIdentity.branchLabel, businessIdentity.email) || "";
  const topbarSubtitle =
    readText(businessIdentity.location, businessIdentity.email, businessIdentity.branchLabel) || "";

  const listingBadgeLabel =
    liveDashboard.listingCount !== null
      ? `${liveDashboard.listingCount} live`
      : "No live data";
  const listingBadgeTone = liveDashboard.listingCount && liveDashboard.listingCount > 0 ? "success" : "neutral";

  const enquiryBadgeLabel =
    liveDashboard.unreadEnquiriesCount !== null
      ? `${liveDashboard.unreadEnquiriesCount} need reply`
      : "No live data";
  const enquiryBadgeTone =
    liveDashboard.unreadEnquiriesCount && liveDashboard.unreadEnquiriesCount > 0
      ? "danger"
      : "neutral";

  const listingTipText =
    liveDashboard.listingCount !== null && liveDashboard.listingLimit !== null
      ? `${liveDashboard.listingCount} of ${liveDashboard.listingLimit} listing slots are currently used.`
      : liveDashboard.listingCount !== null
        ? `${liveDashboard.listingCount} live listing${liveDashboard.listingCount === 1 ? "" : "s"} are linked to this business.`
        : liveDashboard.listingLimit !== null
          ? `${liveDashboard.listingLimit} listing slots are available on the current plan.`
          : readText(
              liveDashboard.branchStatus ? `Branch status is ${liveDashboard.branchStatus}.` : "",
              businessIdentity.location ? `Primary business location: ${businessIdentity.location}.` : "",
              businessIdentity.email ? `Business email on file: ${businessIdentity.email}.` : ""
            );

  const enquiryTipText =
    liveDashboard.unreadEnquiriesCount !== null
      ? `${liveDashboard.unreadEnquiriesCount} unread buyer ${liveDashboard.unreadEnquiriesCount === 1 ? "message is" : "messages are"} currently associated with this branch.`
      : liveDashboard.unreadAlertsCount !== null
        ? `${liveDashboard.unreadAlertsCount} account ${liveDashboard.unreadAlertsCount === 1 ? "alert is" : "alerts are"} currently tracked for this business.`
        : readText(
            businessIdentity.email ? `Buyer follow-ups will use ${businessIdentity.email}.` : "",
            liveDashboard.branchStatus ? `Branch status is ${liveDashboard.branchStatus}.` : "",
            businessIdentity.location ? `Branch market is set to ${businessIdentity.location}.` : ""
          );

  const sidebarItems = useMemo(
    () => [
      {
        id: "overview",
        group: "Workspace",
        label: "Overview",
        icon: LayoutGrid,
      },
      {
        id: "listings",
        group: "Workspace",
        label: "Listings",
        icon: Home,
        count: liveDashboard.listingCount,
        badgeTone: "neutral",
      },
      {
        id: "enquiries",
        group: "Attention",
        label: "Enquiries",
        icon: MessageSquareText,
        count: liveDashboard.unreadEnquiriesCount,
        badgeTone:
          liveDashboard.unreadEnquiriesCount && liveDashboard.unreadEnquiriesCount > 0
            ? "danger"
            : "neutral",
      },
      {
        id: "alerts",
        group: "Attention",
        label: "Alerts",
        icon: Bell,
        count: liveDashboard.unreadAlertsCount,
        badgeTone:
          liveDashboard.unreadAlertsCount && liveDashboard.unreadAlertsCount > 0
            ? "danger"
            : "neutral",
      },
      {
        id: "subscription",
        group: "Account",
        label: "Subscription",
        icon: Building2,
      },
    ],
    [liveDashboard.listingCount, liveDashboard.unreadAlertsCount, liveDashboard.unreadEnquiriesCount]
  );

  const handleOpenListings = () => {
    if (typeof window === "undefined") return;
    window.location.href = getListingAppUrl("/home");
  };

  const handleRefreshDashboard = () => {
    setIdentityVersion((current) => current + 1);
  };

  const handleSelectSection = (sectionId) => {
    setActiveSection(sectionId);

    const targetMap = {
      overview: overviewRef,
      listings: listingsRef,
      enquiries: enquiriesRef,
      alerts: enquiriesRef,
      subscription: listingsRef,
    };

    const target = targetMap[sectionId]?.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading || !authReady) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <SidebarNav
        items={sidebarItems}
        activeItem={activeSection}
        onSelect={handleSelectSection}
        businessName={resolvedBusinessName}
        planLabel={liveDashboard.planLabel}
        logoText={resolvedUserFallback}
      />

      <main className="min-w-0 space-y-5" ref={overviewRef}>
        <DashboardTopHeader
          title="Business dashboard"
          subtitle={topbarSubtitle}
          userName={resolvedProfileName}
          userMetaLabel={resolvedUserMeta}
          userFallback={resolvedUserFallback}
        />

        <div ref={listingsRef} className="scroll-mt-6">
          <DashboardPanel
            sectionLabel="Listings"
            title="Published listings"
            badgeLabel={listingBadgeLabel}
            badgeTone={listingBadgeTone}
            emptyIcon={Home}
            emptyTitle="No published listings yet"
            emptyDescription="Properties will appear here once published."
            emptyCtaLabel="Open listing app"
            onEmptyCta={handleOpenListings}
            rows={liveDashboard.listingRows}
            tipTone={listingBadgeTone}
            tipText={listingTipText}
            tipLinkLabel="Open listings"
            onTipLink={handleOpenListings}
          />
        </div>

        <div ref={enquiriesRef} className="scroll-mt-6">
          <DashboardPanel
            sectionLabel="Enquiries"
            title="Buyer enquiries"
            badgeLabel={enquiryBadgeLabel}
            badgeTone={enquiryBadgeTone}
            emptyIcon={MessageSquareText}
            emptyTitle="No buyer enquiries yet"
            emptyDescription="Messages appear here when buyers contact you."
            emptyCtaLabel="Refresh inbox"
            onEmptyCta={handleRefreshDashboard}
            rows={liveDashboard.enquiryRows}
            tipTone={enquiryBadgeTone}
            tipText={enquiryTipText}
            tipLinkLabel="Refresh data"
            onTipLink={handleRefreshDashboard}
          />
        </div>
      </main>
    </div>
  );
}
