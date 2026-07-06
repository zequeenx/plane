# Numeric Date Display Design

## Goal

Change frontend-facing date display from month-name formats such as `Jun 01, 2026` to numeric year-month-day display such as `2026.6.1`.

## Scope

The change applies to display helpers used by the Web and Space frontends. It does not change API payload dates, persisted date values, date filters, or comparison logic that depends on `yyyy-MM-dd`.

## Approach

Use `date-fns` tokens consistently:

- Full display date: `yyyy.M.d`
- Short display date without year: `M.d`
- Date range display: render both endpoints as complete numeric dates, for example `2025.1.24 - 2025.2.6`

The shared helper in `packages/utils/src/datetime.ts` remains the primary display entry point. Space keeps its local helper behavior in sync. The timezone converter hook keeps accepting an explicit override token, but its default display token changes to `yyyy.M.d`.

## Testing

Add focused coverage for the shared date helpers before implementation. Verify that frontend display helpers emit unpadded numeric dates and that payload formatting continues to use `yyyy-MM-dd`.
