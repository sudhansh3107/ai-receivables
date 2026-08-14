-- Responsibility #4 (Collection Outreach) — persists the case's own
-- outbound Gmail identifiers so proactive outreach (contact/follow_up/
-- check_in) can thread onto its own prior message instead of starting a
-- fresh email every time.
--
-- Prior to this migration, collectionEmailComposer.ts's own header
-- documented this as a known v1 limitation: "the approved v2 schema does
-- not persist a thread id for the case's own outbound conversation, so
-- each proactive message is its own thread." Reply-triggered
-- acknowledgments (acknowledge_promise/acknowledge_exception) already
-- threaded correctly because they reply directly to the inbound email
-- that triggered them (replySource) — this migration closes the gap for
-- the proactive side, and the orchestration layer now also updates these
-- columns after every successful outbound send (proactive or reply) so
-- the anchor always reflects the most recent message in the case's
-- conversation.
--
-- Deliberately NOT foreign-keyed to public.emails: that table is
-- populated only by inbound Gmail sync/webhook (see
-- services/server/emailService.ts::upsertEmailFromGmail()); an outbound
-- send this employee makes is never written there, so these columns hold
-- raw Gmail API identifiers directly, exactly as collection_cases.
-- last_response_email_id/promise_source_email_id/
-- exception_source_email_id hold uuids into emails for the inbound side.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before outbound thread persistence will function
-- against a real database.

ALTER TABLE public.collection_cases
    ADD COLUMN last_outbound_gmail_message_id text,
    ADD COLUMN last_outbound_gmail_thread_id text;

COMMENT ON COLUMN public.collection_cases.last_outbound_gmail_message_id IS
    'Gmail internal message id of the most recent outbound email this employee sent for this case (proactive or reply). Used to resolve the RFC Message-ID header (via lib/gmail/messages.ts::getOriginalMessageMetadata()) for In-Reply-To/References on the NEXT proactive send, so follow_up/check_in threads onto the case''s own conversation instead of starting a new thread. Written in the SAME conditional UPDATE as the decision engine''s field patch (collectionCaseService.ts::applyCaseTransition()) so it can never drift out of sync with last_decision/outreach_count.';

COMMENT ON COLUMN public.collection_cases.last_outbound_gmail_thread_id IS
    'Gmail thread id of the most recent outbound email this employee sent for this case. Passed as threadId on the next proactive send once set; null only before the case''s first-ever outreach has been sent.';
