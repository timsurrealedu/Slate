# Precise handwriting correction

Slate 0.1.14 / Android versionCode 15 corrects the excessive path smoothing introduced in 0.1.13. The owner reported that ink moved away from actual pen movement and felt unnatural. The centerline stabilizer and rounded outline approximation could soften corners and reshape previous portions as samples arrived.

New strokes use a `precise` renderer that joins the recorded coordinates directly with rounded segments. Only pressure-driven width is filtered; coordinates are never averaged, stabilized or curve fitted. Completed segments are appended to rather than rebuilt, preserving their positions when the pen turns, stops, retraces or lifts. Cached pressure state gives the same result during input and after reopening or export. The pressure toggle and 1000% zoom remain available.

The renderer marker distinguishes new ink from existing direct, legacy and 0.1.13 smoothed ink, preserving previously saved appearance. Backup validation accepts the new marker and retains the per-stroke pressure setting. No stored coordinates, pressure or timing are rewritten.

TypeScript, scoped lint, the independent production build and all 49 unit tests pass. All 27 targeted production browser checks pass without retries. Coverage includes actual path coverage at sharp pen corners and retraced points, empty gaps that must remain free of ink, unchanged live segments, constant versus pressure-driven width, coalesced samples, lift-off endpoints, palm suppression, backup recovery, selection transforms, PDF annotations, offline reopening and drawing coordinates through 1000% zoom.

Both packaged desktop apps pass native checks in isolated profiles, including pressure preference export/reopening and 1000% zoom. Linux uses WSLg with the sandbox disabled only for the test. Android builds successfully, uses versionCode 15 and retains the 0.1.13 development certificate. Runnable deliveries and package verification are in `releases/2026-10-04-precise-ink`; previous releases are retained.

These checks establish geometry and persistence. Physical stylus feel, device pressure curves and latency still need a device check.
