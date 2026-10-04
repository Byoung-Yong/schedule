# Google Apps Script bridge

This web app makes the Google Sheet the single source of truth for the Vercel site.

Spreadsheet:
- Schedule tab: liturgy schedule
- Attendance tab: attendance roster

## One-time deployment

1. Open the Google Sheet.
2. Extensions -> Apps Script.
3. Replace Code.gs with the contents of this folder's Code.gs.
4. Deploy -> New deployment -> Web app.
5. Execute as: Me.
6. Who has access: Anyone.
7. Deploy and copy the /exec URL.

That URL will be connected to the Vercel API routes.
