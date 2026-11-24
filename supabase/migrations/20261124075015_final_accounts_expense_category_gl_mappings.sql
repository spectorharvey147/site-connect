BEGIN;

-- Rename the existing GL masters to the finalized Accounts descriptions.
UPDATE public.sap_expense_groups AS g
SET name = v.name, gl_code = v.gl_code
FROM (VALUES
  ('travel', 'Travelling Expenses - Irrigation Depart.', '4330900007'),
  ('da', 'Per Diem', '4310000007'),
  ('other', 'Repairs & Maintenance', '4332000016'),
  ('boarding', 'Board & Lodge Expenses', '4330900001')
) AS v(code, name, gl_code)
WHERE g.code = v.code;

-- Add the remaining finalized GL accounts once. Lines 5-9 remain reserved for
-- vendor and GST journal details; new expense GLs start at line 10.
WITH supplied(code, name, gl_code) AS (
  VALUES
    ('expense_4334000001', 'Electricity charges', '4334000001'),
    ('expense_4310000004', 'Staff welfare expenses', '4310000004'),
    ('expense_4200000004', 'Machinery Hiring Charges', '4200000004'),
    ('expense_4211000002', 'Fuel for Machineries', '4211000002'),
    ('expense_430010052', 'Vehicle fuel expenses', '430010052'),
    ('expense_4330400002', 'Broad band expenses', '4330400002'),
    ('expense_4200000021', 'Labour Charges', '4200000021'),
    ('expense_4122000004', 'Purchase Local', '4122000004'),
    ('expense_4330780002', 'Cell/mobile bill Expenses', '4330780002'),
    ('expense_4333000002', 'Postage, Courier', '4333000002'),
    ('expense_4339000003', 'Printing and stationery', '4339000003'),
    ('expense_4332000008', 'Building Upkeep & Maintenance', '4332000008'),
    ('expense_4330010027', 'Vehicle service and repair Maintenance', '4330010027'),
    ('expense_4337000005', 'Small Tools', '4337000005'),
    ('expense_4330800003', 'Transport Charges against Supply', '4330800003'),
    ('expense_4331000004', 'Sales Promotion Expenses', '4331000004')
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

-- Superseded labels remain in the master as inactive so prior claims can still
-- resolve their original category text.
UPDATE public.app_lists
SET active = false
WHERE type = 'category' AND value IN (
  'Bank Charges', 'Contractor Payments', 'DA', 'EB & Water Bill', 'Fuel',
  'Internet / Broadband', 'Material Purchase � Consumables',
  'Miscellaneous Expenses', 'Travel & Transport', 'Vehicle Service / Insurance'
);

-- Map finalized category names to their GL accounts. Asset Purchase and
-- Vehicle Insurance stay unassigned because Accounts specified separate
-- booking and did not provide GL codes for them.
WITH mapping(category, group_code) AS (
  VALUES
    ('Asset Purchase', NULL),
    ('Daily Allowance DA', 'da'),
    ('Electricity Charges EB', 'expense_4334000001'),
    ('Water Charges', 'expense_4310000004'),
    ('Equipment Rental', 'expense_4200000004'),
    ('Fuel-Site Machinery', 'expense_4211000002'),
    ('Fuel-Vehicles', 'expense_430010052'),
    ('Gas', 'expense_4310000004'),
    ('Internet/Broadband', 'expense_4330400002'),
    ('Labour', 'expense_4200000021'),
    ('Lodging', 'boarding'),
    ('Machinery Repair / Service', 'other'),
    ('Material Purchase Consumables', 'expense_4122000004'),
    ('Medical', 'expense_4310000004'),
    ('Mobile Recharge', 'expense_4330780002'),
    ('Postage & Courier', 'expense_4333000002'),
    ('Printer & Stationery', 'expense_4339000003'),
    ('Repairs & Maintenance', 'other'),
    ('Safety Items / PPE', 'expense_4310000004'),
    ('Security / Housekeeping', 'expense_4332000008'),
    ('Site Consumables', 'other'),
    ('Staff Welfare', 'expense_4310000004'),
    ('Testing / Inspection Charges', 'other'),
    ('Toll / Parking', 'expense_4330010027'),
    ('Tools Purchase', 'expense_4337000005'),
    ('Travel Expenses', 'travel'),
    ('Travel Bank Charges', 'travel'),
    ('Transport Charges', 'expense_4330800003'),
    ('Vehicle Insurance', NULL),
    ('Vehicle Service', 'expense_4330010027'),
    ('Promotional Expenses', 'expense_4331000004')
)
UPDATE public.app_lists AS a
SET active = true, sap_expense_group = mapping.group_code
FROM mapping
WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(mapping.category));

WITH categories(value, group_code) AS (
  VALUES
    ('Daily Allowance DA', 'da'),
    ('Electricity Charges EB', 'expense_4334000001'),
    ('Water Charges', 'expense_4310000004'),
    ('Fuel-Site Machinery', 'expense_4211000002'),
    ('Fuel-Vehicles', 'expense_430010052'),
    ('Internet/Broadband', 'expense_4330400002'),
    ('Material Purchase Consumables', 'expense_4122000004'),
    ('Tools Purchase', 'expense_4337000005'),
    ('Travel Expenses', 'travel'),
    ('Travel Bank Charges', 'travel'),
    ('Transport Charges', 'expense_4330800003'),
    ('Vehicle Insurance', NULL),
    ('Vehicle Service', 'expense_4330010027')
)
INSERT INTO public.app_lists(type, value, active, sap_expense_group)
SELECT 'category', c.value, true, c.group_code
FROM categories c
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_lists a
  WHERE a.type = 'category' AND lower(trim(a.value)) = lower(trim(c.value))
);

COMMIT;
