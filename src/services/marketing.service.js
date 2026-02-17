/**
 * Example API layer for marketing pages.
 * Replace NEXT_PUBLIC_MARKETING_API_BASE with your backend URL.
 */
const API_BASE = process.env.NEXT_PUBLIC_MARKETING_API_BASE;

async function fetchFromMarketingAPI(path) {
  if (!API_BASE) {
    throw new Error("NEXT_PUBLIC_MARKETING_API_BASE is not configured");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    next: { revalidate: 300 },
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return response.json();
}

export async function fetchHomePageData() {
  return fetchFromMarketingAPI("/marketing/home");
}

export async function fetchAboutPageData() {
  return fetchFromMarketingAPI("/marketing/about");
}

export async function fetchSolutionPageData() {
  return fetchFromMarketingAPI("/marketing/solution");
}

export async function fetchBlogsPageData() {
  return fetchFromMarketingAPI("/marketing/blogs");
}

export async function fetchPartnerPageData() {
  return fetchFromMarketingAPI("/marketing/partner");
}

export async function fetchContactPageData() {
  return fetchFromMarketingAPI("/marketing/contact");
}
