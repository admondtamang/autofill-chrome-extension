import type { DataSource } from '@/lib/data/types';
import { StaticDataSource } from '@/lib/data/static';
import { CrmApiDataSource } from '@/lib/data/crm-api';

// The only switch point between phases: WXT_DATA_SOURCE / WXT_CRM_BASE are
// injected by `vite.define` in wxt.config.ts (literal substitution, so no
// runtime env lookup). Flipping the flag touches no fill-engine code.
export const dataSource: DataSource =
  import.meta.env.WXT_DATA_SOURCE === 'api'
    ? new CrmApiDataSource(import.meta.env.WXT_CRM_BASE)
    : new StaticDataSource();
