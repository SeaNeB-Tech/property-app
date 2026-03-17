import { proxyOtpSend } from "@/app/api/_proxy/otpProxy";

export async function POST(request) {
  return proxyOtpSend(request);
}

