import api from "./api";

/**
 * Get city suggestions for autocomplete
 * API: GET /cities?search=&limit=
 * Fallback: GET /autocomplete-cities?input=
 */
export const getCities = async (input) => {
  // Guard clause
  if (typeof input !== "string" || input.trim().length < 2) {
    return [];
  }

  try {
    const res = await api.get("/cities", {
      params: {
        search: input.trim(),
        limit: 20,
      },
    });

    const body = res?.data;
    const cities = Array.isArray(body) ? body : body?.cities || [];

    if (Array.isArray(cities) && cities.length > 0) {
      return cities;
    }

    // Fallback endpoint if /cities returns empty structure
    const fallback = await api.get("/autocomplete-cities", {
      params: {
        input: input.trim(),
      },
    });
    const fallbackCities = fallback?.data?.cities;

    return Array.isArray(fallbackCities) ? fallbackCities : [];
  } catch (error) {
    console.error(
      " getCities failed:",
      error?.response?.data || error?.message || error
    );
    return [];
  }
};
