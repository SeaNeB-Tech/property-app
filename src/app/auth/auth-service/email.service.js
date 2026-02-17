import api from "@/services/api"

const PURPOSE_SIGNUP_EMAIL_VERIFICATION = 1

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  fallback

export const sendEmailOtp = async ({ email, purpose = PURPOSE_SIGNUP_EMAIL_VERIFICATION }) => {
  if (!email || typeof email !== "string") {
    throw new Error("Email is required and must be a string")
  }

  console.log("[sendEmailOtp] Sending OTP to:", email)

  try {
    const response = await api.post("/auth/email/send-otp", {
      email: email.trim(),
      purpose,
    })
    console.log("[sendEmailOtp] Success:", response.data)
    return response.data
  } catch (error) {
    console.error("[sendEmailOtp] Error:", error?.response?.data || error.message)
    throw new Error(getErrorMessage(error, "Failed to send email OTP"))
  }
}

export const verifyEmailOtp = async ({ email, otp, purpose = PURPOSE_SIGNUP_EMAIL_VERIFICATION }) => {
  if (!email || !otp) {
    throw new Error("Email and OTP are required")
  }

  console.log("[verifyEmailOtp] Verifying email:", email)

  try {
    const response = await api.post("/auth/email/verify-otp", {
      email: email.trim(),
      otp: String(otp),
      purpose,
    })
    console.log("[verifyEmailOtp] Success:", response.data)
    return response.data
  } catch (error) {
    console.error("[verifyEmailOtp] Error:", error?.response?.data || error.message)
    throw new Error(getErrorMessage(error, "Invalid email OTP"))
  }
}
