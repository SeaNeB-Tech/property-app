import { proxyVerifyOtpLegacy } from "@/app/api/_proxy/otpProxy";

export async function POST(request) {
  return proxyVerifyOtpLegacy(request);
}

