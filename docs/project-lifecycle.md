# Projects and cost-code lifecycle

Admin and Super Admin manage categories, projects, and project cost codes in **GL & Location Setup → Projects & Categories**. Settings retains company/workflow settings and user CSV tools, plus a link to the relocated master editor. Customer mappings, expense restrictions and master CSV import/export are retained. SAP mappings remain available in the adjacent tabs, including inactive rows needed for historical claims.

- Deactivate a completed project to remove it and its cost codes from new claim options.
- The database cascades project closure to its linked cost codes, including new codes added while the project is closed.
- Reactivation restores only automatically disabled codes. A code independently deactivated before project closure stays inactive.
- Existing claims, approvals, amounts and saved SAP batches are unchanged. Approved historical claims can still be exported using inactive master mappings.
- A stale submission cannot bypass the inactive project or cost-code checks.
- Master CSV includes an `active` column accepting `true` or `false`; omitted values default to true. Parent projects are imported before cost codes.
- Deactivation replaces destructive deletion in the master editor. Reactivation can fail safely if it would violate an existing unique active-code constraint; resolve the duplicate before retrying.

Validation: 59 application tests, TypeScript and production build; PostgreSQL assertions in `scripts/tests/project-lifecycle-assertions.sql` cover cascading, selective reactivation, direct child changes, new codes during closure, stale submission, and unchanged historical expenses. The SAP regression test confirms identical export data for existing claims after master rows become inactive.
