import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabase";
import "./ClientImportExport.css";

type ExistingClient = {
  FirstName: string;
  LastName: string;
  PhoneNumber: string | null;
  EmailAddress: string | null;
  StreetAddress: string | null;
  AptNumber: string | null;
  ClientCity: string | null;
  ClientState: string | null;
  ClientZip: string | null;
};

type Props = {
  businessId: string;
  clients: ExistingClient[];
  onImported: () => Promise<void>;
};

const fields = [
  ["FirstName", "First name", true],
  ["LastName", "Last name", true],
  ["PhoneNumber", "Phone number", false],
  ["EmailAddress", "Email address", false],
  ["StreetAddress", "Street address", false],
  ["AptNumber", "Apartment / unit", false],
  ["ClientCity", "City", false],
  ["ClientState", "State", false],
  ["ClientZip", "ZIP code", false],
] as const;

type FieldName = (typeof fields)[number][0];
type Mapping = Record<FieldName, number>;

const aliases: Record<FieldName, string[]> = {
  FirstName: ["firstname", "first", "givenname", "clientfirstname"],
  LastName: ["lastname", "last", "surname", "familyname", "clientlastname"],
  PhoneNumber: ["phonenumber", "phone", "mobile", "cell", "telephone"],
  EmailAddress: ["emailaddress", "email", "emailaddress1"],
  StreetAddress: ["streetaddress", "address", "address1", "street"],
  AptNumber: ["aptnumber", "apartment", "unit", "address2", "apt"],
  ClientCity: ["clientcity", "city", "town"],
  ClientState: ["clientstate", "state", "province"],
  ClientZip: ["clientzip", "zip", "zipcode", "postalcode", "postal"],
};

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedPhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function parseCsv(text: string) {
  const result: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) result.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) result.push(row);
  return result;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ClientImportExport({ businessId, clients, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => Object.fromEntries(fields.map(([field]) => [field, -1])) as Mapping);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const analyzedRows = useMemo(() => {
    const existingEmails = new Set(clients.map((client) => client.EmailAddress?.trim().toLowerCase()).filter(Boolean));
    const existingPhones = new Set(clients.map((client) => normalizedPhone(client.PhoneNumber)).filter(Boolean));
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    return rows.map((row, index) => {
      const value = (field: FieldName) => mapping[field] >= 0 ? (row[mapping[field]] ?? "").trim() : "";
      const client = {
        FirstName: value("FirstName"),
        LastName: value("LastName"),
        PhoneNumber: value("PhoneNumber"),
        EmailAddress: value("EmailAddress"),
        StreetAddress: value("StreetAddress"),
        AptNumber: value("AptNumber"),
        ClientCity: value("ClientCity"),
        ClientState: value("ClientState").toUpperCase(),
        ClientZip: value("ClientZip"),
      };
      const errors: string[] = [];
      const email = client.EmailAddress.toLowerCase();
      const phone = normalizedPhone(client.PhoneNumber);
      if (!client.FirstName) errors.push("Missing first name");
      if (!client.LastName) errors.push("Missing last name");
      if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("Invalid email");
      if (client.ClientState && client.ClientState.length !== 2) errors.push("State must be 2 letters");
      if (email && (existingEmails.has(email) || seenEmails.has(email))) errors.push("Duplicate email");
      if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) errors.push("Duplicate phone");
      if (email) seenEmails.add(email);
      if (phone) seenPhones.add(phone);
      return { rowNumber: index + 2, client, errors };
    });
  }, [clients, mapping, rows]);

  const validRows = analyzedRows.filter((row) => row.errors.length === 0);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setFilename(file.name);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setHeaders([]);
      setRows([]);
      setIsError(true);
      setMessage("That CSV does not contain a header row and at least one client.");
      return;
    }
    const nextHeaders = parsed[0].map((header) => header.trim());
    setHeaders(nextHeaders);
    setRows(parsed.slice(1));
    setMapping(Object.fromEntries(fields.map(([field]) => {
      const index = nextHeaders.findIndex((header) => aliases[field].includes(normalized(header)));
      return [field, index];
    })) as Mapping);
  }

  function exportClients() {
    downloadCsv(`pawffice-clients-${new Date().toISOString().slice(0, 10)}.csv`, [
      fields.map(([, label]) => label),
      ...clients.map((client) => fields.map(([field]) => client[field])),
    ]);
  }

  function downloadTemplate() {
    downloadCsv("pawffice-client-import-template.csv", [
      fields.map(([, label]) => label),
      ["Jane", "Doe", "920-555-0100", "jane@example.com", "123 Main St", "", "Fond du Lac", "WI", "54935"],
    ]);
  }

  async function importClients() {
    if (validRows.length === 0) return;
    setImporting(true);
    setMessage("");
    const payload = validRows.map(({ client }) => ({
      business_id: businessId,
      FirstName: client.FirstName,
      LastName: client.LastName,
      PhoneNumber: client.PhoneNumber || null,
      EmailAddress: client.EmailAddress || null,
      StreetAddress: client.StreetAddress || null,
      AptNumber: client.AptNumber || null,
      ClientCity: client.ClientCity || null,
      ClientState: client.ClientState || null,
      ClientZip: client.ClientZip || null,
      booking_deposit_required: false,
      booking_deposit_type: "fixed",
      booking_deposit_value: 0,
      booking_deposit_reason: null,
    }));
    const { error } = await supabase.from("CLIENT").insert(payload);
    setImporting(false);
    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }
    await onImported();
    setIsError(false);
    setMessage(`${payload.length} client${payload.length === 1 ? "" : "s"} imported successfully.`);
    setFilename("");
    setHeaders([]);
    setRows([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="dashboard-panel client-migration-panel">
      <div className="client-migration-heading">
        <div>
          <p className="eyebrow">Client migration</p>
          <h3>Import or export clientele</h3>
          <p>Nothing is saved until you review the preview and confirm the import.</p>
        </div>
        <div className="client-migration-actions">
          <button className="secondary-button" type="button" onClick={downloadTemplate}>Download template</button>
          <button className="secondary-button" type="button" onClick={exportClients} disabled={clients.length === 0}>Export {clients.length} clients</button>
          <label className="primary-button client-csv-picker">
            Choose CSV
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} />
          </label>
        </div>
      </div>

      {message && <p className={isError ? "error-message" : "client-success"} role="status">{message}</p>}

      {headers.length > 0 && (
        <>
          <div className="client-import-summary">
            <strong>{filename}</strong>
            <span>{rows.length} rows found</span>
            <span>{validRows.length} ready</span>
            <span>{analyzedRows.length - validRows.length} need attention</span>
          </div>

          <div className="client-column-mapping">
            <h4>Match your columns</h4>
            <div>
              {fields.map(([field, label, required]) => (
                <label key={field}>
                  {label}{required ? " *" : ""}
                  <select value={mapping[field]} onChange={(event) => setMapping((current) => ({ ...current, [field]: Number(event.target.value) }))}>
                    <option value={-1}>Not included</option>
                    {headers.map((header, index) => <option value={index} key={`${header}-${index}`}>{header || `Column ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="client-import-table-wrap">
            <table className="client-import-table">
              <thead><tr><th>Row</th><th>Client</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
              <tbody>
                {analyzedRows.slice(0, 100).map(({ rowNumber, client, errors }) => (
                  <tr key={rowNumber} className={errors.length ? "invalid" : "valid"}>
                    <td>{rowNumber}</td>
                    <td>{[client.FirstName, client.LastName].filter(Boolean).join(" ") || "—"}</td>
                    <td>{client.EmailAddress || "—"}</td>
                    <td>{client.PhoneNumber || "—"}</td>
                    <td>{errors.length ? errors.join(" · ") : "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analyzedRows.length > 100 && <p className="client-preview-note">Showing the first 100 rows. All {analyzedRows.length} rows will still be validated.</p>}
          <div className="client-import-confirm">
            <p>Rows marked “need attention” will be skipped. Existing clients will not be changed.</p>
            <button className="primary-button" type="button" disabled={importing || validRows.length === 0} onClick={() => void importClients()}>
              {importing ? "Importing…" : `Import ${validRows.length} valid client${validRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
