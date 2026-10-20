# Bulk post actions

On **Dashboard → Posts**, select individual rows or use the header checkbox to
select the current page (at most 50 posts). Partial selection appears as a mixed
checkbox. The toolbar shows the selected count, Clear selection, Delete and
Unpublish. Checkboxes work with Tab and Space; dialogs support keyboard focus,
Escape and cancellation. Controls wrap on narrow screens.

Selection clears when the applied search, category, sorting, page or page size
changes. Selection never includes posts from another page. Unpublish is disabled
when all selected posts are drafts. Confirmation states the eligible count;
already-unpublished selected posts are skipped and counted by the server.
Cancellation preserves selection and makes no changes.

Unpublish preserves content, URL reservations and private working copies, removes
public visibility and cancels pending newsletter delivery through the existing
workflow. Newsletter cancellation or cache invalidation warnings are reported
separately from successful database mutations.

Delete permanently removes selected posts and existing dependent records,
including linked working copies, comments and newsletter records. Retired AI
provenance remains private and retained with a null deleted-post reference.
Apply `20261020152919_preserve_retired_post_provenance.sql` before deployment;
this migration preserves existing provenance IDs, chat links and access policies.

The server accepts 1–50 unique post UUIDs, authenticates the actor and checks
ownership/role for every ID. Writes include the displayed update version and
current status to avoid acting on changed posts. Unauthorized, missing or stale
posts fail individually without preventing other selected posts from succeeding.

The result reports successful, skipped and failed counts. Failed rows remain
selected for retry while still visible; review refreshed rows before confirming
again. Successful/skipped rows are deselected. The list refreshes totals, statuses
and page bounds, including moving back from an emptied last page. Controls are
disabled during processing to prevent duplicate submissions in the same table.
If a network failure leaves outcomes uncertain, refresh and review before retrying.

Bulk publishing and selecting every matching post across pages are not supported.
