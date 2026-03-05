import { proxyOtpVerify } from "@/app/api/_proxy/otpProxy";

export async function POST(request) {
  return proxyOtpVerify(request);
}

