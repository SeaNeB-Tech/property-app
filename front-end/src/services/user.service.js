import api from "@/lib/api/client";

export const checkSeanebId = (seaneb_id) => {
  return api.post("/seanebid/check", { seaneb_id });
};
