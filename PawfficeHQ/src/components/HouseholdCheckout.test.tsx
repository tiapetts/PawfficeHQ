import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HouseholdCheckout from './HouseholdCheckout';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),single:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({single:mocks.single})})})}}));
const rows=[
 {id:'one',start_at:'2026-11-07T15:00:00Z',status:'completed',client_name:'Owner One',pet_names:'Milo',services:[{name:'Groom',price:65}],amount:65,invoice_id:null,invoice_status:null},
 {id:'two',start_at:'2026-11-07T16:00:00Z',status:'ready_for_pickup',client_name:'Owner One',pet_names:'Luna',services:[{name:'Bath',price:45}],amount:45,invoice_id:null,invoice_status:null},
 {id:'paid',start_at:'2026-11-07T17:00:00Z',status:'completed',client_name:'Owner One',pet_names:'Already billed',services:[{name:'Trim',price:20}],amount:20,invoice_id:'old-invoice',invoice_status:'paid'},
];
afterEach(cleanup);
beforeEach(()=>{
 vi.clearAllMocks();
 HTMLDialogElement.prototype.showModal=vi.fn(function(this: HTMLDialogElement){ this.setAttribute("open", ""); }); HTMLDialogElement.prototype.close=vi.fn(function(this: HTMLDialogElement){ this.removeAttribute("open"); });
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='get_household_checkout'?rows:name==='create_invoice_from_appointments'?'combined-invoice':null,error:null}));
 mocks.single.mockResolvedValue({data:{status:'draft'},error:null});
});
const props={appointmentId:'one',startAt:rows[0].start_at,onClose:vi.fn(),onComplete:vi.fn()};
describe('household checkout review',()=>{
 it('combines the selected pets once and excludes already invoiced appointments',async()=>{
  render(<HouseholdCheckout {...props}/>);
  await screen.findByText('Milo');
  expect(screen.getByText('$110.00')).toBeInTheDocument();
  const boxes=screen.getAllByRole('checkbox');
  expect(boxes[0]).toBeChecked(); expect(boxes[1]).toBeChecked(); expect(boxes[2]).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Create one invoice & continue'}));
  await waitFor(()=>expect(props.onComplete).toHaveBeenCalledWith('combined-invoice'));
  expect(mocks.rpc).toHaveBeenCalledWith('create_invoice_from_appointments',{p_appointment_ids:['one','two']});
  expect(mocks.rpc).toHaveBeenCalledWith('issue_invoice',{p_invoice_id:'combined-invoice'});
 });
 it('allows one pet to be excluded and creates a draft without issuing it',async()=>{
  render(<HouseholdCheckout {...props} issueNow={false}/>);
  await screen.findByText('Luna');
  fireEvent.click(screen.getAllByRole('checkbox')[1]);
  fireEvent.click(screen.getByRole('button',{name:'Create one draft invoice'}));
  await waitFor(()=>expect(props.onComplete).toHaveBeenCalled());
  expect(mocks.rpc).toHaveBeenCalledWith('create_invoice_from_appointments',{p_appointment_ids:['one']});
  expect(mocks.rpc.mock.calls.some(([name])=>name==='issue_invoice')).toBe(false);
 });
 it('reopens an existing paid household invoice without creating or issuing another',async()=>{
  mocks.single.mockResolvedValue({data:{status:'paid'},error:null});
  render(<HouseholdCheckout {...props} appointmentId='paid'/>);
  fireEvent.click(await screen.findByRole('button',{name:'Open existing invoice'}));
  await waitFor(()=>expect(props.onComplete).toHaveBeenCalledWith('old-invoice'));
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it('blocks duplicate clicks while the create request is pending and shows errors',async()=>{
  let rejectRequest: (value: unknown)=>void = ()=>{};
  mocks.rpc.mockImplementation((name:string)=> name==='get_household_checkout'?Promise.resolve({data:rows,error:null}):
    new Promise(resolve=>{rejectRequest=resolve;}));
  render(<HouseholdCheckout {...props}/>);
  const button=await screen.findByRole('button',{name:'Create one invoice & continue'});
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.rpc.mock.calls.filter(([name])=>name==='create_invoice_from_appointments')).toHaveLength(1);
  await act(async()=>rejectRequest({data:null,error:{message:'An appointment already has an invoice.'}}));
  expect(screen.getByRole('alert')).toHaveTextContent('already has an invoice');
  expect(props.onComplete).not.toHaveBeenCalled();
 });
});
