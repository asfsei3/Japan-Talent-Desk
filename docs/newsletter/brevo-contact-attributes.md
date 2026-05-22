# Brevo Contact Attributes

Last updated: 2026-05-22

## Goal

Store more than email when a club-side reader joins `Japan Market Weekly`.

The LP signup now sends:

- `email`
- `firstName`
- `club`
- `role`

## Brevo mapping

The site posts these values to Brevo as contact attributes:

- `FIRSTNAME`
- `CLUB`
- `ROLE`

`FIRSTNAME` is a standard Brevo-style contact field.

`CLUB` and `ROLE` should be created in Brevo as custom text attributes before live use.

## Recommended Brevo setup

Create these contact attributes in Brevo:

- `CLUB` as text
- `ROLE` as text

Attribute names in Brevo should use only alphanumeric or underscore characters and can be created as custom contact attributes. This follows Brevo's current attribute rules.

Sources:

- [Brevo: About contact attributes](https://help.brevo.com/hc/en-us/articles/10582214160274)
- [Brevo: Create and manage custom contact attributes](https://help.brevo.com/hc/en-us/articles/10617359589906-Create-and-manage-custom-contact-attributes)

## Qualification note

For now, keep these new fields optional on the LP to reduce friction.

If the list grows with too many low-context signups, make `club` and `role` required later.
