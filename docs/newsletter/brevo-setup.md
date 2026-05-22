# Brevo Setup Checklist

Last updated: 2026-05-21

## Goal

Make the LP collect newsletter signups into Brevo, then send a welcome message and prepare the first scheduled issue of Japan Market Weekly.

## Site connection

The site posts newsletter signups to:

- `POST /api/newsletter`

Required environment variables:

- `BREVO_API_KEY`
- `BREVO_LIST_ID_JAPAN_MARKET_WEEKLY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`

## Contact attributes

The LP now also sends:

- `FIRSTNAME`
- `CLUB`
- `ROLE`

Before relying on the last two in Brevo, create `CLUB` and `ROLE` as custom text contact attributes.

See:

- [brevo-contact-attributes.md](/Users/sei/Desktop/japan-talent-desk/docs/newsletter/brevo-contact-attributes.md)

## Brevo-side setup order

1. Authenticate the sending domain.
2. Create or confirm the sender identity.
3. Create the `Japan Market Weekly` contact list.
4. Copy the list ID into the site environment.
5. Create a welcome email automation triggered by contacts added to that list.
6. Create the first email campaign and schedule it.

## Recommended first automation

Trigger:

- contact added to list: `Japan Market Weekly`

Action:

- send welcome email immediately

Suggested welcome email job:

- explain what the newsletter covers
- set expectation for weekly cadence
- remind the reader that the note is role- and recruitment-focused rather than generic match coverage

## Current integration note

This site integration uses Brevo's contacts API and adds subscribers directly to the selected list with update enabled.

If double opt-in becomes a priority later, switch to a Brevo sign-up form or a custom DOI flow.
