# Feedback notifications

Feedback is stored privately in Supabase and notifications go only to **juan@jdcasasbuenas.com**. The tester's optional email is the Reply-To address. Nothing from their idea or cards is automatically sent.

## Activate after deployment

1. Open your existing Supabase project → SQL Editor. Run `supabase/migrations/20260908_tester_feedback.sql` from this repository. This creates `tester_feedback` with public access disabled.
2. Create a Resend account at https://resend.com and add a sending domain you control. Verify the DNS records shown by Resend. You can use a dedicated subdomain; use a matching sender below. Do not replace the existing email provider's root MX records.
3. Create a sending API key in Resend, scoped to that domain.
4. In the Change Cards Vercel project → Settings → Environment Variables, add the following for Production:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | Your existing project's URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service_role key from Supabase's API keys settings (server only) |
   | `RESEND_API_KEY` | Your Resend sending API key |
   | `FEEDBACK_FROM_EMAIL` | `Change Cards <feedback@jdcasasbuenas.com>` or an address on the verified sending subdomain |

   Do not use `VITE_` prefixes for secret keys or put keys in source code. The notification recipient is fixed in the server code.
5. Redeploy the latest production deployment so it receives the variables.
6. Submit one feedback message through the footer. Confirm a row in Supabase's `tester_feedback` table, a successful send in Resend, and receipt in your inbox. Test replying if you supplied an email.

For local development, put the same variables in the ignored `.env` file and restart `npm run dev`. No real email is sent by the automated tests.

## Failure handling

Until configured, the form shows an unavailable message and retains the tester's text. Storage failures also retain the draft. Retries of an unchanged submission reuse its ID, preventing duplicate rows; Resend uses that same ID for email deduplication (24-hour window).

If email sending fails after storage succeeds, the feedback is still accepted. Find rows whose `notification_sent_at` is null in Supabase and check the Resend configuration. There is no automatic background email retry in this first version; these messages remain readable in Supabase. The server logs only the pending feedback ID, never the message or email.

Submissions are limited to five per hashed network address in ten minutes. Email recipients and subject cannot be set by the browser.
