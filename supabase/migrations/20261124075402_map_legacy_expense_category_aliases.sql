BEGIN;

-- Keep inactive historical labels reportable under finalized GLs when their
-- replacement is unambiguous. Combined or removed labels stay unassigned.
WITH mapping(category, group_code) AS (
  VALUES
    ('Bank Charges', 'travel'),
    ('DA', 'da'),
    ('Internet / Broadband', 'expense_4330400002'),
    ('Material Purchase � Consumables', 'expense_4122000004'),
    ('Travel & Transport', 'expense_4330800003'),
    ('Contractor Payments', NULL),
    ('EB & Water Bill', NULL),
    ('Fuel', NULL),
    ('Miscellaneous Expenses', NULL),
    ('Vehicle Service / Insurance', NULL)
)
UPDATE public.app_lists AS a
SET active = false, sap_expense_group = mapping.group_code
FROM mapping
WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(mapping.category));

COMMIT;
