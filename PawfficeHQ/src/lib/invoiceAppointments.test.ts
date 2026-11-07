import { expect, it } from 'vitest';
import { invoiceAppointmentIds } from './invoiceAppointments';
it('includes all household appointments without double-counting the legacy primary link',()=>{
 expect(invoiceAppointmentIds({appointment_id:'one',invoice_appointment:[{appointment_id:'one'},{appointment_id:'two'}]})).toEqual(['one','two']);
 expect(invoiceAppointmentIds({appointment_id:'legacy'})).toEqual(['legacy']);
 expect(invoiceAppointmentIds({appointment_id:null})).toEqual([]);
});
