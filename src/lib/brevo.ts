export async function sendEmail({
  to,
  subject,
  htmlContent,
  sender = { name: "SecureLab", email: "onboarding@brevo.com" }
}: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  sender?: { name: string; email: string };
}) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;

  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY is not defined");
    return { success: false, error: "API Key missing" };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to,
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to send email");
    }

    return { success: true, data: await response.json() };
  } catch (error: any) {
    console.error("Brevo API Error:", error.message);
    return { success: false, error: error.message };
  }
}
