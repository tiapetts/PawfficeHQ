type LinkedInvoice = {
  appointment_id: string | null;
  invoice_appointment?: { appointment_id: string }[];
};
export function invoiceAppointmentIds(invoice: LinkedInvoice): string[] {
  return [...new Set([
    ...(invoice.appointment_id ? [invoice.appointment_id] : []),
    ...(invoice.invoice_appointment ?? []).map(link => link.appointment_id),
  ])];
}
