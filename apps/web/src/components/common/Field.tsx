/**
 * Back-compat shim (Stage 2): Select/Textarea/Tabs were promoted verbatim to
 * shared primitives in components/ui/. Existing imports from
 * '@/components/common/Field' (31 files) keep working unchanged; new code
 * should import { Select, Textarea, Tabs } from '@/components/ui'.
 */
export { Select, type SelectProps } from '@/components/ui/Select';
export { Textarea, type TextareaProps } from '@/components/ui/Textarea';
export { Tabs, type TabItem, type TabsProps } from '@/components/ui/Tabs';
