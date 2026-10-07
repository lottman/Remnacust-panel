// Blocked-device remarks may contain template variables, but never host/action objects.
export function isTextRemark(remark: string): boolean {
    const value = remark.trim();
    if (!value || value === '{{FREE_HOST}}') return false;
    return !value.startsWith('{') || value.startsWith('{{');
}
