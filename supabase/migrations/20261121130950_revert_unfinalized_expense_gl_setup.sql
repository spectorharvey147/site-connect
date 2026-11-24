BEGIN;

-- Restore the pre-review expense account names and category links.
UPDATE public.sap_expense_groups AS g
SET name = v.name, gl_code = v.gl_code
FROM (VALUES
  ('travel', 'Travel expenses', '4330900007'),
  ('da', 'Per diem (DA)', '4310000007'),
  ('other', 'Other expenses', '4332000016'),
  ('boarding', 'Boarding / room rent', '4330900001')
) AS v(code, name, gl_code)
WHERE g.code = v.code;

WITH mapping(category, group_code) AS (
  VALUES
    ('Asset Purchase', 'other'),
    ('Bank Charges', 'other'),
    ('Contractor Payments', 'other'),
    ('DA', 'da'),
    ('Equipment Rental', 'other'),
    ('Gas', 'other'),
    ('Internet / Broadband', 'other'),
    ('Labour', 'other'),
    ('Lodging', 'boarding'),
    ('Machinery Repair / Service', 'other'),
    ('Material Purchase � Consumables', 'other'),
    ('Medical', 'other'),
    ('Miscellaneous Expenses', 'other'),
    ('Mobile Recharge', 'other'),
    ('Postage & Courier', 'other'),
    ('Printer & Stationery', 'other'),
    ('Promotional Expenses', 'other'),
    ('Repairs & Maintenance', 'other'),
    ('Safety Items / PPE', 'other'),
    ('Security / Housekeeping', 'other'),
    ('Site Consumables', 'other'),
    ('Staff Welfare', 'other'),
    ('Testing / Inspection Charges', 'other'),
    ('Toll / Parking', 'other'),
    ('Travel & Transport', 'travel')
)
UPDATE public.app_lists AS a
SET sap_expense_group = mapping.group_code, active = true
FROM mapping
WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(mapping.category));

UPDATE public.app_lists
SET active = true
WHERE type = 'category' AND value IN ('EB & Water Bill', 'Fuel', 'Vehicle Service / Insurance');

DELETE FROM public.app_lists
WHERE type = 'category' AND value IN ('EB', 'Water', 'Fuel - Machinery', 'Fuel - Vehicle', 'Vehicle Service', 'Insurance');

DELETE FROM public.sap_expense_groups
WHERE code IN (
  'expense_4122000004', 'expense_4200000004', 'expense_4200000021',
  'expense_4211000002', 'expense_430010052', 'expense_4310000004',
  'expense_4330010027', 'expense_4330400002', 'expense_4330780002',
  'expense_4330800003', 'expense_4333000002', 'expense_4334000001',
  'expense_4339000003'
);

COMMIT;
