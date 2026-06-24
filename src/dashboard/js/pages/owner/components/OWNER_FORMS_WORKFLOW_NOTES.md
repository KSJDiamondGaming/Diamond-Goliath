# Owner Forms Workflow Notes

The Forms workflow API is ready for the Owner Forms Hub.

Available helpers:

- `ownerApi.getFormsWorkflowOverview(guildId)`
- `ownerApi.getFormSubmissionWorkflow(guildId, submissionId)`

Expected overview fields:

- `pendingSubmissionCount`
- `approvedSubmissionCount`
- `deniedSubmissionCount`
- `requestInfoSubmissionCount`
- `ticketLinkedSubmissionCount`
- `ticketChannelLinkedSubmissionCount`
- `missingTicketChannelCount`
- `formBreakdown`
- `recentSubmissions`

Recommended UI placement:

- Add a workflow health panel below the selected guild card.
- Add missing ticket channel visibility to recent submissions.
- Add per-form workflow counts beside the existing Forms to Ticket mapping.
