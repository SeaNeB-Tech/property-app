import api from "@/lib/api/client";
import { getDefaultProductKey } from "@/services/dashboard.service";
import { pickFirst, toText } from "@/app/auth/auth-service/service.utils";

const formatDob = (dob) => {
  const value = toText(dob);
  if (!value) return null;
  if (value.split("-")[0]?.length === 4) return value; // YYYY-MM-DD

  const [dd, mm, yyyy] = value.split("-");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
};

const ENV_PRODUCT_KEY =
  String(process.env.NEXT_PUBLIC_PRODUCT_KEY || "").trim().toLowerCase() || "property";
const normalizeProductKey = (value) => toText(value).toLowerCase();

export const signupUser = async (data = {}) => {
  const countryCode = pickFirst(data.country_code, data.countryCode);
  const mobileNumber = pickFirst(data.mobile_number, data.mobileNumber);
  const placeId = pickFirst(data.place_id, data.placeId);
  const gender = toText(data.gender).toLowerCase();
  const dob = formatDob(data.dob);

  if (!countryCode || !mobileNumber) return Promise.reject(new Error("Missing mobile verification data"));
  if (!placeId) return Promise.reject(new Error("City not selected"));
  if (!gender) return Promise.reject(new Error("Gender is required"));
  if (!dob) return Promise.reject(new Error("Invalid date of birth"));

  const payload = {
    country_code: toText(countryCode),
    mobile_number: toText(mobileNumber),
    first_name: toText(pickFirst(data.first_name, data.firstName)),
    last_name: toText(pickFirst(data.last_name, data.lastName)),
    dob,
    seaneb_id: toText(pickFirst(data.seaneb_id, data.seanebId)),
    place_id: toText(placeId),
    gender,
    product_key: normalizeProductKey(pickFirst(data.product_key, data.productKey, getDefaultProductKey())) || ENV_PRODUCT_KEY,
  };

  const email = toText(data.email).toLowerCase();
  if (email) payload.email = email;

  return api.post("/v1/user/signup", payload);
};



