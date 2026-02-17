import api from "./api";

export const checkSeanebId = (seaneb_id) => {
  return api.post("/seanebid/check", { seaneb_id });
};
