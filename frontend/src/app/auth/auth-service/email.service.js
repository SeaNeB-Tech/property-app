import api from "@/lib/api/client";
import { pickErrorMessage } from "@/app/auth/auth-service/service.utils";
import { clearAuthFailureArtifacts, shouldClearAuthOnError } from "@/services/auth.service";

const PURPOSE_SIGNUP_EMAIL_VERIFICATION = 1;

export const sendEmailOtp = async ({
  email,
  purpose = PURPOSE_SIGNUP_EMAIL_VERIFICATION,
}) => {
  if (!email || typeof email !== "string") {
    throw new Error("Email is required and must be a string");
  }

  try {
    const response = await api.post("/v1/auth/email/send-otp", {
      email: email.trim(),
      purpose,
    });
    return response.data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, "Failed to send email OTP"));
  }
};

export const verifyEmailOtp = async ({
  email,
  otp,
  purpose = PURPOSE_SIGNUP_EMAIL_VERIFICATION,
}) => {
  if (!email || !otp) {
    throw new Error("Email and OTP are required");
  }
  try {
    const response = await api.post("/v1/auth/email/verify-otp", {
      email: email.trim(),
      otp: String(otp),
      purpose,
    });
    return response.data;
  } catch (error) {
    if (shouldClearAuthOnError(error)) {
      clearAuthFailureArtifacts();
    }
    throw new Error(pickErrorMessage(error, "Invalid email OTP"));
  }
};
