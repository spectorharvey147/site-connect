BEGIN;

-- Use the Accounts team's GL descriptions for the four existing mappings.
UPDATE public.sap_expense_groups AS g
SET name = v.name, gl_code = v.gl_code
FROM (VALUES
  ('travel', 'Travelling Expenses - Irrigation Depart.', '4330900007'),
  ('da', 'Per Diem', '4310000007'),
  ('other', 'Repairs & Maintenance', '4332000016'),
  ('boarding', 'Board & Lodge Expenses', '4330900001')
) AS v(code, name, gl_code)
WHERE g.code = v.code;

-- Add each additional GL once. Lines 5-9 are reserved for vendor/GST journal
-- detail lines, so custom expense GLs begin at line 10.
WITH supplied(code, name, gl_code) AS (
  VALUES
    ('expense_4200000004', 'Machinery Hiring Charges', '4200000004'),
    ('expense_4211000002', 'Fuel for Machineries', '4211000002'),
    ('expense_430010052', 'Vehicle fuel expenses', '430010052'),
    ('expense_4310000004', 'Staff welfare expenses', '4310000004'),
    ('expense_4330400002', 'Broadband expenses', '4330400002'),
    ('expense_4200000021', 'Labour Charges', '4200000021'),
    ('expense_4330780002', 'Cell/Mobile Bill Expenses', '4330780002'),
    ('expense_4333000002', 'Postage, Courier', '4333000002'),
    ('expense_4339000003', 'Printing and Stationery', '4339000003'),
    ('expense_4330010027', 'Vehicle Service and Repair Maintenance', '4330010027'),
    ('expense_4330800003', 'Transport Charges against Supply', '4330800003'),
    ('expense_4334000001', 'Electricity Charges', '4334000001')
), missing AS (
  SELECT s.* FROM supplied s
  WHERE NOT EXISTS (SELECT 1 FROM public.sap_expense_groups g WHERE g.code = s.code)
), numbered AS (
  SELECT m.*, greatest(9, coalesce((SELECT max(line_number) FROM public.sap_expense_groups), 0))
    + row_number() OVER (ORDER BY m.code) AS line_number
  FROM missing m
)
INSERT INTO public.sap_expense_groups(code, name, gl_code, line_number)
SELECT code, name, gl_code, line_number FROM numbered;

-- Map existing exact category labels to their account and leave categories
-- marked for a separate claim or explanation unassigned until Accounts gives
-- their GL.
WITH mapping(category, group_code) AS (
  VALUES
    ('Asset Purchase', NULL),
    ('Bank Charges', 'travel'),
    ('Contractor Payments', NULL),
    ('DA', 'da'),
    ('Equipment Rental', 'expense_4200000004'),
    ('Gas', 'expense_4310000004'),
    ('Internet / Broadband', 'expense_4330400002'),
    ('Labour', 'expense_4200000021'),
    ('Lodging', 'boarding'),
    ('Machinery Repair / Service', 'other'),
    ('Material Purchase � Consumables', 'other'),
    ('Medical', 'expense_4310000004'),
    ('Miscellaneous Expenses', NULL),
    ('Mobile Recharge', 'expense_4330780002'),
    ('Postage & Courier', 'expense_4333000002'),
    ('Printer & Stationery', 'expense_4339000003'),
    ('Promotional Expenses', NULL),
    ('Repairs & Maintenance', 'other'),
    ('Safety Items / PPE', 'expense_4310000004'),
    ('Security / Housekeeping', 'expense_4200000021'),
    ('Site Consumables', 'other'),
    ('Staff Welfare', 'expense_4310000004'),
    ('Testing / Inspection Charges', 'other'),
    ('Toll / Parking', 'expense_4330010027'),
    ('Travel & Transport', 'expense_4330800003')
)
UPDATE public.app_lists AS a
SET sap_expense_group = mapping.group_code
FROM mapping
WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(mapping.category));

-- Retire combined choices for future submissions. Historical expense rows
-- keep their original category strings and existing account mappings.
UPDATE public.app_lists
SET active = false
WHERE type = 'category' AND value IN ('EB & Water Bill', 'Fuel', 'Vehicle Service / Insurance');

-- Split the combined categories and add the Accounts team's distinct rows.
WITH categories(value, group_code, active) AS (
  VALUES
    ('EB', 'expense_4334000001', true),
    ('Water', 'expense_4310000004', true),
    ('Fuel - Machinery', 'expense_4211000002', true),
    ('Fuel - Vehicle', 'expense_430010052', true),
    ('Vehicle Service', 'expense_4330010027', true),
    ('Insurance', NULL, false)
)
INSERT INTO public.app_lists(type, value, active, sap_expense_group)
SELECT 'category', c.value, c.active, c.group_code
FROM categories c
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_lists a
  WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(c.value))
);

COMMIT;
