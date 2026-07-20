import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

type Business = {
  id: string;
  business_name: string;
};

function App() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [message, setMessage] = useState("Connecting to Supabase...");

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from("business")
        .select("id, business_name")
        .limit(5);

      if (error) {
        console.error(error);
        setMessage(`Connection error: ${error.message}`);
        return;
      }

      setBusinesses(data ?? []);
      setMessage("Pawffice HQ is connected to Supabase!");
    }

    testConnection();
  }, []);

  return (
    <main>
      <h1>Pawffice HQ</h1>
      <p>{message}</p>

      {businesses.length > 0 ? (
        <ul>
          {businesses.map((business) => (
            <li key={business.id}>{business.business_name}</li>
          ))}
        </ul>
      ) : (
        <p>No businesses have been added yet.</p>
      )}
    </main>
  );
}

export default App;
