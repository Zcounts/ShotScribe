# Shot field compatibility notes

Shot timing metadata intentionally keeps setup identifiers separate from duration math:

- `setupNumber` stores the setup identifier shown as **Setup #**. It is freeform short text such as `1`, `A`, or `12B`.
- `setupTime` stores the setup duration shown as **Setup Time**. Existing `.shotlist` files that already contain `setupTime` keep those values as setup durations.
- `shootTime` stores the shot duration shown as **Shot Time**.

Scheduling and projected-time calculations must continue to use `setupTime` plus `shootTime`; `setupNumber` is display/edit metadata only.
