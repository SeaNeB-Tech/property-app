import { proxySendOtpLegacy } from "@/app/api/_proxy/otpProxy";

export async function POST(request) {
  return proxySendOtpLegacy(request);
}

