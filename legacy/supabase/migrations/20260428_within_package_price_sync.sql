-- Sync Within service-package prices to the values displayed on the public
-- pricing page (https://laurenbur2.github.io/awkn-ranch/pricing/).
-- These tables drive the team-portal CRM/proposal flows; before this they
-- were stuck on the original (lower) numbers from when the immersives were
-- first launched.

-- 6 Day / 5 Night
UPDATE crm_service_packages SET price_regular = 4799  WHERE slug = 'residential_6d_private';
UPDATE crm_service_packages SET price_regular = 3999  WHERE slug = 'residential_6d_shared';

-- 3 Day / 2 Night
UPDATE crm_service_packages SET price_regular = 2199  WHERE slug = 'residential_3d_private';
UPDATE crm_service_packages SET price_regular = 1899  WHERE slug = 'residential_3d_shared';

-- Standalone add-ons that were lowered earlier on the services catalog —
-- mirror those new rates here so the package picker shows consistent prices.
UPDATE crm_service_packages SET price_regular = 150  WHERE slug = 'addon_integration';
UPDATE crm_service_packages SET price_regular = 200  WHERE slug = 'addon_therapy';
