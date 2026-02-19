import api from "@/services/api";

export async function loginWithOtp({
  countryCode,
  mobileNumber,
  otp,
  productKey = "property",
}) {
  const payload = {
    identifier_type: 0,
    country_code: String(countryCode || "").trim(),
    mobile_number: String(mobileNumber || "").trim(),
    otp: String(otp || "").trim(),
    purpose: 0,
    product_key: productKey,
  };

  const { data } = await api.post("/otp/verify-otp", payload);
  return data;
}
