/**
 * Back-compat shim (Stage 2): the canonical implementation now lives in
 * components/ui/Table.tsx. Existing imports from '@/components/admin/DataTable'
 * keep working unchanged; new code should import from '@/components/ui'.
 */
export { DataTable, DataTable as Table, type Column } from '@/components/ui/Table';
