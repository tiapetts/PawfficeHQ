// This page will appear after someone signs in but before they have a staff record and business...it will collect first and last name, business name, business phone, street address, city, state, and zip, and the user's role.

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type BusinessSetupProps = {
  user: User;
  onComplete: () => void;
};

export default function BusinessSetup({
  user,
  onComplete,
}: BusinessSetupProps) {
  const [firstName, setFirstName] = useState(
    user.user_metadata.first_name ?? "",
  );
  const [lastName, setLastName] = useState(user.user_metadata.last_name ?? "");
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [businessZip, setBusinessZip] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("create_business_and_owner", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_business_name: businessName,
      p_business_phone: businessPhone,
      p_business_address: businessAddress,
      p_business_city: businessCity,
      p_business_state: businessState,
      p_business_zip: businessZip,
    });

    if (error) {
      console.error(error);
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (updateError) {
      console.error(updateError);
    }

    setLoading(false);
    onComplete();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Pawffice HQ</h1>
        <h2>Set up your business</h2>
        <p>Tell us about you and your pet-care business.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="firstName">First name</label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            required
          />

          <label htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            required
          />

          <label htmlFor="businessName">Business name</label>
          <input
            id="businessName"
            type="text"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            required
          />

          <label htmlFor="businessPhone">Business phone</label>
          <input
            id="businessPhone"
            type="tel"
            value={businessPhone}
            onChange={(event) => setBusinessPhone(event.target.value)}
            autoComplete="tel"
            required
          />

          <label htmlFor="businessAddress">Street address</label>
          <input
            id="businessAddress"
            type="text"
            value={businessAddress}
            onChange={(event) => setBusinessAddress(event.target.value)}
            autoComplete="street-address"
            required
          />

          <label htmlFor="businessCity">City</label>
          <input
            id="businessCity"
            type="text"
            value={businessCity}
            onChange={(event) => setBusinessCity(event.target.value)}
            autoComplete="address-level2"
            required
          />

          <label htmlFor="businessState">State</label>
          <input
            id="businessState"
            type="text"
            value={businessState}
            onChange={(event) =>
              setBusinessState(event.target.value.toUpperCase())
            }
            autoComplete="address-level1"
            maxLength={2}
            placeholder="WI"
            required
          />

          <label htmlFor="businessZip">ZIP code</label>
          <input
            id="businessZip"
            type="text"
            value={businessZip}
            onChange={(event) => setBusinessZip(event.target.value)}
            autoComplete="postal-code"
            inputMode="numeric"
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Creating your business..." : "Create business"}
          </button>
        </form>

        {message && (
          <p className="auth-message" role="alert">
            {message}
          </p>
        )}

        <button
          type="button"
          className="text-button"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
