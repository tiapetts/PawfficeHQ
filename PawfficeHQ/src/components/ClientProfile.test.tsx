import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Clients from './Clients';
const mocks=vi.hoisted(()=>({from:vi.fn(),petIds:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{from:mocks.from}}));
vi.mock('./ProfilePhoto',()=>({default:()=>null}));
vi.mock('./ClientImportExport',()=>({default:()=>null}));
vi.mock('./PetImportExport',()=>({default:()=>null}));
const client={id:1,FirstName:'Owner',LastName:'One',PhoneNumber:'6085550100',EmailAddress:'owner@example.invalid',StreetAddress:'12 Main St',ClientCity:'Town',ClientState:'WI',ClientZip:'53500',sms_consent:true,booking_deposit_required:false,archived_at:null,profile_photo_path:null};
afterEach(cleanup);
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.from.mockImplementation((table:string)=>{
  const data=table==='appointment'?[]:table==='CLIENT'?[client]:table==='client_pet'?[{pet_id:7},{pet_id:8}]:[
   {id:7,PetName:'Milo',species:'Dog',PetBreed:'Poodle',PetDOB:'2020-03-12',PetWeight:20,archived_at:null},
   {id:8,PetName:'Luna',species:'Dog',PetBreed:'Labrador',PetDOB:null,PetWeight:null,archived_at:null},
  ];
  const query={select:vi.fn(),eq:vi.fn(),order:vi.fn(),in:vi.fn(),lt:vi.fn(),gte:vi.fn(),not:vi.fn(),limit:vi.fn(),then:(resolve:(v:unknown)=>void)=>Promise.resolve({data,error:null,count:0}).then(resolve)};
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query); query.lt.mockReturnValue(query); query.gte.mockReturnValue(query); query.not.mockReturnValue(query); query.limit.mockReturnValue(query);
  query.in.mockImplementation((key,ids)=>{mocks.petIds(key,ids);return query;});
  return query;
 });
});
it('opens a client by name and shows contact details plus both linked pets',async()=>{
 render(<Clients businessId='business' readOnly/>);
 fireEvent.click(await screen.findByRole('button',{name:'Owner One'}));
 expect(await screen.findByRole('heading',{name:'Owner One'})).toBeInTheDocument();
 expect(screen.getByText('6085550100')).toBeInTheDocument();
 expect(screen.getByText('12 Main St')).toBeInTheDocument();
 expect(await screen.findByRole('heading',{name:'Milo'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Luna'})).toBeInTheDocument();
 expect(mocks.petIds).toHaveBeenCalledWith('id',[7,8]);
 expect(screen.queryByRole('button',{name:'Edit client'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'← Back to clients'}));
 expect(screen.getByRole('button',{name:'Owner One'})).toBeInTheDocument();
});
