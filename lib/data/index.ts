import type { DataSource } from '@/lib/data/types';
import { CrmApiDataSource } from '@/lib/data/crm-api';

/**
 * The CRM is the only data source. There is deliberately no bundled-people
 * fallback: if WXT_CRM_BASE is not configured the extension fails loudly at
 * sign-in rather than quietly serving something that is not the client's record.
 */
export const CRM_BASE: string = import.meta.env.WXT_CRM_BASE;

export const dataSource: DataSource = new CrmApiDataSource(CRM_BASE);
