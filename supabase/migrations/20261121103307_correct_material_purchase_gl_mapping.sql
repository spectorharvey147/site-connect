BEGIN;

INSERT INTO public.sap_expense_groups(code, name, gl_code, line_number)
SELECT 'expense_4122000004', 'Purchase Local', '4122000004',
       greatest(9, coalesce(max(line_number), 0)) + 1
FROM public.sap_expense_groups
ON CONFLICT (code) DO NOTHING;

UPDATE public.app_lists
SET sap_expense_group = 'expense_4122000004'
WHERE type = 'category' AND value LIKE 'Material Purchase%Consumables';

COMMIT;
