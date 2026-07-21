import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import BusinessSetup from "./components/BusinessSetup";
import Dashboard from "./components/Dashboard";
import "./App.css";

// type Business = {
//   id: string;
//   business_name: string;
// };

// function App() {
//   const [businesses, setBusinesses] = useState<Business[]>([]);
//   const [message, setMessage] = useState("Connecting to Supabase...");

//   useEffect(() => {
//     async function testConnection() {
//       const { data, error } = await supabase
//         .from("business")
//         .select("id, business_name")
//         .limit(5);

//       if (error) {
//         console.error(error);
//         setMessage(`Connection error: ${error.message}`);
//         return;
//       }

//       setBusinesses(data ?? []);
//       setMessage("Pawffice HQ is connected to Supabase!");
//     }

//     testConnection();
//   }, []);

type StaffProfile = {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStaffProfile(userId: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("STAFF")
      .select("id, business_id, first_name, last_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
    }

    setStaff(data);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <p>Loading Pawffice HQ...</p>;
  }

  if (!session) {
    return <Auth />;
  }

  if (!staff) {
    return (
      <BusinessSetup
        user={session.user}
        onComplete={() => loadStaffProfile(session.user.id)}
      />
    );
  }

  return (
    <Dashboard businessId={staff.business_id} firstName={staff.first_name} />
  );
  // return (
  //   <main>
  //     <h1>Pawffice HQ</h1>

  //     <h2>
  //       Welcome, {staff.first_name} {staff.last_name}!
  //     </h2>

  //     <p>Your business account is ready.</p>

  //     <button onClick={() => supabase.auth.signOut()}>Sign out</button>
  //   </main>
  // );

  // return (
  //   <main>
  //     <h1>Pawffice HQ</h1>
  //     <p>You are signed in as: {session.user.email}</p>

  //     <button onClick={() => supabase.auth.signOut()}>Sign Out</button>

  //     {/* {businesses.length > 0 ? (
  //       <ul>
  //         {businesses.map((business) => (
  //           <li key={business.id}>{business.business_name}</li>
  //         ))}
  //       </ul>
  //     ) : (
  //       <p>No businesses have been added yet.</p>
  //     )} */}
  //   </main>
  // );
}

export default App;
