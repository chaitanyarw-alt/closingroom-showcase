# ClosingRoom

AI-powered M&A closing management platform for transaction lawyers.

**Live demo:** https://closingroom.manus.space

## The problem

M&A closings run on long checklists tracked in spreadsheets and email. Lawyers spend time chasing signatures, confirming which documents are outstanding and answering the same status questions from business teams. ClosingRoom puts the checklist, the documents and the status in one place, and uses AI to handle routine deal questions under lawyer control.

## Features

- **Dynamic closing checklists** organised into Conditions Precedent, Transaction Documents and Post-Closing items, with per-item status tracking
- **Multi-party execution tracking** showing who has signed and what is outstanding
- **Document management** with uploads linked to individual checklist items
- **Deal portfolio dashboard** across all active deals
- **PDF export** of checklists for circulation
- **Role-based access** (Admin, Editor, Viewer) through invite links
- **Audit trail** of changes on each deal
- **Built-in AI assistant** that answers deal questions and drafts correspondence using the deal's own data

## Slack legal intake workflow

Business teams can raise legal questions without leaving Slack. A lawyer approves every answer before it goes out.

1. A team member runs `/closingroom` in Slack and submits a request, selecting the relevant deal.
2. The AI assistant drafts a response using that deal's data.
3. The draft appears as a review card in a private lawyer review channel.
4. A lawyer reviews the draft in ClosingRoom, edits if needed, and approves.
5. The approved response is posted back to Slack.

### Controls

- No AI output reaches the business without lawyer approval.
- Review takes place in a private channel and behind sign-in.
- Requests are tied to a specific deal, and users can only select deals they have access to.

## How it was built

ClosingRoom was designed and built using **Manus AI** (a no-code AI build platform) and **Claude**. My work covered product design, workflow design, prompt design for the AI assistant, validating its outputs against legal standards, and end-to-end testing.

## Demo data

All deals in the demo (Project Titan, Project Emerald, Project Falcon) are fictional. No real client data is used.

## Author

Chaitanya Raj Wadera, India-qualified lawyer, LLM in Intellectual Property Law (Queen Mary University of London)
[LinkedIn](https://www.linkedin.com/in/chaitanya-raj-wadera/)
